// The Project Board — a shared pin board for reminders, project notes and
// Capex ideas. Everything on it is visible to the whole team; each note
// belongs to whoever put it up and only they (or a commander) can edit or
// take it down. Anyone can move a note, back it, comment on it, or turn it
// into a task.
//
// Notes carry their own position because the arrangement is the point: a
// real pin board gets used by clustering related things together, and that
// clustering is shared — move a note and everyone sees it move.

export type BoardColour = 'yellow' | 'pink' | 'blue' | 'green' | 'purple' | 'grey';

export interface BoardPhoto {
  url: string;
  path: string;
  /** A small copy for the card, so a board full of photos still scrolls. */
  thumbUrl?: string;
  thumbPath?: string;
}

export interface BoardPost {
  id: string;
  teamId: string;
  title: string;
  body?: string;
  colour: BoardColour;
  /** A free-text label — "Capex", "Winter shutdown", whatever suits. */
  tag?: string;
  /** Position on the board, in board units (see BOARD_W / BOARD_H). */
  x: number;
  y: number;
  /** Stacking order. A note picked up comes to the front. */
  z: number;
  photos?: BoardPhoto[];
  /** uids of everyone backing this one. */
  votes?: string[];
  createdAt: number;
  updatedAt?: number;
  ownerUid: string;
  ownerName: string;
  /** Set once someone turns the note into a task. The note stays on the
   *  board either way — the discussion that led to the job is worth keeping. */
  taskId?: string;
  taskByName?: string;
  taskAt?: number;
}

export interface BoardComment {
  id: string;
  teamId: string;
  postId: string;
  text: string;
  at: number;
  byUid: string;
  byName: string;
}

// ---------------------------------------------------------------------------
// Positions
//
// A note's x/y are FRACTIONS of the board (0 = hard left/top, 1 = hard
// right/bottom), not pixels. That's what lets the board be whatever size the
// screen is: it fills the space available and the arrangement holds its shape
// on a laptop, a monitor and a split window alike, with nothing to scroll to.
//
// The first version stored pixels on a fixed 2400x1600 canvas. Anything
// bigger than 1 is therefore a leftover from that, and is converted on read —
// no migration to run, and those notes land roughly where they were left.
// ---------------------------------------------------------------------------

const LEGACY_BOARD_W = 2400;
const LEGACY_BOARD_H = 1600;

/** A note's width on screen, in pixels. Fixed so the text stays readable
 *  whatever size the board is. */
export const NOTE_W = 210;
/** Nominal card height, used only to keep a note's box inside the board. */
export const NOTE_H = 200;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Where a note sits, as fractions, whichever way it was stored. */
export function postFraction(post: Pick<BoardPost, 'x' | 'y'>): { fx: number; fy: number } {
  const x = post.x ?? 0;
  const y = post.y ?? 0;
  return {
    fx: clamp01(x > 1 ? x / LEGACY_BOARD_W : x),
    fy: clamp01(y > 1 ? y / LEGACY_BOARD_H : y),
  };
}

/** The travel a note actually has, once its own size is accounted for. */
export function travel(area: { w: number; h: number }): { w: number; h: number } {
  return { w: Math.max(1, area.w - NOTE_W), h: Math.max(1, area.h - NOTE_H) };
}

/** Fractions to a pixel offset inside a board of this size. */
export function toPixels(post: Pick<BoardPost, 'x' | 'y'>, area: { w: number; h: number }) {
  const { fx, fy } = postFraction(post);
  const t = travel(area);
  return { left: Math.round(fx * t.w), top: Math.round(fy * t.h) };
}

/** A pixel offset back to fractions, clamped so a note can't leave the board. */
export function toFraction(left: number, top: number, area: { w: number; h: number }) {
  const t = travel(area);
  return { fx: clamp01(left / t.w), fy: clamp01(top / t.h) };
}

export const BOARD_COLOUR_KEYS: BoardColour[] = ['yellow', 'pink', 'blue', 'green', 'purple', 'grey'];

/** Sticky-note tints. Dark text on a light card: a pin board reads as paper
 *  even on the dark INVICTUS surface, and it keeps the notes legible from a
 *  distance the way the rest of the app's panels aren't meant to be. */
export const BOARD_COLOURS: Record<BoardColour, { label: string; card: string; swatch: string; accent: string }> = {
  yellow: { label: 'Yellow', card: 'bg-amber-200 text-neutral-900', swatch: 'bg-amber-200', accent: 'border-amber-400' },
  pink: { label: 'Pink', card: 'bg-rose-200 text-neutral-900', swatch: 'bg-rose-200', accent: 'border-rose-400' },
  blue: { label: 'Blue', card: 'bg-sky-200 text-neutral-900', swatch: 'bg-sky-200', accent: 'border-sky-400' },
  green: { label: 'Green', card: 'bg-emerald-200 text-neutral-900', swatch: 'bg-emerald-200', accent: 'border-emerald-400' },
  purple: { label: 'Purple', card: 'bg-violet-200 text-neutral-900', swatch: 'bg-violet-200', accent: 'border-violet-400' },
  grey: { label: 'Grey', card: 'bg-neutral-200 text-neutral-900', swatch: 'bg-neutral-200', accent: 'border-neutral-400' },
};

export function boardColour(colour: string | undefined) {
  return BOARD_COLOURS[(colour as BoardColour) ?? 'yellow'] ?? BOARD_COLOURS.yellow;
}

/** One above the highest note, so whatever you pick up lands on top. */
export function nextZ(posts: BoardPost[]): number {
  return posts.reduce((max, p) => Math.max(max, p.z ?? 0), 0) + 1;
}

/** Where to drop a new note: near the top-left, stepped diagonally past
 *  anything already there so a run of new notes fans out instead of landing
 *  in a single pile. */
export function newNoteSpot(posts: BoardPost[]): { x: number; y: number } {
  const step = 0.045;
  let fx = 0.02;
  let fy = 0.03;
  for (let i = 0; i < 20; i++) {
    const taken = posts.some((p) => {
      const f = postFraction(p);
      return Math.abs(f.fx - fx) < step * 0.8 && Math.abs(f.fy - fy) < step * 0.8;
    });
    if (!taken) break;
    fx = clamp01(fx + step);
    fy = clamp01(fy + step);
    // Ran into the bottom-right corner — start a fresh diagonal.
    if (fx >= 1 || fy >= 1) {
      fx = 0.02 + ((i % 5) + 1) * 0.08;
      fy = 0.03;
    }
  }
  return { x: clamp01(fx), y: clamp01(fy) };
}

/** Whether this person may edit or remove the note (its owner, a commander,
 *  or the master admin). Everyone else can still move, back and comment. */
export function canEditPost(post: BoardPost, uid: string | undefined, isMaster: boolean, rank: string | undefined): boolean {
  if (isMaster || rank === 'commander') return true;
  return !!uid && post.ownerUid === uid;
}

export function hasVoted(post: BoardPost, uid: string | undefined): boolean {
  return !!uid && (post.votes ?? []).includes(uid);
}

/** "2 days ago" — relative, because on a pin board what matters is whether
 *  something is fresh, not the exact minute it went up. */
export function timeAgo(at: number, now = Date.now()): string {
  const secs = Math.max(0, Math.round((now - at) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

/** Notes matching a search box and a colour filter. */
export function filterPosts(posts: BoardPost[], search: string, colour: BoardColour | ''): BoardPost[] {
  const q = search.trim().toLowerCase();
  return posts.filter((p) => {
    if (colour && p.colour !== colour) return false;
    if (!q) return true;
    return (
      p.title.toLowerCase().includes(q) ||
      (p.body ?? '').toLowerCase().includes(q) ||
      (p.tag ?? '').toLowerCase().includes(q) ||
      p.ownerName.toLowerCase().includes(q)
    );
  });
}
