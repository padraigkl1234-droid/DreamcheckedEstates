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

/** The pinnable area, in board units (1 unit = 1px at 100%). Big enough to
 *  spread a few dozen notes out without them piling up, small enough that
 *  you aren't hunting across an endless plain for one. */
export const BOARD_W = 2400;
export const BOARD_H = 1600;
export const NOTE_W = 240;
/** Only used to keep a note's top-left inside the board; cards grow to fit. */
export const NOTE_H = 170;

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

/** Keep a note's top-left corner on the board however far the drag went. */
export function clampToBoard(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round(Math.max(0, Math.min(BOARD_W - NOTE_W, x))),
    y: Math.round(Math.max(0, Math.min(BOARD_H - NOTE_H, y))),
  };
}

/** One above the highest note, so whatever you pick up lands on top. */
export function nextZ(posts: BoardPost[]): number {
  return posts.reduce((max, p) => Math.max(max, p.z ?? 0), 0) + 1;
}

/** Where to drop a new note: just inside the top-left of what the person is
 *  currently looking at, nudged along so a run of new notes fans out rather
 *  than landing in a single pile. */
export function newNoteSpot(posts: BoardPost[], scrollX: number, scrollY: number): { x: number; y: number } {
  const base = { x: scrollX + 40, y: scrollY + 40 };
  let { x, y } = base;
  // Step diagonally until the spot isn't already taken by another note.
  for (let i = 0; i < 40; i++) {
    const taken = posts.some((p) => Math.abs(p.x - x) < 28 && Math.abs(p.y - y) < 28);
    if (!taken) break;
    x += 28;
    y += 28;
  }
  return clampToBoard(x, y);
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
