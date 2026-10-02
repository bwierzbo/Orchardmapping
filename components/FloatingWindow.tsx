'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useCoarsePointer } from '@/lib/use-coarse-pointer';
import {
  clampRect,
  moveRect,
  parseStoredRect,
  rectsEqual,
  resizeRect,
  type ResizeHandle,
  type WindowRect,
} from '@/lib/floating-window';

/**
 * A panel that can be dragged by its header and resized by any edge, the way
 * a window behaves on a desktop.
 *
 * It exists because a panel pinned to one corner covers the very thing it
 * describes: open a tree on the right-hand side of the orchard and the panel
 * sits on top of it. Rather than guess where the user wants it, let them put
 * it somewhere and remember that.
 *
 * Only on a mouse or trackpad. On a touch screen the panel stays the bottom
 * sheet it already was -- dragging a window around a phone is not a gesture
 * anyone wants, and the sheet is the right shape there.
 *
 * The docked position stays in CSS. Nothing switches to inline coordinates
 * until the user actually drags, so the default layout is the same markup it
 * has always been, and `reset` gets back to it by forgetting the rect.
 */

type DragMode = 'move' | ResizeHandle;

interface FloatingWindowProps {
  /** localStorage slot for the remembered position. */
  storageKey: string;
  /** Look and layout that apply however the panel is positioned. */
  className: string;
  /** Position and size defaults, dropped once the user has dragged it. */
  dockedClassName: string;
  role?: string;
  'aria-label'?: string;
  /**
   * The bar the window is dragged by. Rendered first, inside a wrapper that
   * carries the gesture, so the caller's own header markup is untouched.
   */
  header: ReactNode;
  /** Everything below the header: body, footer, whatever the panel holds. */
  children: ReactNode;
}

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * The element's own box in the coordinate space the inline style will use.
 * offsetLeft/Top are measured from the offset parent, which is the map
 * container -- the same origin as `left`/`top`.
 */
function measure(el: HTMLElement): WindowRect {
  return {
    x: el.offsetLeft,
    y: el.offsetTop,
    width: el.offsetWidth,
    height: el.offsetHeight,
  };
}

/**
 * Controls inside the header must keep working.
 *
 * The drag calls preventDefault and captures the pointer, which between them
 * stop the close button's click from ever landing. A gesture that starts on
 * anything clickable is therefore not a gesture.
 */
const INTERACTIVE =
  'button, a, input, select, textarea, label, [role="button"]';

function fromControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE) !== null;
}

/** Which way the cursor should point, per handle. */
const CURSOR: Record<ResizeHandle, string> = {
  n: 'cursor-ns-resize',
  s: 'cursor-ns-resize',
  e: 'cursor-ew-resize',
  w: 'cursor-ew-resize',
  ne: 'cursor-nesw-resize',
  sw: 'cursor-nesw-resize',
  nw: 'cursor-nwse-resize',
  se: 'cursor-nwse-resize',
};

/**
 * Where each grab zone sits. Edges are a thin strip; corners are a square big
 * enough to hit with a trackpad, and come later in the list so they stack on
 * top of the edges they overlap.
 */
const ZONES: { handle: ResizeHandle; className: string }[] = [
  { handle: 'n', className: 'top-0 left-0 right-0 h-1.5' },
  { handle: 's', className: 'bottom-0 left-0 right-0 h-1.5' },
  { handle: 'w', className: 'left-0 top-0 bottom-0 w-1.5' },
  { handle: 'e', className: 'right-0 top-0 bottom-0 w-1.5' },
  { handle: 'nw', className: 'top-0 left-0 w-3.5 h-3.5' },
  { handle: 'ne', className: 'top-0 right-0 w-3.5 h-3.5' },
  { handle: 'sw', className: 'bottom-0 left-0 w-3.5 h-3.5' },
  { handle: 'se', className: 'bottom-0 right-0 w-3.5 h-3.5' },
];

export default function FloatingWindow({
  storageKey,
  className,
  dockedClassName,
  role = 'dialog',
  'aria-label': ariaLabel,
  header,
  children,
}: FloatingWindowProps) {
  const coarse = useCoarsePointer();
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{
    mode: DragMode;
    pointerId: number;
    startX: number;
    startY: number;
    from: WindowRect;
  } | null>(null);

  // Read straight out of storage on the first render. An effect would paint
  // the docked position first and then jump.
  const [rect, setRect] = useState<WindowRect | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return parseStoredRect(window.localStorage.getItem(storageKey));
    } catch {
      return null;
    }
  });

  const positioned = !coarse && rect !== null;

  /**
   * Keep the panel reachable: once on mount, then on every browser resize.
   *
   * The mount pass matters because a position remembered from a wider monitor
   * would otherwise restore off screen, into a container that clips -- the
   * panel would simply not be there. Deferred to an animation frame so this
   * is a callback and not a setState in an effect body.
   */
  useEffect(() => {
    if (coarse) return;
    const fix = () => {
      const el = ref.current;
      if (!el) return;
      const vp = viewport();
      setRect((prev) => {
        if (prev) {
          const fixed = clampRect(prev, vp);
          return rectsEqual(fixed, prev) ? prev : fixed;
        }
        // Still docked by CSS. Only take over the position if the default
        // does not fit, otherwise leave the stylesheet in charge.
        const box = measure(el);
        const fixed = clampRect(box, vp);
        return rectsEqual(fixed, box) ? null : fixed;
      });
    };
    const frame = requestAnimationFrame(fix);
    window.addEventListener('resize', fix);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', fix);
    };
  }, [coarse]);

  /**
   * One handler for the header and all eight grab zones, told apart by a data
   * attribute on the element rather than by a closure built per zone.
   *
   * Building the handlers during render -- `begin('move')`, `begin('se')` --
   * is what the React compiler objects to, since each closure reads a ref.
   * Reading the mode off the element at event time keeps the props object
   * stable and the rule satisfied, and costs nothing.
   */
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (coarse || e.button !== 0) return;
      if (fromControl(e.target)) return;
      const el = ref.current;
      if (!el) return;
      // The map underneath pans on pointer drags; it must not see this one.
      e.preventDefault();
      e.stopPropagation();
      const from = rect ?? measure(el);
      drag.current = {
        mode: (e.currentTarget.dataset.dragMode as DragMode) ?? 'move',
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        from,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      // Materialise the current box so the inline style takes over mid-drag
      // from exactly where CSS had it, with no jump.
      setRect(from);
    },
    [coarse, rect],
  );

  /** The rect a pointer position implies, given the drag in progress. */
  const rectFor = (e: ReactPointerEvent<HTMLElement>): WindowRect | null => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return null;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const vp = viewport();
    return d.mode === 'move'
      ? moveRect(d.from, dx, dy, vp)
      : resizeRect(d.from, d.mode, dx, dy, vp);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const next = rectFor(e);
    if (next) setRect(next);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const next = rectFor(e);
    drag.current = null;
    if (!next) return;
    setRect(next);
    // Written on release rather than per frame; a drag is hundreds of moves.
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Private browsing, or storage full. The position just will not persist.
    }
  };

  const dragProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    style: { touchAction: 'none' as const },
  };

  const reset = useCallback(() => {
    drag.current = null;
    setRect(null);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Nothing was stored, nothing to clear.
    }
  }, [storageKey]);

  const resetOnDoubleClick = useCallback(
    (e: ReactMouseEvent<HTMLElement>) => {
      if (fromControl(e.target)) return;
      reset();
    },
    [reset],
  );

  return (
    <div
      ref={ref}
      role={role}
      aria-label={ariaLabel}
      className={`${className} ${positioned ? '' : dockedClassName}`}
      style={
        positioned
          ? {
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
            }
          : undefined
      }
    >
      {coarse ? (
        header
      ) : (
        <div
          {...dragProps}
          data-drag-mode="move"
          // A titlebar resets on a double-click everywhere else, so there is
          // no chrome to add here and nothing for the caller to wire up.
          onDoubleClick={resetOnDoubleClick}
          title={
            positioned
              ? 'Drag to move \u00b7 pull an edge to resize \u00b7 double-click to reset'
              : 'Drag to move \u00b7 pull an edge to resize'
          }
          className="cursor-move select-none"
        >
          {header}
        </div>
      )}

      {children}

      {!coarse &&
        ZONES.map(({ handle, className: zone }) => (
          <div
            key={handle}
            // Decoration to a screen reader: dragging an edge is a pointer
            // affordance, and nothing here is reachable or useful without one.
            aria-hidden
            className={`absolute z-10 ${zone} ${CURSOR[handle]}`}
            data-drag-mode={handle}
            {...dragProps}
          />
        ))}
    </div>
  );
}
