'use client';

// One note on the Project Board. On a wide screen it's draggable — the board
// renders at 1 unit per pixel, so a pointer delta is a board delta and no
// coordinate conversion is needed. On a phone the parent lays these out in a
// plain list instead and turns dragging off, because dragging a sticky note
// around a canvas with your thumb is miserable.

import React, { useRef, useState } from 'react';
import { ImageIcon, ListChecks, MessageSquare, ThumbsUp } from 'lucide-react';
import {
  boardColour,
  clampToBoard,
  NOTE_W,
  timeAgo,
  type BoardPost,
} from '@/lib/projectBoard';

export function BoardNote({
  post,
  commentCount,
  voted,
  draggable,
  onOpen,
  onMoved,
  onPickUp,
}: {
  post: BoardPost;
  commentCount: number;
  voted: boolean;
  draggable: boolean;
  onOpen: () => void;
  onMoved: (x: number, y: number) => void;
  /** Called as a drag starts, so the parent can bring the note to the front. */
  onPickUp: () => void;
}) {
  const tone = boardColour(post.colour);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const originRef = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable || e.button !== 0) return;
    // Let the buttons in the footer work normally.
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    originRef.current = { px: e.clientX, py: e.clientY, x: post.x, y: post.y, moved: false };
    onPickUp();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const o = originRef.current;
    if (!o) return;
    const dx = e.clientX - o.px;
    const dy = e.clientY - o.py;
    // Ignore the shake in a click: below this it's a tap to open, not a drag.
    if (!o.moved && Math.hypot(dx, dy) < 4) return;
    o.moved = true;
    setDrag(clampToBoard(o.x + dx, o.y + dy));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const o = originRef.current;
    originRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const landed = drag;
    setDrag(null);
    if (!o) return;
    if (o.moved && landed) onMoved(landed.x, landed.y);
    else onOpen(); // never moved — treat it as opening the note
  };

  const pos = drag ?? { x: post.x, y: post.y };
  const photoCount = post.photos?.length ?? 0;
  const voteCount = post.votes?.length ?? 0;

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
      style={
        draggable
          ? { position: 'absolute', left: pos.x, top: pos.y, width: NOTE_W, zIndex: drag ? 9999 : post.z ?? 1 }
          : undefined
      }
      className={`select-none rounded-sm p-3 shadow-lg ring-1 ring-black/10 transition-shadow ${tone.card} ${
        draggable ? 'cursor-grab active:cursor-grabbing' : 'w-full cursor-pointer'
      } ${drag ? 'rotate-1 shadow-2xl' : ''}`}
    >
      {/* The pin. */}
      <div className="mx-auto mb-2 h-2.5 w-2.5 rounded-full bg-neutral-900/30 shadow-inner" />

      <p className="break-words text-sm font-bold leading-snug">{post.title}</p>
      {post.body && <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-xs leading-relaxed opacity-80">{post.body}</p>}

      {post.tag && (
        <span className="mt-2 inline-block rounded-full bg-neutral-900/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
          {post.tag}
        </span>
      )}

      {post.taskId && (
        <span className="mt-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
          <ListChecks className="h-3 w-3" /> Became a task
        </span>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-neutral-900/10 pt-2 text-[10px] opacity-70">
        <span className="min-w-0 truncate font-semibold">{post.ownerName}</span>
        <span className="shrink-0">{timeAgo(post.createdAt)}</span>
      </div>

      <div className="mt-1.5 flex items-center gap-3 text-[10px] font-semibold">
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
      </div>
    </div>
  );
}
