'use client';

// The Site Status map: the same site drawn from the same SITE_ZONES as the
// Site Map page, but read-only and tuned for being looked at from across a
// room. No grid, no squares, no task badges, no zoom — everything that
// isn't out of use is deliberately knocked back so the closures are the
// only thing with any colour in them.

import React from 'react';
import {
  CAR_PARK_POLY,
  CLUSTER_POLY,
  EAST_PARK_POLY,
  MAP_C,
  MAP_H,
  MAP_W,
  SITE_BOUNDARY,
  SITE_ZONES,
  toPoints,
  type SiteZone,
} from '@/lib/siteMapData';

// Out-of-use red, and the muted tone everything else drops to. Fixed rgb
// rather than theme tokens for the closed state: this has to read as a
// warning from the back of a room in either theme.
const CLOSED = {
  fill: 'rgb(255 59 78 / 0.34)',
  stroke: 'rgb(255 99 115 / 0.95)',
  text: 'rgb(255 236 238)',
  hatch: 'rgb(255 99 115 / 0.55)',
};
const OPEN = {
  fill: 'rgb(var(--invictus-raised) / 0.75)',
  stroke: 'rgb(var(--invictus-crimson-bright) / 0.18)',
  text: 'hsl(var(--muted-foreground))',
};

function zoneShape(z: SiteZone, i: number, closed: boolean, keyPrefix: string) {
  const cx = z.x + z.w / 2;
  const cy = z.y + z.h / 2;
  const transform = z.rot ? `rotate(${z.rot} ${cx} ${cy})` : undefined;
  const tone = closed ? CLOSED : OPEN;
  const common = {
    fill: tone.fill,
    stroke: tone.stroke,
    strokeWidth: closed ? 2.4 : 1,
    transform,
  };
  return z.shape === 'ellipse' ? (
    <ellipse key={`${keyPrefix}-${i}`} cx={cx} cy={cy} rx={z.w / 2} ry={z.h / 2} {...common} />
  ) : (
    <rect key={`${keyPrefix}-${i}`} x={z.x} y={z.y} width={z.w} height={z.h} rx={2} {...common} />
  );
}

export function SiteStatusMap({
  closedAreas,
  className,
}: {
  /** SITE_ZONES labels that are out of use on the day being shown. */
  closedAreas: Set<string>;
  className?: string;
}) {
  // Enclosing areas first so the units standing inside one (the food-court
  // outlets) aren't painted over by it — same ordering trick as the Site Map.
  const ordered = [...SITE_ZONES.entries()].sort(
    ([, a], [, b]) => (a.tone === 'building' ? 1 : 0) - (b.tone === 'building' ? 1 : 0)
  );

  return (
    <svg
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      // The caller sets the height: h-auto when the page scrolls, h-full in
      // display mode so a 16:9 screen letterboxes the map (preserveAspectRatio
      // defaults to xMidYMid meet) instead of cropping the east of the site.
      className={`w-full select-none ${className ?? 'h-auto'}`}
      role="img"
      aria-label="Site status map — areas out of use are marked in red"
    >
      <defs>
        {/* Diagonal hatch over a closed area, so it reads as shut even to
            someone who can't pick the red out from the fill. */}
        <pattern id="closed-hatch" width={10} height={10} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={10} stroke={CLOSED.hatch} strokeWidth={3} />
        </pattern>
      </defs>

      <polygon
        points={toPoints(SITE_BOUNDARY)}
        fill={MAP_C.boundaryFill}
        stroke={MAP_C.accent}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Passive context — car parks and the green, drawn flat. */}
      <polygon points={toPoints(CAR_PARK_POLY)} fill={MAP_C.passive} stroke={MAP_C.passiveStroke} strokeWidth={1} />
      <polygon points={toPoints(EAST_PARK_POLY)} fill={MAP_C.green} stroke={MAP_C.greenStroke} strokeWidth={1} />
      <polygon points={toPoints(CLUSTER_POLY)} fill={MAP_C.passive} stroke={MAP_C.passiveStroke} strokeWidth={1} />

      {/* Zones, then the hatch over just the closed ones. */}
      {ordered.map(([i, z]) => zoneShape(z, i, closedAreas.has(z.label), 'zone'))}
      {ordered
        .filter(([, z]) => closedAreas.has(z.label))
        .map(([i, z]) => {
          const cx = z.x + z.w / 2;
          const cy = z.y + z.h / 2;
          const transform = z.rot ? `rotate(${z.rot} ${cx} ${cy})` : undefined;
          return z.shape === 'ellipse' ? (
            <ellipse
              key={`hatch-${i}`}
              cx={cx}
              cy={cy}
              rx={z.w / 2}
              ry={z.h / 2}
              fill="url(#closed-hatch)"
              stroke="none"
              transform={transform}
            />
          ) : (
            <rect
              key={`hatch-${i}`}
              x={z.x}
              y={z.y}
              width={z.w}
              height={z.h}
              rx={2}
              fill="url(#closed-hatch)"
              stroke="none"
              transform={transform}
            />
          );
        })}

      {/* Roads */}
      <line x1={19} y1={132} x2={834} y2={114} stroke="rgba(180,180,190,0.22)" strokeWidth={3} />
      <line x1={834} y1={127} x2={1155} y2={520} stroke="rgba(180,180,190,0.22)" strokeWidth={3} />

      {/* Zone labels. A closed zone's label is drawn brighter and bolder, and
          every open one is dimmed, so the eye goes straight to the closures. */}
      <g fontFamily="inherit" textAnchor="middle" style={{ textTransform: 'uppercase' }}>
        {SITE_ZONES.map((z, i) => {
          const closed = closedAreas.has(z.label);
          const cx = z.x + z.w / 2;
          const cy = z.y + z.h / 2;
          const lr = z.labelRot ?? z.rot ?? 0;
          const fs = z.labelSize ?? (z.w < 78 || z.h < 32 ? 7.5 : 9);
          const lines = z.labelLines ?? [z.label];
          const top = cy + (z.labelSize ? 2 : 3) - ((lines.length - 1) * fs * 1.15) / 2;
          return (
            <text
              key={`lbl-${i}`}
              x={cx}
              y={top}
              fontSize={fs}
              fontWeight={closed ? 800 : 600}
              letterSpacing={z.labelSize ? 0.2 : 0.5}
              fill={closed ? CLOSED.text : OPEN.text}
              opacity={closed ? 1 : 0.65}
              transform={lr ? `rotate(${lr} ${cx} ${cy})` : undefined}
            >
              {lines.map((line, li) => (
                <tspan key={li} x={cx} dy={li === 0 ? 0 : fs * 1.15}>
                  {line}
                </tspan>
              ))}
            </text>
          );
        })}
      </g>
    </svg>
  );
}
