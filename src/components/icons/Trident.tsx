import React from 'react';

// Lucide ships no trident glyph, so this hand-drawn outline fills in using the
// same stroke conventions (24x24 viewBox, round caps/joins) as the rest of
// the icon set, wrapped in forwardRef so it structurally matches lucide's
// component shape and drops in anywhere a lucide icon would.
// Each prong is drawn twice: a thicker dark red pass underneath gives the
// bright red linework a thin outline so it stays legible against dark or
// busy backgrounds.
const PRONGS = (
  <>
    <path d="M12 20V10" />
    <path d="M7 10h10" />
    <path d="M7 10 4 3" />
    <path d="M12 10V2" />
    <path d="M17 10 20 3" />
  </>
);

export const Trident = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  function Trident(props, ref) {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        <g stroke="#5C1420" strokeWidth={3.4}>
          {PRONGS}
        </g>
        <g stroke="currentColor" strokeWidth={2}>
          {PRONGS}
        </g>
      </svg>
    );
  }
);
