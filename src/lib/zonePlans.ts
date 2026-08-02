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

// A long shuttered shopping corridor (Main Entrance down to Boardroom
// Entrance) that widens into a second, glass-ceilinged concourse further
// south, on toward the Arcade. Arcade itself isn't modelled yet — just
// referenced by a door and a label, same as Ballroom's Load In treatment for
// a doorway leading somewhere out of scope.
const CC_CORRIDOR_W = 7.7;
const CC_CORRIDOR_D = 35.3;
const CC_LOWER_W = 11.8;
const CC_LOWER_D = 8;
const CC_WIDTH = CC_LOWER_W;
const CC_DEPTH = CC_CORRIDOR_D + CC_LOWER_D;

export const CONCOURSE_PLAN: ZonePlan = {
  zone: 'Concourse',
  width: CC_WIDTH,
  depth: CC_DEPTH,
  rooms: [
    {
      id: 'corridor',
      x0: 0,
      y0: 0,
      x1: CC_CORRIDOR_W,
      y1: CC_CORRIDOR_D,
      height: 3.6,
      floorColor: '#f0ece0',
      // The Main Entrance, roughly centred.
      northSolid: [
        [0, 0.19],
        [0.58, 1],
      ],
      // Two Ballroom Entrance doors and one Boardroom Entrance door through
      // to the zones next door.
      westSolid: [
        [0, 0.182],
        [0.215, 0.408],
        [0.442, 0.776],
        [0.81, 1],
      ],
    },
    {
      id: 'lower',
      x0: 0,
      y0: CC_CORRIDOR_D,
      x1: CC_LOWER_W,
      y1: CC_DEPTH,
      height: 3.6,
      floorColor: '#e8f0f2', // cooler tint for the glass-ceiling section
      // Fully open into the corridor above — one continuous concourse, not
      // a separate room behind its own wall.
      northSolid: [],
    },
  ],
  textLabels: [
    { x: 4, y: 2, text: 'Concourse' },
    { x: 3.2, y: -0.6, text: 'Main Entrance' },
    { x: -3, y: 7, text: 'Ballroom Entrance' },
    { x: -3, y: 15, text: 'Ballroom Entrance' },
    { x: -3, y: 28, text: 'Boardroom Entrance' },
    { x: 6.6, y: 9, text: 'Pinball' },
    { x: 6.6, y: 16, text: 'Pinball' },
    { x: 6.6, y: 22, text: 'Pinball' },
    { x: 6.6, y: 27, text: 'Retail' },
    { x: 10, y: CC_CORRIDOR_D + 3.5, text: 'ATM' },
    { x: 10.8, y: CC_DEPTH - 0.6, text: 'Arcade Entrance' },
  ],
  starterAssets: [
    { type: 'fireExit', name: 'Fire Exit — Main Entrance', x: 3.5 / CC_WIDTH, y: 0.3 / CC_DEPTH, mount: 'floor' },
    { type: 'fireExit', name: 'Fire Exit — Arcade Entrance', x: 10.5 / CC_WIDTH, y: (CC_DEPTH - 0.3) / CC_DEPTH, mount: 'floor' },
    { type: 'emergencyLight', name: 'Emergency Light — West 1', x: 0.3 / CC_WIDTH, y: 4 / CC_DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — West 2', x: 0.3 / CC_WIDTH, y: 10 / CC_DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — West 3', x: 0.3 / CC_WIDTH, y: 16 / CC_DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — West 4', x: 0.3 / CC_WIDTH, y: 22 / CC_DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — West 5', x: 0.3 / CC_WIDTH, y: 28 / CC_DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — West 6', x: 0.3 / CC_WIDTH, y: 33 / CC_DEPTH, mount: 'ceiling' },
  ],
};

// A long, shallow hall — same corridor-like proportions as the Concourse —
// with a row of structural columns down the middle and two carpeted patches
// toward the south wall. The reference plan's right-hand alcove (a small
// pink-shaded jog with a single unlabelled marker) isn't modelled as its own
// room — like the Concourse's matching feature, its purpose isn't clear
// enough from the drawing alone to build with any confidence.
const AR_WIDTH = 33.8;
const AR_DEPTH = 7.5;

export const ARCADE_PLAN: ZonePlan = {
  zone: 'Arcade',
  width: AR_WIDTH,
  depth: AR_DEPTH,
  rooms: [
    {
      id: 'hall',
      label: 'Arcade',
      x0: 0,
      y0: 0,
      x1: AR_WIDTH,
      y1: AR_DEPTH,
      height: 3,
      floorColor: '#f0ece0',
      // Two Fire Exit doors along the north (front) wall.
      northSolid: [
        [0, 0.045],
        [0.075, 0.902],
        [0.932, 1],
      ],
    },
  ],
  floorInsets: [
    { x0: 8, y0: 4, x1: 14, y1: 7.2, color: '#d8cdb0', label: 'Carpeted' },
    { x0: 20, y0: 4, x1: 26, y1: 7.2, color: '#d8cdb0', label: 'Carpeted' },
  ],
  decor: [
    // The row of structural columns down the middle of the hall.
    ...[3, 7, 11, 15, 19, 23, 27, 31].map((x) => ({ x, y: 3.7, size: 0.4, color: '#1f2937' })),
  ],
  starterAssets: [
    { type: 'fireExit', name: 'Fire Exit — West', x: 2 / AR_WIDTH, y: 0.3 / AR_DEPTH, mount: 'floor' },
    { type: 'fireExit', name: 'Fire Exit — East', x: 31 / AR_WIDTH, y: 0.3 / AR_DEPTH, mount: 'floor' },
    { type: 'emergencyLight', name: 'Emergency Light — South 1', x: 4 / AR_WIDTH, y: (AR_DEPTH - 0.3) / AR_DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — South 2', x: 9 / AR_WIDTH, y: (AR_DEPTH - 0.3) / AR_DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — South 3', x: 16 / AR_WIDTH, y: (AR_DEPTH - 0.3) / AR_DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — South 4', x: 21 / AR_WIDTH, y: (AR_DEPTH - 0.3) / AR_DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — South 5', x: 28 / AR_WIDTH, y: (AR_DEPTH - 0.3) / AR_DEPTH, mount: 'ceiling' },
  ],
};

// A tall (7.3m) function hall with a bar annex to the east. The stage, FOH
// control booth, accessible platform, crowd barrier and pillar are all floor-
// level features within the one main volume rather than separate rooms —
// only the Bar gets its own walled room, since it's the one genuinely
// separate space on the reference plan.
const HS_HALL_W = 19.3;
const HS_HALL_D = 20.2 + 2 + 7.2 + 2; // upper floor + barrier gap + stage + LED screen strip
const HS_BAR_W = 5;
const HS_BAR_D = 10;
const HS_WIDTH = HS_HALL_W + HS_BAR_W;
const HS_DEPTH = HS_HALL_D;

export const HALL_BY_THE_SEA_PLAN: ZonePlan = {
  zone: 'Hall by the Sea',
  width: HS_WIDTH,
  depth: HS_DEPTH,
  rooms: [
    {
      id: 'hall',
      label: 'Hall by the Sea',
      x0: 0,
      y0: 0,
      x1: HS_HALL_W,
      y1: HS_HALL_D,
      height: 7.3,
      floorColor: '#f0ece0',
      // A Fire Exit right by the top-of-stairs corner.
      northSolid: [
        [0, 0.05],
        [0.15, 1],
      ],
      // Four more Fire Exits down the west wall, the last one guarded by a
      // crowd barrier.
      westSolid: [
        [0, 0.081],
        [0.11, 0.303],
        [0.334, 0.525],
        [0.557, 0.748],
        [0.78, 1],
      ],
    },
    {
      id: 'bar',
      label: 'Bar',
      x0: HS_HALL_W,
      y0: 0,
      x1: HS_WIDTH,
      y1: HS_BAR_D,
      height: 7.3,
      floorColor: '#ddd0b8',
      // Doorway through from the main hall.
      westSolid: [
        [0, 0.3],
        [0.6, 1],
      ],
      // A Fire Exit of its own.
      northSolid: [
        [0, 0.2],
        [0.5, 1],
      ],
    },
  ],
  floorInsets: [
    { x0: 0.5, y0: 1, x1: 4, y1: 3.5, color: '#e0d8c8' }, // FOH Control
    { x0: 5, y0: 1, x1: 9, y1: 4, color: '#ddd8d0' }, // Accessible Platform
    { x0: 2.5, y0: HS_DEPTH - 8.8, x1: 16.9, y1: HS_DEPTH - 1.6, color: '#c8beac' }, // Stage, 14.4 x 7.2
    { x0: 4, y0: HS_DEPTH - 1.6, x1: 15.4, y1: HS_DEPTH - 0.8, color: '#333333' }, // LED screen
  ],
  decor: [
    // Flight cases / equipment bins, FOH Control and near HBTS Load In.
    { x: 4.3, y: 1.2, size: 0.4, color: '#3b82f6' },
    { x: 4.9, y: 1.2, size: 0.4, color: '#ef4444' },
    { x: 5.5, y: 1.2, size: 0.4, color: '#1f2937' },
    { x: 6.1, y: 1.2, size: 0.4, color: '#eab308' },
    { x: 0.7, y: HS_DEPTH - 5.5, size: 0.4, color: '#3b82f6' },
    { x: 1.3, y: HS_DEPTH - 5.5, size: 0.4, color: '#ef4444' },
    { x: 1.9, y: HS_DEPTH - 5.5, size: 0.4, color: '#1f2937' },
    { x: 2.5, y: HS_DEPTH - 5.5, size: 0.4, color: '#eab308' },
    { x: 12, y: 18, size: 0.6, color: '#4b5563' }, // the Pillar
    // Crowd barrier — a fence line ahead of the stage.
    ...[2, 4, 6, 8, 10, 12, 14, 16].map((x) => ({ x, y: HS_DEPTH - 9.2, size: 0.25, color: '#22c55e' })),
  ],
  textLabels: [
    { x: 1, y: -0.8, text: 'Top of Stairs' },
    { x: 0.5, y: 4.3, text: 'FOH Control' },
    { x: 5, y: 4.8, text: 'Accessible Platform' },
    { x: 12.5, y: 18.9, text: 'Pillar' },
    { x: 1, y: HS_DEPTH - 9.6, text: 'Crowd Barrier' },
    { x: 4, y: HS_DEPTH - 2, text: 'Stage 14.4 x 7.2' },
    { x: 5, y: HS_DEPTH - 0.5, text: 'LED Screen' },
    { x: 5, y: HS_DEPTH + 0.6, text: 'HBTS Load In' },
  ],
  starterAssets: [
    { type: 'fireExit', name: 'Fire Exit — Top of Stairs', x: 0.3 / HS_WIDTH, y: 3 / HS_DEPTH, mount: 'floor' },
    { type: 'fireExit', name: 'Fire Exit — West (upper)', x: 0.3 / HS_WIDTH, y: 10 / HS_DEPTH, mount: 'floor' },
    { type: 'fireExit', name: 'Fire Exit — West (lower)', x: 0.3 / HS_WIDTH, y: 17 / HS_DEPTH, mount: 'floor' },
    { type: 'fireExit', name: 'Fire Exit — with crowd barrier', x: 0.3 / HS_WIDTH, y: 24 / HS_DEPTH, mount: 'floor' },
    { type: 'fireExit', name: 'Fire Exit — Bar', x: (HS_HALL_W + 1.2) / HS_WIDTH, y: 0.3 / HS_DEPTH, mount: 'floor' },
    { type: 'fireExit', name: 'Fire Exit — HBTS Load In', x: 8 / HS_WIDTH, y: (HS_DEPTH - 0.3) / HS_DEPTH, mount: 'floor' },
    { type: 'emergencyLight', name: 'Emergency Light — North 1', x: 5 / HS_WIDTH, y: 0.3 / HS_DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — North 2', x: 15 / HS_WIDTH, y: 0.3 / HS_DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — West', x: 0.3 / HS_WIDTH, y: 13 / HS_DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — East', x: 19 / HS_WIDTH, y: 15 / HS_DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — Stage', x: 9 / HS_WIDTH, y: (HS_DEPTH - 5.5) / HS_DEPTH, mount: 'ceiling' },
    { type: 'emergencyLight', name: 'Emergency Light — South', x: 12 / HS_WIDTH, y: (HS_DEPTH - 0.5) / HS_DEPTH, mount: 'ceiling' },
  ],
};

/** Every zone with a registered floor plan, keyed by its SITE_ZONES label. */
export const ZONE_PLANS: Record<string, ZonePlan> = {
  Ballroom: BALLROOM_PLAN,
  Boardroom: BOARDROOM_PLAN,
  Concourse: CONCOURSE_PLAN,
  Arcade: ARCADE_PLAN,
  'Hall by the Sea': HALL_BY_THE_SEA_PLAN,
};

export function zonePlanFor(zoneLabel: string): ZonePlan | undefined {
  return ZONE_PLANS[zoneLabel];
}
