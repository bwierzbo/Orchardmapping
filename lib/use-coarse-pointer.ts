'use client';

import { useSyncExternalStore } from 'react';

/**
 * True when the primary input is a fingertip.
 *
 * Decides how a tree is placed: a fingertip aims a crosshair by panning the
 * map, because a finger on a small screen covers the very spot it is
 * placing. A mouse drops a pin where it clicks and nudges it from there.
 * The same signal splits the toolbar between what is done on foot and what
 * wants a desk.
 *
 * Subscribed to rather than copied into state: matchMedia is an external
 * store, and reading it through an effect would render once with the wrong
 * answer and lay out the whole toolbar twice.
 */

const QUERY = '(pointer: coarse)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia(QUERY);
  // A tablet gaining or losing a trackpad changes this mid-session.
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

/** The server cannot know; a mouse is the safe guess for markup. */
function getServerSnapshot(): boolean {
  return false;
}

export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
