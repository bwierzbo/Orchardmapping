'use client';

import { SHEET_FRACTION } from '@/lib/aim-point';

/**
 * The fixed crosshair a tree is aimed with on a touch screen.
 *
 * It does not move: the map is panned underneath it, so the spot being
 * placed is always visible and never under a fingertip. Sits in the middle
 * of the strip the form sheet leaves uncovered, which is the same point
 * `aimPixel` unprojects when Accept is pressed -- one number, two uses, so
 * what is shown and what is saved cannot drift apart.
 */
export default function AimCrosshair() {
  const topPercent = ((1 - SHEET_FRACTION) / 2) * 100;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 z-30 flex justify-center"
      style={{ top: `${topPercent}%`, transform: 'translateY(-50%)' }}
    >
      <svg width="46" height="46" viewBox="0 0 46 46" className="drop-shadow">
        <circle cx="23" cy="23" r="13" fill="none" stroke="white" strokeWidth="3.5" />
        <circle cx="23" cy="23" r="13" fill="none" stroke="currentColor" strokeWidth="2" className="text-flag-600" />
        <line x1="23" y1="1" x2="23" y2="11" stroke="white" strokeWidth="3.5" />
        <line x1="23" y1="1" x2="23" y2="11" stroke="currentColor" strokeWidth="2" className="text-flag-600" />
        <line x1="23" y1="35" x2="23" y2="45" stroke="white" strokeWidth="3.5" />
        <line x1="23" y1="35" x2="23" y2="45" stroke="currentColor" strokeWidth="2" className="text-flag-600" />
        <line x1="1" y1="23" x2="11" y2="23" stroke="white" strokeWidth="3.5" />
        <line x1="1" y1="23" x2="11" y2="23" stroke="currentColor" strokeWidth="2" className="text-flag-600" />
        <line x1="35" y1="23" x2="45" y2="23" stroke="white" strokeWidth="3.5" />
        <line x1="35" y1="23" x2="45" y2="23" stroke="currentColor" strokeWidth="2" className="text-flag-600" />
        <circle cx="23" cy="23" r="2" fill="currentColor" className="text-flag-600" />
      </svg>
    </div>
  );
}
