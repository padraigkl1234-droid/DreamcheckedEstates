'use client';

// Project Board — a shared pin board for the team: reminders, project notes
// and Capex ideas, pinned where you want them. Everything is visible to the
// whole team and every note is stamped with whoever put it up. Others can
// move it, back it, comment on it, attach photos, and turn it into a task;
// only the owner (or a commander) can edit the words or take it down.
//
// On a wide screen the board is a real canvas you drag notes around. On a
// phone the same notes come out as a plain list — dragging a sticky note
// around a canvas with a thumb is miserable, and the content is the point.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GitBranch,
  ImagePlus,
  ListChecks,
  Loader2,
  MessageSquare,
  Pencil,
  Pin,
  Plus,
  Search,
  Send,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import { db, storage } from '@/lib/firebase';
import { downscaleImage, makeThumbnail, IMAGE_CACHE_CONTROL } from '@/lib/imageResize';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { AppSidebar, AppMobileNav } from '@/components/AppSidebar';
import { BoardNote } from '@/components/BoardNote';
import { featureEnabled } from '@/lib/teams';
import {
  BOARD_COLOURS,
  BOARD_COLOUR_KEYS,
  boardColour,
  branchLines,
  canEditPost,
  childrenOf,
  clampSize,
  filterPosts,
  hasVoted,
  newNoteSpot,
  nextZ,
  noteSize,
  timeAgo,
  type BoardColour,
  type BoardComment,
  type BoardPhoto,
  type BoardPost,
} from '@/lib/projectBoard';

// Firebase errors carry a code that says exactly which service refused and
// why. Showing "could not attach that photo" throws that away and leaves you
// guessing, so the code is translated into something actionable instead.
function describeFirebaseError(e: unknown, doing: string): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code.startsWith('storage/')) {
    if (code === 'storage/unauthorized') {
      return `Firebase Storage refused the upload (${code}). The bucket's rules don't allow writing to the projectBoard/ folder — see storage.rules in the repo.`;
    }
    if (code === 'storage/unauthenticated') return 'Your sign-in expired mid-upload. Refresh and try again.';
    if (code === 'storage/quota-exceeded') return 'The storage bucket is full.';
    if (code === 'storage/retry-limit-exceeded' || code === 'storage/canceled') {
      return 'The upload timed out — check the connection and try again.';
    }
    return `Storage refused the upload (${code}).`;
  }
  if (code === 'permission-denied') {
    return `The database refused that change (${doing}). The firestore.rules boardPosts block may need republishing.`;
  }
  if (code === 'unavailable') return 'No connection to the database — it will retry when you are back online.';
  const message = e instanceof Error ? e.message : String(e);
  return `${doing} failed: ${code || message}`;
}

const genId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const inputClass =
  'w-full rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none';

export default function ProjectBoardPage() {
  const { user } = useAuth();
  const { profile, team, isMaster, loading: profileLoading } = useProfile();
  const teamId = profile?.teamId ?? null;
  const pageEnabled = isMaster || featureEnabled(team?.features, 'projectBoard');

  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [search, setSearch] = useState('');
  const [colourFilter, setColourFilter] = useState<BoardColour | ''>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Photo viewer for the open note. Held as an index rather than a URL so the
  // arrows can step through that note's photos.
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Dragging only makes sense with a pointer and room to drag in.
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = () => setIsWide(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // The board fills the space it's given rather than being a fixed canvas
  // you scroll around, so everything is on screen at once. Note positions are
  // fractions, so they hold their arrangement as that space changes.
  const canvasRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setArea({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isWide]);

  useEffect(() => {
    if (!user || !teamId) {
      setPosts([]);
      return;
    }
    // Filtered on teamId, mirroring the read rule.
    const unsub = onSnapshot(
      query(collection(db, 'boardPosts'), where('teamId', '==', teamId)),
      (snap) => setPosts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BoardPost, 'id'>) }))),
      (e) => console.error('Project board subscription failed:', e)
    );
    return unsub;
  }, [user, teamId]);

  useEffect(() => {
    if (!user || !teamId) {
      setComments([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'boardComments'), where('teamId', '==', teamId)),
      (snap) => setComments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BoardComment, 'id'>) }))),
      (e) => console.error('Board comments subscription failed:', e)
    );
    return unsub;
  }, [user, teamId]);

  const visible = useMemo(() => filterPosts(posts, search, colourFilter), [posts, search, colourFilter]);
  const commentsByPost = useMemo(() => {
    const map = new Map<string, BoardComment[]>();
    for (const c of comments) {
      if (!map.has(c.postId)) map.set(c.postId, []);
      map.get(c.postId)!.push(c);
    }
    for (const list of map.values()) list.sort((a, b) => a.at - b.at);
    return map;
  }, [comments]);

  const selected = selectedId ? posts.find((p) => p.id === selectedId) ?? null : null;
  // The selected note vanishing (someone else took it down) shouldn't leave
  // an empty panel hanging open.
  useEffect(() => {
    if (selectedId && !posts.some((p) => p.id === selectedId)) setSelectedId(null);
  }, [selectedId, posts]);

  const lightboxPhotos = selected?.photos ?? [];
  // Opening a different note, or deleting the photo being looked at, must not
  // leave the viewer pointing at something that isn't there.
  useEffect(() => setLightbox(null), [selectedId]);
  useEffect(() => {
    if (lightbox !== null && lightbox >= lightboxPhotos.length) setLightbox(null);
  }, [lightbox, lightboxPhotos.length]);

  const stepPhoto = useCallback(
    (by: number) =>
      setLightbox((i) => (i === null || lightboxPhotos.length === 0 ? null : (i + by + lightboxPhotos.length) % lightboxPhotos.length)),
    [lightboxPhotos.length]
  );

  // Escape closes the viewer, arrows walk through the note's photos. Bound
  // only while it's open so Escape still belongs to the note underneath.
  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      else if (e.key === 'ArrowRight') stepPhoto(1);
      else if (e.key === 'ArrowLeft') stepPhoto(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, stepPhoto]);

  const displayName = user?.displayName || user?.email || 'Unknown';

  // ---- Writes ----
  const movePost = useCallback(
    (post: BoardPost, fx: number, fy: number) => {
      // Stored to three decimals: enough to land a note exactly where it was
      // dropped on a 4K screen, without writing a twelve-digit float.
      updateDoc(doc(db, 'boardPosts', post.id), { x: +fx.toFixed(4), y: +fy.toFixed(4) }).catch((e) => {
        console.error('Failed to move note:', e);
        setError('Could not move that note.');
      });
    },
    []
  );

  const resizePost = useCallback((post: BoardPost, w: number, h: number) => {
    updateDoc(doc(db, 'boardPosts', post.id), clampSize(w, h)).catch((e) => {
      console.error('Failed to resize note:', e);
      setError(describeFirebaseError(e, 'resizing a note'));
    });
  }, []);

  const bringToFront = useCallback(
    (post: BoardPost) => {
      const top = nextZ(posts);
      if ((post.z ?? 0) >= top - 1) return; // already on top, don't churn a write
      updateDoc(doc(db, 'boardPosts', post.id), { z: top }).catch(() => {});
    },
    [posts]
  );

  const toggleVote = async (post: BoardPost) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'boardPosts', post.id), {
        votes: hasVoted(post, user.uid) ? arrayRemove(user.uid) : arrayUnion(user.uid),
      });
    } catch (e) {
      console.error('Failed to record that vote:', e);
      setError('Could not record that.');
    }
  };

  // ---- Compose ----
  const [composeOpen, setComposeOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftTag, setDraftTag] = useState('');
  const [draftColour, setDraftColour] = useState<BoardColour>('yellow');
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  /** Set when the new note is branching off an existing one. */
  const [draftParentId, setDraftParentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const composeFileRef = useRef<HTMLInputElement>(null);

  // Previews for photos picked before the note exists. Object URLs are
  // revoked when the list changes so a long compose session doesn't leak.
  const draftPreviews = useMemo(() => draftFiles.map((f) => URL.createObjectURL(f)), [draftFiles]);
  useEffect(() => () => draftPreviews.forEach((u) => URL.revokeObjectURL(u)), [draftPreviews]);

  const openCompose = (parentId: string | null = null) => {
    setDraftParentId(parentId);
    setDraftTitle('');
    setDraftBody('');
    setDraftTag('');
    setDraftColour('yellow');
    setDraftFiles([]);
    setError(null);
    setComposeOpen(true);
  };

  const createPost = async () => {
    if (!user || !teamId) return;
    const title = draftTitle.trim();
    if (!title) {
      setError('Give the note a heading.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const parent = draftParentId ? posts.find((p) => p.id === draftParentId) ?? null : null;
      // A branch lands just below and right of its parent, so the line
      // between them reads as a branch rather than crossing the whole board.
      const spot = parent
        ? { x: Math.min(1, (parent.x > 1 ? parent.x / 2400 : parent.x) + 0.1), y: Math.min(1, (parent.y > 1 ? parent.y / 1600 : parent.y) + 0.16) }
        : newNoteSpot(posts);
      const id = genId('note');
      const payload: Omit<BoardPost, 'id'> = {
        teamId,
        title,
        colour: draftColour,
        x: spot.x,
        y: spot.y,
        z: nextZ(posts),
        votes: [],
        createdAt: Date.now(),
        ownerUid: user.uid,
        ownerName: displayName,
        ...(draftBody.trim() ? { body: draftBody.trim() } : {}),
        ...(draftTag.trim() ? { tag: draftTag.trim() } : {}),
        ...(draftParentId ? { parentId: draftParentId } : {}),
      };
      await setDoc(doc(db, 'boardPosts', id), payload);
      // Photos need the note's id for their storage path, so they go up once
      // it exists. The note is already pinned either way — a failed upload
      // costs you the picture, not the note.
      if (draftFiles.length) await addPhotos({ ...payload, id }, draftFiles);
      setDraftFiles([]);
      setDraftParentId(null);
      setComposeOpen(false);
      setSelectedId(id);
    } catch (e) {
      console.error('Failed to pin that note:', e);
      setError(describeFirebaseError(e, 'pinning a note'));
    } finally {
      setSaving(false);
    }
  };

  // ---- Edit / delete ----
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editTag, setEditTag] = useState('');
  const [editColour, setEditColour] = useState<BoardColour>('yellow');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const startEdit = (post: BoardPost) => {
    setEditTitle(post.title);
    setEditBody(post.body ?? '');
    setEditTag(post.tag ?? '');
    setEditColour((post.colour as BoardColour) ?? 'yellow');
    setEditing(true);
  };

  const saveEdit = async (post: BoardPost) => {
    const title = editTitle.trim();
    if (!title) {
      setError('A note needs a heading.');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'boardPosts', post.id), {
        title,
        body: editBody.trim() || null,
        tag: editTag.trim() || null,
        colour: editColour,
        updatedAt: Date.now(),
      });
      setEditing(false);
    } catch (e) {
      console.error('Failed to save that note:', e);
      setError('Could not save those changes.');
    } finally {
      setSaving(false);
    }
  };

  const deletePost = async (post: BoardPost) => {
    try {
      // Take the photos and the thread with it, so nothing is orphaned.
      for (const photo of post.photos ?? []) {
        deleteObject(storageRef(storage, photo.path)).catch(() => {});
        if (photo.thumbPath) deleteObject(storageRef(storage, photo.thumbPath)).catch(() => {});
      }
      for (const c of commentsByPost.get(post.id) ?? []) {
        deleteDoc(doc(db, 'boardComments', c.id)).catch(() => {});
      }
      await deleteDoc(doc(db, 'boardPosts', post.id));
      setSelectedId(null);
      setConfirmDelete(false);
    } catch (e) {
      console.error('Failed to take that note down:', e);
      setError('Could not take that note down.');
    }
  };

  // ---- Photos ----
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const addPhotos = async (post: BoardPost, files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    setError(null);
    try {
      const added: BoardPhoto[] = [];
      for (const file of files) {
        const stamp = Date.now();
        const path = `projectBoard/${post.id}/${stamp}-${file.name}`;
        const fileRefr = storageRef(storage, path);
        await uploadBytes(fileRefr, await downscaleImage(file), { cacheControl: IMAGE_CACHE_CONTROL });
        const url = await getDownloadURL(fileRefr);
        let thumbUrl: string | undefined;
        let thumbPath: string | undefined;
        try {
          const thumb = await makeThumbnail(file);
          if (thumb) {
            thumbPath = `projectBoard/${post.id}/${stamp}-thumb-${thumb.name}`;
            const thumbRef = storageRef(storage, thumbPath);
            await uploadBytes(thumbRef, thumb, { cacheControl: IMAGE_CACHE_CONTROL });
            thumbUrl = await getDownloadURL(thumbRef);
          }
        } catch {
          thumbUrl = undefined;
          thumbPath = undefined;
        }
        added.push({ url, path, ...(thumbUrl && thumbPath ? { thumbUrl, thumbPath } : {}) });
      }
      await updateDoc(doc(db, 'boardPosts', post.id), { photos: [...(post.photos ?? []), ...added] });
    } catch (e) {
      console.error('Failed to attach that photo:', e);
      setError(describeFirebaseError(e, 'attaching a photo'));
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (post: BoardPost, photo: BoardPhoto) => {
    deleteObject(storageRef(storage, photo.path)).catch(() => {});
    if (photo.thumbPath) deleteObject(storageRef(storage, photo.thumbPath)).catch(() => {});
    await updateDoc(doc(db, 'boardPosts', post.id), {
      photos: (post.photos ?? []).filter((p) => p.path !== photo.path),
    }).catch((e) => console.error('Failed to remove that photo:', e));
  };

  // ---- Comments ----
  const [commentDraft, setCommentDraft] = useState('');
  const addComment = async (post: BoardPost) => {
    if (!user || !teamId) return;
    const text = commentDraft.trim();
    if (!text) return;
    setCommentDraft('');
    try {
      const id = genId('bc');
      await setDoc(doc(db, 'boardComments', id), {
        teamId,
        postId: post.id,
        text,
        at: Date.now(),
        byUid: user.uid,
        byName: displayName,
      });
    } catch (e) {
      console.error('Failed to post that comment:', e);
      setError('Could not post that comment.');
      setCommentDraft(text);
    }
  };

  // ---- Turn into a task ----
  const [converting, setConverting] = useState(false);
  const convertToTask = async (post: BoardPost) => {
    if (!user || !teamId) return;
    setConverting(true);
    setError(null);
    try {
      const id = genId('task');
      // Same shape the Task Manager writes, so it behaves like any other
      // task: private to its participants, offerable, archivable.
      await setDoc(doc(db, 'tasks', id), {
        name: post.title,
        priority: 'Medium',
        dueDate: '',
        status: 'Not Started',
        notes: [post.body?.trim(), `From the project board — pinned by ${post.ownerName}.`]
          .filter(Boolean)
          .join('\n\n'),
        createdAt: Date.now(),
        ownerUid: user.uid,
        ownerName: displayName,
        teamId,
        participants: [user.uid],
        participantNames: { [user.uid]: displayName },
        pendingUids: [],
        pendingNames: {},
        archived: false,
      });
      await updateDoc(doc(db, 'boardPosts', post.id), {
        taskId: id,
        taskByName: displayName,
        taskAt: Date.now(),
      });
    } catch (e) {
      console.error('Failed to turn that note into a task:', e);
      setError('Could not create that task.');
    } finally {
      setConverting(false);
    }
  };

  // ---- Shell ----
  const chrome = (body: React.ReactNode) => (
    <div className="flex h-[calc(100vh-4rem)] flex-col md:flex-row">
      <AppMobileNav features={team?.features} isMaster={isMaster} />
      <AppSidebar features={team?.features} isMaster={isMaster} />
      <main className="relative flex min-h-0 flex-1 flex-col bg-invictus-base font-sans text-neutral-100">{body}</main>
    </div>
  );

  if (!profileLoading && !pageEnabled) {
    return chrome(
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="max-w-md text-sm text-neutral-500">Project Board isn&apos;t enabled for your team.</p>
      </div>
    );
  }
  if (!user) {
    return chrome(
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="max-w-md text-sm text-neutral-500">Sign in to see the team&apos;s project board.</p>
      </div>
    );
  }

  const selectedComments = selected ? commentsByPost.get(selected.id) ?? [] : [];
  const canEditSelected = selected ? canEditPost(selected, user.uid, isMaster, profile?.rank) : false;
  const selectedParent = selected?.parentId ? posts.find((p) => p.id === selected.parentId) ?? null : null;
  const selectedChildren = selected ? childrenOf(posts, selected.id) : [];

  return chrome(
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-400/15 p-4 max-md:p-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold uppercase tracking-widest text-neutral-100">
            <Pin className="h-5 w-5 text-invictus-crimson-bright" /> Project Board
          </h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            {posts.length} note{posts.length === 1 ? '' : 's'} · everyone on the team can see this
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-600" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the board…"
              className="w-44 rounded-md border border-neutral-400/30 bg-invictus-base/60 py-2 pl-8 pr-3 text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border border-neutral-400/25 p-1">
            <button
              onClick={() => setColourFilter('')}
              className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                colourFilter === '' ? 'text-invictus-crimson-bright' : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              All
            </button>
            {BOARD_COLOUR_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => setColourFilter(colourFilter === key ? '' : key)}
                title={BOARD_COLOURS[key].label}
                className={`h-5 w-5 rounded-full border border-neutral-900/20 transition-all ${BOARD_COLOURS[key].swatch} ${
                  colourFilter === key ? 'ring-2 ring-invictus-crimson-bright' : 'opacity-60 hover:opacity-100'
                }`}
              />
            ))}
          </div>
          <button
            onClick={() => openCompose()}
            className="flex items-center gap-1.5 rounded-md border border-invictus-crimson-bright/40 bg-invictus-crimson-bright/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-invictus-crimson-bright transition-colors hover:bg-invictus-crimson-bright/20"
          >
            <Plus className="h-3.5 w-3.5" /> Pin a note
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 flex items-start gap-3 rounded-md border border-alert/40 bg-alert/10 px-3 py-2">
          <p className="min-w-0 flex-1 text-xs text-alert">{error}</p>
          <button
            onClick={() => setError(null)}
            className="shrink-0 rounded p-0.5 text-alert/70 transition-colors hover:text-alert"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {visible.length === 0 && (
        <p className="px-4 py-10 text-center text-xs text-neutral-600">
          {posts.length === 0
            ? 'Nothing pinned yet — put the first note up.'
            : 'Nothing on the board matches that.'}
        </p>
      )}

      {isWide ? (
        // The board proper: one screenful, no scrolling. Notes sit wherever
        // they were dropped and the arrangement is shared.
        <div className="min-h-0 flex-1 p-4">
          <div
            ref={canvasRef}
            className="relative h-full w-full overflow-hidden rounded-lg border border-neutral-400/15 bg-invictus-surface/30"
            style={{
              backgroundImage:
                'radial-gradient(circle, rgb(var(--invictus-crimson-bright) / 0.07) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          >
            {/* Branch lines, behind the notes. Drawn from the filtered set so
                a colour filter never leaves a line hanging off to nowhere. */}
            {area.w > 0 && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 0 }}>
                {branchLines(visible, area).map((l) => (
                  <line
                    key={l.id}
                    x1={l.x1}
                    y1={l.y1}
                    x2={l.x2}
                    y2={l.y2}
                    stroke="rgb(var(--invictus-crimson-bright) / 0.45)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                  />
                ))}
              </svg>
            )}
            {area.w > 0 &&
              visible.map((post) => (
                <BoardNote
                  key={post.id}
                  post={post}
                  area={area}
                  commentCount={(commentsByPost.get(post.id) ?? []).length}
                  branchCount={childrenOf(posts, post.id).length}
                  voted={hasVoted(post, user.uid)}
                  draggable
                  resizable={canEditPost(post, user.uid, isMaster, profile?.rank)}
                  onOpen={() => setSelectedId(post.id)}
                  onPickUp={() => bringToFront(post)}
                  onMoved={(fx, fy) => movePost(post, fx, fy)}
                  onResized={(w, h) => resizePost(post, w, h)}
                />
              ))}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {visible
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((post) => (
              <BoardNote
                key={post.id}
                post={post}
                area={area}
                commentCount={(commentsByPost.get(post.id) ?? []).length}
                branchCount={childrenOf(posts, post.id).length}
                voted={hasVoted(post, user.uid)}
                draggable={false}
                resizable={false}
                onOpen={() => setSelectedId(post.id)}
                onPickUp={() => {}}
                onMoved={() => {}}
                onResized={() => {}}
              />
            ))}
        </div>
      )}

      {/* ---- Compose ---- */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-neutral-400/25 bg-invictus-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-neutral-200">
                <Pin className="h-4 w-4 text-invictus-crimson-bright" />
                {draftParentId ? 'Branch off a note' : 'Pin a note'}
              </h2>
              <button onClick={() => setComposeOpen(false)} className="rounded-md p-1 text-neutral-500 hover:text-neutral-200">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                autoFocus
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Heading"
                className={inputClass}
              />
              <textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                rows={5}
                placeholder="The detail — what it is, why it's worth doing, rough costs…"
                className={inputClass}
              />
              <input
                value={draftTag}
                onChange={(e) => setDraftTag(e.target.value)}
                placeholder="Label (optional) — e.g. Capex, Winter shutdown"
                className={inputClass}
              />
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-neutral-500">
                    Photos {draftFiles.length > 0 && `(${draftFiles.length})`}
                  </span>
                  <button
                    onClick={() => composeFileRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-md border border-neutral-400/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright"
                  >
                    <ImagePlus className="h-3 w-3" /> Attach
                  </button>
                  <input
                    ref={composeFileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => {
                      const picked = Array.from(e.target.files ?? []);
                      e.target.value = '';
                      setDraftFiles((prev) => [...prev, ...picked]);
                    }}
                  />
                </div>
                {draftPreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {draftPreviews.map((url, i) => (
                      <div key={url} className="group/img relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-16 w-16 rounded-md border border-neutral-400/25 object-cover" />
                        <button
                          onClick={() => setDraftFiles((prev) => prev.filter((_, n) => n !== i))}
                          className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 text-neutral-300 opacity-0 transition-opacity hover:text-alert group-hover/img:opacity-100"
                          title="Remove"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-neutral-500">Colour</span>
                {BOARD_COLOUR_KEYS.map((key) => (
                  <button
                    key={key}
                    onClick={() => setDraftColour(key)}
                    title={BOARD_COLOURS[key].label}
                    className={`h-7 w-7 rounded-full border-2 transition-all ${BOARD_COLOURS[key].swatch} ${
                      draftColour === key
                        ? 'border-invictus-crimson-bright ring-2 ring-invictus-crimson-bright/40'
                        : 'border-neutral-900/20 opacity-70 hover:opacity-100'
                    }`}
                  />
                ))}
                <span className="text-[10px] text-neutral-500">{BOARD_COLOURS[draftColour].label}</span>
              </div>
              {error && <p className="text-xs text-alert">{error}</p>}
              <button
                onClick={createPost}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-md border border-invictus-crimson-bright/40 bg-invictus-crimson-bright/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-invictus-crimson-bright disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pin className="h-3.5 w-3.5" />} Pin it up
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- The note itself ---- */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
          <div className={`my-auto w-full max-w-2xl rounded-xl border-t-8 bg-invictus-surface ${boardColour(selected.colour).accent}`}>
            <div className="flex items-start justify-between gap-3 border-b border-neutral-400/15 p-5">
              <div className="min-w-0">
                {editing ? (
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={inputClass} />
                ) : (
                  <h2 className="break-words text-lg font-bold text-neutral-100">{selected.title}</h2>
                )}
                <p className="mt-1 text-xs text-neutral-500">
                  {selected.ownerName} · {timeAgo(selected.createdAt)}
                  {selected.updatedAt ? ' · edited' : ''}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedId(null);
                  setEditing(false);
                  setConfirmDelete(false);
                }}
                className="shrink-0 rounded-md p-1 text-neutral-500 hover:text-neutral-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              {editing ? (
                <div className="space-y-3">
                  <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={6} className={inputClass} />
                  <input value={editTag} onChange={(e) => setEditTag(e.target.value)} placeholder="Label" className={inputClass} />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-widest text-neutral-500">Colour</span>
                    {BOARD_COLOUR_KEYS.map((key) => (
                      <button
                        key={key}
                        onClick={() => setEditColour(key)}
                        title={BOARD_COLOURS[key].label}
                        className={`h-7 w-7 rounded-full border-2 transition-all ${BOARD_COLOURS[key].swatch} ${
                          editColour === key
                            ? 'border-invictus-crimson-bright ring-2 ring-invictus-crimson-bright/40'
                            : 'border-neutral-900/20 opacity-70 hover:opacity-100'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(selected)}
                      disabled={saving}
                      className="flex items-center gap-1.5 rounded-md border border-invictus-crimson-bright/40 bg-invictus-crimson-bright/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-invictus-crimson-bright disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      className="rounded-md border border-neutral-400/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 hover:text-neutral-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {selected.body && (
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-300">{selected.body}</p>
                  )}
                  {selected.tag && (
                    <span className="inline-block rounded-full border border-neutral-400/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                      {selected.tag}
                    </span>
                  )}
                </>
              )}

              {/* Where this note sits in a branch. */}
              {(selectedParent || selectedChildren.length > 0) && (
                <div className="space-y-1.5 rounded-md border border-neutral-400/20 bg-invictus-base/40 p-3">
                  {selectedParent && (
                    <button
                      onClick={() => setSelectedId(selectedParent.id)}
                      className="flex items-center gap-1.5 text-xs text-neutral-400 transition-colors hover:text-invictus-crimson-bright"
                    >
                      <GitBranch className="h-3 w-3 rotate-180" /> Branched off{' '}
                      <span className="font-semibold">{selectedParent.title}</span>
                    </button>
                  )}
                  {selectedChildren.length > 0 && (
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                        Branches ({selectedChildren.length})
                      </p>
                      <ul className="space-y-1">
                        {selectedChildren.map((child) => (
                          <li key={child.id}>
                            <button
                              onClick={() => setSelectedId(child.id)}
                              className="flex items-center gap-1.5 text-xs text-neutral-400 transition-colors hover:text-invictus-crimson-bright"
                            >
                              <GitBranch className="h-3 w-3" /> {child.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Photos */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                    Photos ({selected.photos?.length ?? 0})
                  </p>
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 rounded-md border border-neutral-400/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 transition-colors hover:text-neutral-200 disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />} Add
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      e.target.value = '';
                      addPhotos(selected, files);
                    }}
                  />
                </div>
                {(selected.photos?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selected.photos!.map((photo, i) => (
                      <div key={photo.path} className="group/img relative">
                        {/* The thumbnail is what's shown; tapping it opens the
                            full-size photo in the viewer below. */}
                        <button
                          onClick={() => setLightbox(i)}
                          className="block cursor-zoom-in"
                          title="Open this photo"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.thumbUrl ?? photo.url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            width={80}
                            height={80}
                            className="h-20 w-20 rounded-md border border-neutral-400/25 object-cover transition-opacity hover:opacity-80"
                          />
                        </button>
                        <button
                          onClick={() => removePhoto(selected, photo)}
                          className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 text-neutral-300 opacity-0 transition-opacity hover:text-alert group-hover/img:opacity-100"
                          title="Remove"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 border-y border-neutral-400/15 py-3">
                <button
                  onClick={() => toggleVote(selected)}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                    hasVoted(selected, user.uid)
                      ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                      : 'border-neutral-400/30 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <ThumbsUp className="h-3.5 w-3.5" /> {hasVoted(selected, user.uid) ? 'Backing this' : 'Back it'} ·{' '}
                  {(selected.votes ?? []).length}
                </button>

                {selected.taskId ? (
                  <span className="flex items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-300">
                    <ListChecks className="h-3.5 w-3.5" /> Task made by {selected.taskByName}
                  </span>
                ) : (
                  <button
                    onClick={() => convertToTask(selected)}
                    disabled={converting}
                    className="flex items-center gap-1.5 rounded-md border border-neutral-400/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright disabled:opacity-50"
                  >
                    {converting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListChecks className="h-3.5 w-3.5" />}
                    Make it a task
                  </button>
                )}

                <button
                  onClick={() => {
                    const parent = selected.id;
                    setSelectedId(null);
                    openCompose(parent);
                  }}
                  className="flex items-center gap-1.5 rounded-md border border-neutral-400/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright"
                >
                  <GitBranch className="h-3.5 w-3.5" /> Branch off
                </button>

                {canEditSelected && !editing && (
                  <>
                    <button
                      onClick={() => startEdit(selected)}
                      className="ml-auto flex items-center gap-1.5 rounded-md border border-neutral-400/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 hover:text-neutral-200"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <div className="flex items-center gap-1 rounded-md border border-neutral-400/30 px-1.5 py-1">
                      <span className="pr-1 text-[9px] uppercase tracking-widest text-neutral-600">Size</span>
                      {([
                        ['S', 170, 150],
                        ['M', 210, 200],
                        ['L', 300, 300],
                        ['XL', 400, 420],
                      ] as const).map(([label, w, h]) => {
                        const current = noteSize(selected);
                        const on = current.w === w && current.h === h;
                        return (
                          <button
                            key={label}
                            onClick={() => resizePost(selected, w, h)}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                              on ? 'bg-invictus-crimson-bright/20 text-invictus-crimson-bright' : 'text-neutral-500 hover:text-neutral-200'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {confirmDelete ? (
                      <>
                        <button
                          onClick={() => deletePost(selected)}
                          className="rounded-md border border-alert/50 bg-alert/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-alert"
                        >
                          Confirm
                        </button>
                        <button onClick={() => setConfirmDelete(false)} className="text-[10px] text-neutral-500 hover:text-neutral-300">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="flex items-center gap-1.5 rounded-md border border-alert/30 bg-alert/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-alert hover:bg-alert/20"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Take down
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Comments */}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                  <MessageSquare className="h-3.5 w-3.5" /> Comments ({selectedComments.length})
                </p>
                <ul className="mb-3 space-y-2">
                  {selectedComments.map((c) => (
                    <li key={c.id} className="rounded-md border border-neutral-400/20 bg-invictus-base/40 px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold text-neutral-200">{c.byName}</span>
                        <span className="shrink-0 font-mono text-[10px] text-neutral-600">{timeAgo(c.at)}</span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-neutral-400">{c.text}</p>
                      {(c.byUid === user.uid || isMaster || profile?.rank === 'commander') && (
                        <button
                          onClick={() => deleteDoc(doc(db, 'boardComments', c.id)).catch(() => {})}
                          className="mt-1 text-[10px] text-neutral-600 transition-colors hover:text-alert"
                        >
                          Delete
                        </button>
                      )}
                    </li>
                  ))}
                  {selectedComments.length === 0 && <li className="text-xs text-neutral-600">Nothing said yet.</li>}
                </ul>
                <div className="flex gap-2">
                  <input
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        addComment(selected);
                      }
                    }}
                    placeholder="Add a comment…"
                    className={inputClass}
                  />
                  <button
                    onClick={() => addComment(selected)}
                    disabled={!commentDraft.trim()}
                    className="shrink-0 rounded-md border border-neutral-400/30 px-3 text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright disabled:opacity-40"
                    title="Post comment"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo viewer. Sits above the open note, which stays behind it, so
          closing it returns you to the note rather than to the board. */}
      {selected && lightbox !== null && lightboxPhotos[lightbox] && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-6 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          {/* The full-size photo, not the thumbnail. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxPhotos[lightbox].url}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-md object-contain shadow-glow-strong"
          />

          <button
            onClick={() => setLightbox(null)}
            className="absolute right-5 top-5 rounded-md border border-neutral-400/30 bg-invictus-base/70 p-2 text-neutral-300 transition-colors hover:text-invictus-crimson-bright"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>

          <a
            href={lightboxPhotos[lightbox].url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute left-5 top-5 flex items-center gap-1.5 rounded-md border border-neutral-400/30 bg-invictus-base/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:text-invictus-crimson-bright"
            title="Open the original in a new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Full size
          </a>

          {lightboxPhotos.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  stepPhoto(-1);
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-md border border-neutral-400/30 bg-invictus-base/70 p-2 text-neutral-300 transition-colors hover:text-invictus-crimson-bright"
                title="Previous photo"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  stepPhoto(1);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md border border-neutral-400/30 bg-invictus-base/70 p-2 text-neutral-300 transition-colors hover:text-invictus-crimson-bright"
                title="Next photo"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-md border border-neutral-400/25 bg-invictus-base/70 px-3 py-1 font-mono text-[11px] text-neutral-400">
                {lightbox + 1} / {lightboxPhotos.length}
              </span>
            </>
          )}
        </div>
      )}
    </>
  );
}
