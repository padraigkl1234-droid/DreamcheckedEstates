// Lightweight 2.5D isometric projection for zone floor plans (see
// zonePlans.ts and components/ZoneFloorPlan.tsx). Plans are authored in
// real-world metres; this projects (x, y, z) plan coordinates onto flat SVG
// screen coordinates using a true 30° isometric transform — enough depth to
// read as a room, without the cost of an actual 3D engine.
//
// Rooms render "dollhouse" style: only the two walls furthest from the
// viewer (north and west, the ones meeting at a room's (x0, y0) corner) are
// drawn solid. The near two are left open so the floor and its pins stay
// visible, exactly like an isometric interior view in a game or floor-plan
// tool.

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = Math.sin(Math.PI / 6);

// Pixels per metre — the one knob that scales an entire plan up or down.
export const ISO_UNIT = 34;

export interface IsoPoint {
  x: number;
  y: number;
}

/** Projects a metric (x, y, z) plan point to screen space. z is height above
 * the floor, positive-up. */
export function project(x: number, y: number, z = 0): IsoPoint {
  const px = x * ISO_UNIT;
  const py = y * ISO_UNIT;
  const pz = z * ISO_UNIT;
  return {
    x: (px - py) * COS30,
    y: (px + py) * SIN30 - pz,
  };
}

/** Inverts `project(x, y, 0)` — given a screen point known to sit on the
 * floor plane, recovers its (x, y) plan coordinates in metres. Used to turn
 * a click into "where on the floor was that". */
export function unprojectFloor(screenX: number, screenY: number): { x: number; y: number } {
  const a = screenX / (ISO_UNIT * COS30); // x - y
  const b = screenY / (ISO_UNIT * SIN30); // x + y
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

export function polygonPoints(points: IsoPoint[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

/** The floor polygon of an axis-aligned room [x0,y0]–[x1,y1]. */
export function floorPolygon(x0: number, y0: number, x1: number, y1: number): IsoPoint[] {
  return [project(x0, y0), project(x1, y0), project(x1, y1), project(x0, y1)];
}

/** One vertical wall face running from (ax,ay) to (bx,by), height h. */
export function wallPolygon(ax: number, ay: number, bx: number, by: number, h: number): IsoPoint[] {
  return [project(ax, ay, 0), project(bx, by, 0), project(bx, by, h), project(ax, ay, h)];
}

/** Builds one wall side's solid sub-segments, given its plan endpoints and a
 * list of [start, end] fractions (0–1) to keep solid — the gaps between them
 * are doorways. Defaults to one unbroken segment spanning the whole wall. */
export function wallSegmentPolygons(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  h: number,
  solid: [number, number][] = [[0, 1]]
): IsoPoint[][] {
  return solid.map(([s, e]) => {
    const sx = ax + (bx - ax) * s;
    const sy = ay + (by - ay) * s;
    const ex = ax + (bx - ax) * e;
    const ey = ay + (by - ay) * e;
    return wallPolygon(sx, sy, ex, ey, h);
  });
}

/** A rectangular room's two solid (back) walls — north and west — the ones
 * that meet at its (x0, y0) corner, which projects to the top of the room's
 * diamond. Doors are cut into these as gaps by the caller (see zonePlans.ts). */
export function roomWalls(x0: number, y0: number, x1: number, y1: number, h: number) {
  return {
    north: wallPolygon(x0, y0, x1, y0, h),
    west: wallPolygon(x0, y0, x0, y1, h),
  };
}

// Fixed pseudo-lighting so every room reads consistently: the floor is
// lightest (catching the most light), the west wall darkest.
export const ISO_SHADE = {
  floor: 1,
  north: 0.82,
  west: 0.62,
};

/** Mixes `hex` toward black by (1 - shade), e.g. shade 0.62 keeps 62% of the
 * original colour. Cheap stand-in for real lighting. */
export function shadeColor(hex: string, shade: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.round(((n >> 16) & 0xff) * shade);
  const g = Math.round(((n >> 8) & 0xff) * shade);
  const b = Math.round((n & 0xff) * shade);
  return `rgb(${r}, ${g}, ${b})`;
}
