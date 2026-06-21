import React from 'react';
import { cn } from '@/lib/utils';

// Eight twisted triangular blades fanned around the center, like a
// camera-shutter pinwheel — replaces the old trident as the brand mark.
// Spins clockwise by default everywhere it's dropped in; pass a className
// with a different `animate-*` utility (or none) to override the spin.
const BLADE_COUNT = 8;
const CENTER = 12;
const INNER_RADIUS = 2.4;
const OUTER_RADIUS = 10.6;
const HALF_WIDTH_DEG = 13;
const TWIST_DEG = 18;

function bladePoint(radius: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  const x = CENTER + radius * Math.sin(rad);
  const y = CENTER - radius * Math.cos(rad);
  return `${x.toFixed(2)},${y.toFixed(2)}`;
}

function bladePolygon(centerAngle: number) {
  const inner = bladePoint(INNER_RADIUS, centerAngle - TWIST_DEG);
  const outerA = bladePoint(OUTER_RADIUS, centerAngle - HALF_WIDTH_DEG);
  const outerB = bladePoint(OUTER_RADIUS, centerAngle + HALF_WIDTH_DEG);
  return `${inner} ${outerA} ${outerB}`;
}

const BLADE_ANGLES = Array.from({ length: BLADE_COUNT }, (_, i) => (360 / BLADE_COUNT) * i);

export const Pinwheel = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  function Pinwheel({ className, ...props }, ref) {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={cn('animate-[spin_6s_linear_infinite]', className)}
        {...props}
      >
        {BLADE_ANGLES.map((angle) => (
          <polygon key={angle} points={bladePolygon(angle)} />
        ))}
      </svg>
    );
  }
);
