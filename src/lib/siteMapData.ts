// Site Map data & geometry — the zone layout, grid and hit-testing shared by
// the Dreamland Site Map (jarvis-tracker) and anything else that needs to
// tag a location against the same plan (e.g. the incident/near-miss report
// location picker). Pure data + math, no React — single source of truth so
// the zone coordinates only ever live in one place.
//
// Geometry traced from the official Dreamland Margate site plan, normalised to a
// 1000 x 900 SVG viewBox (north = top). The boundary, roads and car park come
// from the plan; the operational zones (Ingress, Roller Area, Food Court, Scenic
// Stage/Railway, Boneyard, Bars storage, Rides, etc.) are the user's working
// layout for the event build.

export type Pt = [number, number];

// The eastern half sits 190 further out than the traced plan, to give the food
// court the width it has on the ground — its outlets ring a wide oval and were
// unreadable squeezed into the original span.
export const SITE_BOUNDARY: Pt[] = [
  [19, 144], [300, 126], [834, 127], [1043, 465], [1155, 705],
  [896, 858], [610, 773], [290, 674], [64, 386],
];
export const CAR_PARK_POLY: Pt[] = [[616, 220], [834, 127], [1043, 465], [676, 457]];
export const EAST_PARK_POLY: Pt[] = [[838, 470], [1002, 360], [1095, 600], [990, 720], [880, 612]];
export const CLUSTER_POLY: Pt[] = [
  [30, 148], [330, 150], [348, 230], [330, 300], [250, 358], [110, 360], [55, 300], [30, 205],
];

export type ZoneTone = 'area' | 'storage' | 'building';
export interface SiteZone {
  label: string;
  x: number; y: number; w: number; h: number;
  rot?: number;       // box rotation (deg)
  labelRot?: number;  // text rotation (deg) — defaults to rot
  labelSize?: number; // font-size override, for units too small for the default
  labelLines?: string[]; // wrap the label over several lines to fit a narrow box
  shape?: 'ellipse';  // drawn (and hit-tested) as an oval rather than a box
  tone?: ZoneTone;
}

// Working zones, positioned to match the user's marked-up plan.
export const SITE_ZONES: SiteZone[] = [
  // Frontage / peripheral buildings (sit north of the boundary, still clickable)
  { label: 'Cinema', x: 30, y: 44, w: 84, h: 34, tone: 'building' },
  { label: 'Cinque Ports', x: 143, y: 52, w: 84, h: 50, tone: 'building' },
  { label: 'Ballroom', x: 33, y: 146, w: 66, h: 46, tone: 'building' },
  { label: 'Boardroom', x: 33, y: 198, w: 66, h: 34, tone: 'building', labelSize: 6.5 },
  { label: 'Hall by the Sea', x: 52, y: 264, w: 58, h: 82, tone: 'building', labelSize: 7, labelLines: ['Hall by', 'the Sea'] },
  // Operational areas
  { label: 'Concourse', x: 116, y: 240, w: 50, h: 44, tone: 'area', labelSize: 6.5 },
  { label: 'Arcade', x: 170, y: 154, w: 150, h: 46, tone: 'area' },
  { label: 'Ingress', x: 332, y: 154, w: 130, h: 46, tone: 'area' },
  { label: 'Roller Area', x: 170, y: 214, w: 160, h: 56, tone: 'area' },
  { label: 'Transit Area', x: 170, y: 288, w: 200, h: 54, tone: 'area' },
  // Food-court outlets, standing around the rim of the seating oval as on the
  // plan: four along the top, the two Peppermint bars below to the left.
  // Each is 44 x 36 centred on a grid square's middle — small enough that even
  // rotated its corners stay inside that one square, so it never claims a
  // neighbour's — and they're listed *before* the Food Court so a square
  // resolves to the unit standing on it rather than the area around it.
  // These two sit at the steepest angles, so they're a size down again — a
  // 44-wide box swings out of its square past about 10 degrees.
  { label: 'Please Sir', x: 205, y: 360, w: 40, h: 30, rot: -22, tone: 'building', labelSize: 5.5 },
  { label: 'Kerb Bar', x: 255, y: 360, w: 40, h: 30, rot: -16, tone: 'building', labelSize: 5.5 },
  { label: 'Birdie Macs', x: 353, y: 357, w: 44, h: 36, rot: -6, tone: 'building', labelSize: 5.5 },
  { label: 'Beastie Baos', x: 403, y: 357, w: 44, h: 36, rot: 10, tone: 'building', labelSize: 5.2 },
  { label: 'Peppermint Bar', x: 253, y: 557, w: 44, h: 36, tone: 'building', labelSize: 6, labelLines: ['Peppermint', 'Bar'] },
  { label: 'Peppermint Bar', x: 353, y: 557, w: 44, h: 36, tone: 'building', labelSize: 6, labelLines: ['Peppermint', 'Bar'] },
  // The seating area itself is a wide oval on the plan, not a box.
  { label: 'Food Court', x: 230, y: 390, w: 220, h: 180, shape: 'ellipse', tone: 'area' },
  // The two long bars run in line with the stage, one either side of it.
  { label: 'Long Bar (Wheel)', x: 495, y: 270, w: 35, h: 100, tone: 'area', labelRot: -90, labelSize: 6.5 },
  { label: 'Scenic Stage', x: 491, y: 380, w: 44, h: 190, tone: 'area', labelRot: -90 },
  { label: 'Long Bar (Waltzers)', x: 495, y: 580, w: 35, h: 100, tone: 'area', labelRot: -90, labelSize: 6.5 },
  { label: 'Scenic Railway', x: 546, y: 366, w: 60, h: 218, tone: 'area', labelRot: -90 },
  { label: 'Scenic Railway', x: 528, y: 152, w: 62, h: 116, tone: 'area', labelRot: -90 },
  // Nudged east of the long bar that now runs up this side of the stage.
  { label: 'Shed', x: 534, y: 306, w: 84, h: 26, tone: 'area' },
  { label: 'Teddy & Betty / Ark', x: 640, y: 348, w: 62, h: 148, rot: -28, tone: 'area', labelSize: 7, labelLines: ['Teddy & Betty', '/ Ark'] },
  { label: 'VIP', x: 130, y: 390, w: 44, h: 80, rot: -50, tone: 'area' },
  { label: 'Container Toilets', x: 534, y: 600, w: 100, h: 34, tone: 'area', labelSize: 7 },
  // Rides (several pitches share the label). The long diagonal pitch belongs
  // to the western cluster below the food court, so unlike the rest of the
  // east side it doesn't take the +190 shift.
  { label: 'Rides', x: 620, y: 520, w: 80, h: 44, tone: 'area' },
  { label: 'Rides', x: 648, y: 580, w: 54, h: 80, tone: 'area' },
  { label: 'Rides', x: 582, y: 716, w: 92, h: 32, tone: 'area' },
  { label: 'Rides', x: 330, y: 634, w: 128, h: 46, rot: -34, tone: 'area' },
  { label: 'Rides', x: 275, y: 600, w: 50, h: 27, tone: 'area' },
  // Logistics (SE)
  { label: 'Boneyard', x: 850, y: 405, w: 150, h: 388, tone: 'storage' },
  { label: 'Bars storage', x: 695, y: 662, w: 148, h: 126, tone: 'storage' },
];

export function pointInPolygon(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Corner polygon of a (possibly rotated) zone rect, for cell hit-testing.
export function zoneCorners(z: SiteZone): Pt[] {
  const cx = z.x + z.w / 2;
  const cy = z.y + z.h / 2;
  const t = ((z.rot ?? 0) * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const local: Pt[] = [
    [-z.w / 2, -z.h / 2], [z.w / 2, -z.h / 2], [z.w / 2, z.h / 2], [-z.w / 2, z.h / 2],
  ];
  return local.map(([dx, dy]) => [cx + dx * c - dy * s, cy + dx * s + dy * c] as Pt);
}

// Whether a point falls inside a zone, honouring both the box and oval shapes.
export function zoneContains(z: SiteZone, px: number, py: number): boolean {
  const cx = z.x + z.w / 2;
  const cy = z.y + z.h / 2;
  if (z.shape === 'ellipse') {
    const t = ((z.rot ?? 0) * Math.PI) / 180;
    const dx = px - cx;
    const dy = py - cy;
    // Rotate the point into the ellipse's own axes, then the unit-circle test.
    const lx = dx * Math.cos(t) + dy * Math.sin(t);
    const ly = -dx * Math.sin(t) + dy * Math.cos(t);
    return (lx / (z.w / 2)) ** 2 + (ly / (z.h / 2)) ** 2 <= 1;
  }
  return pointInPolygon(px, py, zoneCorners(z));
}

export const SITE_FEATURES: { label: string; zone: SiteZone; poly: Pt[]; cx: number; cy: number }[] =
  SITE_ZONES.map((z) => ({ label: z.label, zone: z, poly: zoneCorners(z), cx: z.x + z.w / 2, cy: z.y + z.h / 2 }));

// The named places a task (or incident report) can be pinned to where there's
// no map to click. Grid references stay map-only — there are hundreds of them
// and they mean nothing in a dropdown.
export const SITE_AREA_NAMES: string[] = Array.from(new Set(SITE_ZONES.map((z) => z.label))).sort();

// 50 x 50 squares. Fine enough that each food-court unit gets a square of its
// own — a coarser grid lumped several of them into one.
export const MAP_W = 1300;
export const MAP_H = 900;
export const GRID_COLS = 26;
export const GRID_ROWS = 18;
export const CELL_W = MAP_W / GRID_COLS;
export const CELL_H = MAP_H / GRID_ROWS;
export const COL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface GridCell {
  col: number; row: number; ref: string;
  x: number; y: number; cx: number; cy: number;
  inside: boolean; landmark: string | null; areaKey: string;
}
export const SITE_CELLS: GridCell[] = (() => {
  const cells: GridCell[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const x = col * CELL_W;
      const y = row * CELL_H;
      const cx = x + CELL_W / 2;
      const cy = y + CELL_H / 2;
      // Resolve which zone a square belongs to. Pass 1: cell centre sits inside
      // a zone (handles normal-sized zones). Pass 2: the zone's centre or a
      // corner falls inside this square — this catches thin/small zones (Shed,
      // Container Toilets, the frontage Cinema / Cinque Ports) whose overlapping
      // square has its centre just outside the box. Array order breaks ties.
      const inCell = (px: number, py: number) => px >= x && px <= x + CELL_W && py >= y && py <= y + CELL_H;
      const landmark =
        SITE_FEATURES.find((f) => zoneContains(f.zone, cx, cy))?.label ??
        SITE_FEATURES.find((f) => inCell(f.cx, f.cy))?.label ??
        // Corner fallback only applies to boxes — an oval's bounding corners
        // aren't part of it, and would claim squares well outside the shape.
        SITE_FEATURES.find((f) => f.zone.shape !== 'ellipse' && f.poly.some(([px, py]) => inCell(px, py)))?.label ??
        null;
      // A square is clickable if it's inside the site boundary OR over a named zone.
      const inside = pointInPolygon(cx, cy, SITE_BOUNDARY) || landmark !== null;
      const ref = `${COL_LETTERS[col]}${row + 1}`;
      cells.push({ col, row, ref, x, y, cx, cy, inside, landmark, areaKey: landmark ?? `Grid ${ref}` });
    }
  }
  return cells;
})();

// SVG palette (kept in the black & red INVICTUS theme).
// Colours are driven by the app's theme tokens (not literal hex) so the map
// automatically flips — dark HUD tones in dark mode, calm neutrals in light
// mode — instead of staying a fixed near-black/red graphic in both themes.
export const MAP_C = {
  accent: 'rgb(var(--invictus-crimson-bright))',
  line: 'rgb(var(--invictus-crimson-bright) / 0.14)',
  lineStrong: 'rgb(var(--invictus-crimson-bright) / 0.30)',
  boundaryFill: 'rgb(var(--invictus-surface))',
  passive: 'rgb(var(--invictus-raised))',
  passiveStroke: 'rgb(var(--invictus-crimson-bright) / 0.16)',
  green: 'rgb(16 185 129 / 0.10)',
  greenStroke: 'rgb(16 185 129 / 0.28)',
  label: 'hsl(var(--foreground))',
  labelDim: 'hsl(var(--muted-foreground))',
};

export const ZONE_TONE: Record<ZoneTone, { fill: string; stroke: string; text: string }> = {
  area: { fill: 'rgb(var(--invictus-crimson-bright) / 0.14)', stroke: 'rgb(var(--invictus-crimson-bright) / 0.55)', text: 'hsl(var(--foreground))' },
  storage: { fill: 'rgb(var(--invictus-crimson-bright) / 0.08)', stroke: 'rgb(var(--invictus-crimson-bright) / 0.4)', text: 'hsl(var(--muted-foreground))' },
  building: { fill: 'rgb(var(--invictus-crimson-bright) / 0.22)', stroke: 'rgb(var(--invictus-crimson-bright) / 0.6)', text: 'hsl(var(--foreground))' },
};

export function toPoints(poly: Pt[]): string {
  return poly.map(([x, y]) => `${x},${y}`).join(' ');
}
