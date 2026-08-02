// Hand-authored zone floor plans for the site map's drill-down view (see
// components/ZoneFloorPlan.tsx). Each plan is bespoke — traced from the
// building's own architect's drawing — so this is a small, growable registry
// rather than anything generated.
//
// Coordinates are in real-world metres, x eastward from the plan's west edge,
// y southward from its north edge. Rooms render "dollhouse" style (see
// isometric.ts) — only their north and west walls are drawn solid, split
// into segments so a doorway can leave a gap in the middle of one.

import type { AssetMount, AssetType } from '@/lib/assets';

export interface PlanRoom {
  id: string;
  label?: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  height: number; // wall height, metres
  floorColor: string;
  // Solid stretches of the north/west walls, as [start, end] fractions along
  // that wall (0–1). Gaps between stretches are doorways. Defaults to a full,
  // unbroken wall when omitted.
  northSolid?: [number, number][];
  westSolid?: [number, number][];
}

export interface PlanFloorInset {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  label?: string;
}

export interface PlanDecor {
  x: number;
  y: number;
  size: number;
  color: string;
}

export interface PlanTextLabel {
  x: number;
  y: number;
  text: string;
}

export interface StarterAsset {
  type: AssetType;
  name: string;
  x: number; // 0–1, normalised over the plan's full width/depth
  y: number;
  mount: AssetMount;
}

export interface ZonePlan {
  zone: string; // matches a SITE_ZONES label
  width: number; // total plan width, metres — the x normalisation base
  depth: number; // total plan depth, metres — the y normalisation base
  rooms: PlanRoom[];
  floorInsets?: PlanFloorInset[];
  decor?: PlanDecor[];
  textLabels?: PlanTextLabel[];
  starterAssets: StarterAsset[];
}

const WIDTH = 17.2;
const BOH_DEPTH = 5.5; // back-of-house strip along the north edge
const HALL_DEPTH = 20.25;
const DEPTH = BOH_DEPTH + HALL_DEPTH;

export const BALLROOM_PLAN: ZonePlan = {
  zone: 'Ballroom',
  width: WIDTH,
  depth: DEPTH,
  rooms: [
    { id: 'storage', label: 'Storage', x0: 0, y0: 0, x1: 6.2, y1: BOH_DEPTH, height: 3, floorColor: '#d9c9a3' },
    {
      id: 'backRoom',
      x0: 6.2,
      y0: 0,
      x1: 13.5,
      y1: BOH_DEPTH,
      height: 3,
      floorColor: '#d9c9a3',
      // Doorway through to Storage.
      westSolid: [
        [0, 0.3],
        [0.5, 1],
      ],
    },
    {
      id: 'loadIn',
      label: 'Load In',
      x0: 13.5,
      y0: 0,
      x1: WIDTH,
      y1: BOH_DEPTH,
      height: 3,
      floorColor: '#c7b89a',
      // Wide external doorway on the north (exterior) edge for deliveries.
      northSolid: [
        [0, 0.48],
        [0.88, 1],
      ],
    },
    {
      id: 'mainHall',
      label: 'Ballroom',
      x0: 0,
      y0: BOH_DEPTH,
      x1: WIDTH,
      y1: DEPTH,
      height: 3.8,
      floorColor: '#f5f1e6',
      // Two internal doorways from the back-of-house rooms (Storage, Back
      // Room) into the hall.
      northSolid: [
        [0, 0.14],
        [0.22, 0.52],
        [0.62, 1],
      ],
      // One doorway near the south end, toward the toilets.
      westSolid: [
        [0, 0.88],
        [0.95, 1],
      ],
    },
  ],
  floorInsets: [
    { x0: 5, y0: BOH_DEPTH + 0.7, x1: 12.5, y1: BOH_DEPTH + 4, color: '#e8ddc0', label: 'Wooden Floor' },
    { x0: 5, y0: DEPTH - 4.75, x1: 12.5, y1: DEPTH - 1.75, color: '#e8ddc0', label: 'Wooden Floor' },
  ],
  decor: [
    // The stacked bins visible in the reference plan's storage room.
    { x: 1, y: 4.2, size: 0.55, color: '#3b82f6' },
    { x: 1.7, y: 4.2, size: 0.55, color: '#1f2937' },
    { x: 2.4, y: 4.2, size: 0.55, color: '#ef4444' },
    { x: 3.1, y: 4.2, size: 0.55, color: '#eab308' },
  ],
  textLabels: [
    { x: 15.4, y: -0.6, text: 'Load In' },
    { x: 1.6, y: DEPTH - 1.1, text: 'Access to Toilets' },
  ],
  starterAssets: [
    { type: 'fireExit', name: 'Fire Exit — North (by wooden floor)', x: 11 / WIDTH, y: (BOH_DEPTH + 0.8) / DEPTH, mount: 'floor' },
    { type: 'fireExit', name: 'Fire Exit — East wall (upper)', x: 16.9 / WIDTH, y: (BOH_DEPTH + 4.5) / DEPTH, mount: 'floor' },
    { type: 'fireExit', name: 'Fire Exit — East wall (lower)', x: 16.9 / WIDTH, y: (BOH_DEPTH + 12.5) / DEPTH, mount: 'floor' },
    { type: 'fireExit', name: 'Fire Exit — South (near toilets)', x: 6 / WIDTH, y: (DEPTH - 0.8) / DEPTH, mount: 'floor' },
    { type: 'emergencyLight', name: 'Emergency Light — North 1', x: 3 / WIDTH, y: (BOH_DEPTH + 0.3) / DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — North 2', x: 14 / WIDTH, y: (BOH_DEPTH + 0.3) / DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — South 1', x: 4 / WIDTH, y: (DEPTH - 0.3) / DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — South 2', x: 13 / WIDTH, y: (DEPTH - 0.3) / DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — West 1', x: 0.3 / WIDTH, y: (BOH_DEPTH + 4.5) / DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — West 2', x: 0.3 / WIDTH, y: (BOH_DEPTH + 14.5) / DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — East 1', x: 16.9 / WIDTH, y: (BOH_DEPTH + 2.5) / DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — East 2', x: 16.9 / WIDTH, y: (BOH_DEPTH + 10.5) / DEPTH, mount: 'ceiling' },
  ],
};

// A single room split by a folding partition into the main Boardroom and a
// narrower strip leading to its entrance.
const BR_MAIN_W = 13.8;
const BR_STRIP_W = 3;
const BR_WIDTH = BR_MAIN_W + BR_STRIP_W;
const BR_DEPTH = 6.2;

export const BOARDROOM_PLAN: ZonePlan = {
  zone: 'Boardroom',
  width: BR_WIDTH,
  depth: BR_DEPTH,
  rooms: [
    { id: 'main', label: 'Boardroom', x0: 0, y0: 0, x1: BR_MAIN_W, y1: BR_DEPTH, height: 3, floorColor: '#f5f1e6' },
    {
      id: 'entrance',
      x0: BR_MAIN_W,
      y0: 0,
      x1: BR_WIDTH,
      y1: BR_DEPTH,
      height: 3,
      floorColor: '#e8ddc0',
      // Its west wall IS the folding partition — solid throughout, since a
      // folding partition is normally closed.
    },
  ],
  floorInsets: [
    { x0: 0.6, y0: 0.4, x1: 5, y1: 2.3, color: '#e8ddc0', label: 'Wooden Floor' },
    { x0: 0.6, y0: 4.2, x1: 5, y1: 5.9, color: '#e8ddc0', label: 'Wooden Floor' },
  ],
  decor: [
    // The small fitted unit visible on the reference plan's west wall.
    { x: 0.5, y: 0.9, size: 0.6, color: '#94a3b8' },
  ],
  textLabels: [
    { x: BR_MAIN_W - 0.3, y: 2.6, text: 'Folding Partition' },
    { x: BR_MAIN_W + 0.4, y: BR_DEPTH - 0.6, text: 'Boardroom Entrance' },
  ],
  starterAssets: [
    { type: 'emergencyLight', name: 'Emergency Light — North 1', x: 2.5 / BR_WIDTH, y: 0.3 / BR_DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — North 2', x: (BR_MAIN_W + 1.2) / BR_WIDTH, y: 0.3 / BR_DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — South', x: 9 / BR_WIDTH, y: (BR_DEPTH - 0.3) / BR_DEPTH, mount: 'ceiling' },
    { type: 'fireExit', name: 'Fire Exit — South-west', x: 1.5 / BR_WIDTH, y: (BR_DEPTH - 0.3) / BR_DEPTH, mount: 'floor' },
  ],
};

/** Every zone with a registered floor plan, keyed by its SITE_ZONES label. */
export const ZONE_PLANS: Record<string, ZonePlan> = {
  Ballroom: BALLROOM_PLAN,
  Boardroom: BOARDROOM_PLAN,
};

export function zonePlanFor(zoneLabel: string): ZonePlan | undefined {
  return ZONE_PLANS[zoneLabel];
}
