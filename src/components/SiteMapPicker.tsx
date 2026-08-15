'use client';

// A compact, click-to-select version of the Dreamland Site Map — used
// anywhere a location needs tagging against the same plan (currently the
// incident/near-miss report form) without the full tracker's zoom/pan/task
// overlays. Selecting a square returns its areaKey — the exact same string
// Task Manager already stores for a task's location (a named zone like
// "Scenic Stage", or "Grid F12" for open ground) — so a location picked here
// lines up with the rest of the app's site-map data.

import React, { useState } from 'react';
import {
  CAR_PARK_POLY,
  CELL_H,
  CELL_W,
  CLUSTER_POLY,
  EAST_PARK_POLY,
  MAP_C,
  MAP_H,
  MAP_W,
  SITE_BOUNDARY,
  SITE_CELLS,
  SITE_ZONES,
  ZONE_TONE,
  toPoints,
  type GridCell,
} from '@/lib/siteMapData';

export function SiteMapPicker({
  value,
  onChange,
  className = '',
}: {
  value?: string | null; // currently selected areaKey
  onChange: (cell: GridCell) => void;
  className?: string;
}) {
  const [hoverRef, setHoverRef] = useState<string | null>(null);

  return (
    <div className={`overflow-hidden rounded-lg border border-neutral-400/25 bg-invictus-base/40 ${className}`}>
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="block w-full select-none" role="img" aria-label="Dreamland site map — tap a square to set the location">
        <polygon points={toPoints(SITE_BOUNDARY)} fill={MAP_C.boundaryFill} stroke={MAP_C.accent} strokeWidth={2} strokeLinejoin="round" />
        <polygon points={toPoints(CAR_PARK_POLY)} fill={MAP_C.passive} stroke={MAP_C.passiveStroke} strokeWidth={1} />
        <polygon points={toPoints(EAST_PARK_POLY)} fill={MAP_C.green} stroke={MAP_C.greenStroke} strokeWidth={1} />
        <polygon points={toPoints(CLUSTER_POLY)} fill={MAP_C.passive} stroke={MAP_C.passiveStroke} strokeWidth={1} />

        {/* Zones */}
        {[...SITE_ZONES]
          .sort((a, b) => (a.tone === 'building' ? 1 : 0) - (b.tone === 'building' ? 1 : 0))
          .map((z, i) => {
            const cx = z.x + z.w / 2;
            const cy = z.y + z.h / 2;
            const tone = ZONE_TONE[z.tone ?? 'area'];
            const transform = z.rot ? `rotate(${z.rot} ${cx} ${cy})` : undefined;
            return z.shape === 'ellipse' ? (
              <ellipse key={`z-${i}`} cx={cx} cy={cy} rx={z.w / 2} ry={z.h / 2} fill={tone.fill} stroke={tone.stroke} strokeWidth={1.2} transform={transform} />
            ) : (
              <rect key={`z-${i}`} x={z.x} y={z.y} width={z.w} height={z.h} rx={2} fill={tone.fill} stroke={tone.stroke} strokeWidth={1.2} transform={transform} />
            );
          })}

        {/* Zone labels */}
        <g fontFamily="inherit" textAnchor="middle" style={{ textTransform: 'uppercase' }} pointerEvents="none">
          {SITE_ZONES.map((z, i) => {
            const cx = z.x + z.w / 2;
            const cy = z.y + z.h / 2;
            const tone = ZONE_TONE[z.tone ?? 'area'];
            const lr = z.labelRot ?? z.rot ?? 0;
            const fs = z.labelSize ?? (z.w < 78 || z.h < 32 ? 7.5 : 9);
            const lines = z.labelLines ?? [z.label];
            const top = cy + (z.labelSize ? 2 : 3) - ((lines.length - 1) * fs * 1.15) / 2;
            return (
              <text key={`zl-${i}`} x={cx} y={top} fontSize={fs} fontWeight={600} letterSpacing={z.labelSize ? 0.2 : 0.5} fill={tone.text} transform={lr ? `rotate(${lr} ${cx} ${cy})` : undefined}>
                {lines.map((line, li) => (
                  <tspan key={li} x={cx} dy={li === 0 ? 0 : fs * 1.15}>
                    {line}
                  </tspan>
                ))}
              </text>
            );
          })}
        </g>

        {/* Clickable grid */}
        {SITE_CELLS.filter((c) => c.inside).map((cell) => {
          const selected = cell.areaKey === value;
          const hovered = cell.ref === hoverRef;
          return (
            <rect
              key={cell.ref}
              x={cell.x}
              y={cell.y}
              width={CELL_W}
              height={CELL_H}
              fill={selected ? 'rgb(var(--invictus-crimson-bright) / 0.5)' : hovered ? 'rgb(var(--invictus-crimson-bright) / 0.22)' : 'rgb(var(--invictus-crimson-bright) / 0.04)'}
              stroke={selected ? MAP_C.accent : MAP_C.lineStrong}
              strokeWidth={selected ? 2 : 0.75}
              className="cursor-pointer"
              onMouseEnter={() => setHoverRef(cell.ref)}
              onMouseLeave={() => setHoverRef((r) => (r === cell.ref ? null : r))}
              onClick={() => onChange(cell)}
            >
              <title>{cell.areaKey}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}
