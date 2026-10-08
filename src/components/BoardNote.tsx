'use client';

// One note on the Project Board. On a wide screen it's draggable and
// resizable: positions are fractions of the board, so the arrangement keeps
// its shape whatever size the board is, while the card's own size is held in
// pixels so the text stays readable. On a phone the parent lays these out in
// a plain list and turns both off — dragging a sticky note around a canvas
// with your thumb is miserable.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GitBranch, ImageIcon, ListChecks, MessageSquare, ThumbsUp } from 'lucide-react';
import {
  boardColour,
  clampSize,
  noteSize,
  timeAgo,
  toFraction,
  toPixels,
  travel,
  type BoardPost,
} from '@/lib/projectBoard';

export function BoardNote({
  post,
  area,
  commentCount,
  branchCount,
  voted,
  draggable,
  resizable,
  onOpen,
  onMoved,
  onResized,
  onPickUp,
}: {
  post: BoardPost;
  /** The board's current size in pixels. Ignored when not draggable. */
  area: { w: number; h: number };
  commentCount: number;
  branchCount: number;
  voted: boolean;
  draggable: boolean;
  /** Only the owner, a commander or master may change a note's size. */
  resizable: boolean;
  onOpen: () => void;
  /** New position, as fractions of the board. */
  onMoved: (fx: number, fy: number) => void;
  onResized: (w: number, h: number) => void;
  /** Called as a drag starts, so the parent can bring the note to the front. */
  onPickUp: () => void;
}) {
  const tone = boardColour(post.colour);
  const size = noteSize(post);

  // The note is moved by a transform rather than by left/top: a transform is
  // composited, so following the pointer costs no layout work per frame.
  //
  // The offset deliberately OUTLIVES the drag. Clearing it on release would
  // snap the note back to its stored position for the frame or two before
  // the write comes round, which reads as the note flicking back to where it
  // started and then jumping forward again. It's held until the saved
  // position catches up instead, so the handover is invisible.
  const [offset, setOffset] = useState<{ dx: number; dy: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resize, setResize] = useState<{ w: number; h: number } | null>(null);
  const dragRef = useRef<{ px: number; py: number; left: number; top: number; moved: boolean } | null>(null);
  const resizeRef = useRef<{ px: number; py: number; w: number; h: number } | null>(null);
  const settleRef = useRef<number | null>(null);

  const shown = resize ?? size;
  const resting = toPixels(post, area, shown);

  // useLayoutEffect, not useEffect: this runs before the browser paints, so
  // there's never a frame showing the new stored position AND the old offset
  // on top of it — which would be a visible double-jump.
  useLayoutEffect(() => {
    setOffset(null);
  }, [post.x, post.y]);
  useLayoutEffect(() => {
    setResize(null);
  }, [post.w, post.h]);

  // If the write fails, or lands on the same rounded value it already had,
  // nothing above ever fires — so drop the local offset after a moment
  // rather than leaving the note looking moved when it isn't.
  const armSettle = () => {
    if (settleRef.current) window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => {
      setOffset(null);
      setResize(null);
    }, 2500);
  };
  useEffect(() => () => {
    if (settleRef.current) window.clearTimeout(settleRef.current);
  }, []);

  // ---- Move ----
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return; // footer buttons, resize grip
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, left: resting.left, top: resting.top, moved: false };
    onPickUp();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const o = dragRef.current;
    if (!o) return;
    const dx = e.clientX - o.px;
    const dy = e.clientY - o.py;
    // Ignore the shake in a click: below this it's a tap to open, not a drag.
    if (!o.moved && Math.hypot(dx, dy) < 4) return;
    if (!o.moved) {
      o.moved = true;
      setDragging(true);
    }
    const t = travel(area, shown);
    // Clamp in absolute terms, then express the result as a displacement
    // from where the note is actually pinned.
    const left = Math.max(0, Math.min(t.w, o.left + dx));
    const top = Math.max(0, Math.min(t.h, o.top + dy));
    setOffset({ dx: left - resting.left, dy: top - resting.top });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const o = dragRef.current;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    if (!o) return;
    if (o.moved && offset) {
      const f = toFraction(resting.left + offset.dx, resting.top + offset.dy, area, shown);
      onMoved(f.fx, f.fy);
      armSettle();
    } else {
      setOffset(null);
      onOpen(); // never moved — treat it as opening the note
    }
  };

  // ---- Resize ----
  const handleResizeDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = { px: e.clientX, py: e.clientY, w: size.w, h: size.h };
    onPickUp();
  };
  const handleResizeMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const o = resizeRef.current;
    if (!o) return;
    e.stopPropagation();
    setResize(clampSize(o.w + (e.clientX - o.px), o.h + (e.clientY - o.py), area));
  };
  const handleResizeUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const o = resizeRef.current;
    resizeRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const landed = resize;
    // Same handover as a move: hold the new size until the write comes back,
    // rather than snapping to the old one for a frame.
    if (o && landed && (landed.w !== o.w || landed.h !== o.h)) {
      onResized(landed.w, landed.h);
      armSettle();
    } else {
      setResize(null);
    }
  };

  const photoCount = post.photos?.length ?? 0;
  const cover = post.photos?.[0];
  const voteCount = post.votes?.length ?? 0;
  // A stretched note shows more of its body; a squashed one shows less. The
  // flex column lets the text take whatever is left after the fixed bits.
  const big = shown.h >= 260;

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={() => {
        if (!draggable) onOpen();
      }}
      // The browser's own drag-and-drop would otherwise lift a translucent
      // copy of the card and follow the cursor with it — a second, ghostly
      // note alongside the real one.
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      style={
        draggable
          ? {
              position: 'absolute',
              left: resting.left,
              top: resting.top,
              width: shown.w,
              height: shown.h,
              transform: offset
                ? `translate3d(${offset.dx}px, ${offset.dy}px, 0)${dragging ? ' rotate(1.2deg)' : ''}`
                : undefined,
              zIndex: dragging || resize ? 9999 : post.z ?? 1,
            }
          : undefined
      }
      className={`group/note relative flex select-none flex-col overflow-hidden rounded-sm p-2.5 shadow-lg ring-1 ring-black/10 ${tone.card} ${
        draggable ? 'cursor-grab active:cursor-grabbing' : 'w-full cursor-pointer'
      } ${dragging ? 'shadow-2xl' : 'transition-shadow'}`}
    >
      {/* The pin. */}
      <div className="mx-auto mb-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-neutral-900/30 shadow-inner" />

      <p className="shrink-0 break-words text-[13px] font-bold leading-snug">{post.title}</p>

      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover.thumbUrl ?? cover.url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className={`mt-1.5 w-full shrink-0 rounded-sm border border-neutral-900/10 object-cover ${big ? 'h-28' : 'h-16'}`}
        />
      )}

      {post.body && (
        <p className="mt-1 min-h-0 flex-1 overflow-hidden whitespace-pre-wrap break-words text-[11px] leading-relaxed opacity-80">
          {post.body}
        </p>
      )}

      <div className="mt-auto shrink-0 pt-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {post.tag && (
            <span className="inline-block rounded-full bg-neutral-900/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
              {post.tag}
            </span>
          )}
          {post.parentId && (
            <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide opacity-60">
              <GitBranch className="h-3 w-3" /> Branch
            </span>
          )}
          {post.taskId && (
            <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-emerald-800">
              <ListChecks className="h-3 w-3" /> Task
            </span>
          )}
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-neutral-900/10 pt-1.5 text-[9px] opacity-70">
          <span className="min-w-0 truncate font-semibold">{post.ownerName}</span>
          <span className="shrink-0">{timeAgo(post.createdAt)}</span>
        </div>

        <div className="mt-1 flex items-center gap-2.5 text-[9px] font-semibold">
          <span className={`flex items-center gap-1 ${voted ? 'text-emerald-800' : 'opacity-60'}`}>
            <ThumbsUp className="h-3 w-3" /> {voteCount}
          </span>
          <span className="flex items-center gap-1 opacity-60">
            <MessageSquare className="h-3 w-3" /> {commentCount}
          </span>
          {photoCount > 0 && (
            <span className="flex items-center gap-1 opacity-60">
              <ImageIcon className="h-3 w-3" /> {photoCount}
            </span>
          )}
          {branchCount > 0 && (
            <span className="flex items-center gap-1 opacity-60">
              <GitBranch className="h-3 w-3" /> {branchCount}
            </span>
          )}
        </div>
      </div>

      {draggable && resizable && (
        <button
          onPointerDown={handleResizeDown}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeUp}
          onPointerCancel={handleResizeUp}
          onClick={(e) => e.stopPropagation()}
          title="Drag to resize"
          aria-label="Resize this note"
          className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize opacity-0 transition-opacity group-hover/note:opacity-100"
        >
          <span className="absolute bottom-1 right-1 block h-0 w-0 border-b-[9px] border-l-[9px] border-b-neutral-900/35 border-l-transparent" />
        </button>
      )}
    </div>
  );
}
