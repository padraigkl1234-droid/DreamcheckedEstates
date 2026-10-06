'use client';

// Site Status — a big-screen board showing which parts of the estate are out
// of use on a given day. Built to be projected onto a monitor on site rather
// than read on a phone: the map is read-only, everything that's open is
// knocked back to grey, and the closures are listed beside it in large type.
//
// Deliberately a separate page from the Site Map. That one is a working tool
// (grid squares, task pinning, material costs); this one answers a single
// question from across a room — what's shut today.
//
// Only a commander or the master admin can close or reopen an area. Those
// controls live behind the Manage button, which nobody else sees and which
// is hidden entirely in display mode.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import {
  Ban,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { AppSidebar, AppMobileNav } from '@/components/AppSidebar';
import { InvictusSelect } from '@/components/InvictusSelect';
import { SiteStatusMap } from '@/components/SiteStatusMap';
import { featureEnabled } from '@/lib/teams';
import { siteSections } from '@/lib/siteSections';
import {
  canManageClosures,
  closedAreasOn,
  closureIsPast,
  closureWindowLabel,
  closuresOn,
  formatLongDate,
  shiftISO,
  todayISO,
  type SiteClosure,
} from '@/lib/siteClosures';

const genId = () => `cls-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const inputClass =
  'w-full rounded-md border border-neutral-400/30 bg-invictus-surface/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none';

export default function SiteStatusPage() {
  const { user } = useAuth();
  const { profile, team, isMaster, loading: profileLoading } = useProfile();
  const teamId = profile?.teamId ?? null;
  const pageEnabled = isMaster || featureEnabled(team?.features, 'siteStatus');
  const canManage = canManageClosures(isMaster, profile?.rank);

  const [closures, setClosures] = useState<SiteClosure[]>([]);

  // Today is held in state and refreshed on a timer rather than read inline:
  // the server and the browser can disagree on the date at render time, and
  // a board left up on a wall needs to roll over at midnight on its own.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(todayISO());
    const t = setInterval(() => setToday(todayISO()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Which day is on screen, as an offset from today — so the rollover above
  // carries the view with it instead of stranding it on yesterday's date.
  const [dayOffset, setDayOffset] = useState(0);
  const shownDate = today ? shiftISO(today, dayOffset) : null;

  useEffect(() => {
    if (!user || !teamId) {
      setClosures([]);
      return;
    }
    // Mirrors the rule's teamId condition, so the query is provably scoped.
    const unsub = onSnapshot(
      query(collection(db, 'siteClosures'), where('teamId', '==', teamId)),
      (snap) => setClosures(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SiteClosure, 'id'>) }))),
      (error) => console.error('Site closures subscription failed:', error)
    );
    return unsub;
  }, [user, teamId]);

  const closedToday = useMemo(
    () => (shownDate ? closedAreasOn(closures, shownDate) : new Set<string>()),
    [closures, shownDate]
  );
  const shownClosures = useMemo(
    () => (shownDate ? closuresOn(closures, shownDate) : []),
    [closures, shownDate]
  );

  // ---- Display (fullscreen) mode ----
  const boardRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === boardRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      // Not supported on iOS Safari for arbitrary elements — the board just
      // stays as it is, which is still perfectly readable.
      boardRef.current?.requestFullscreen?.().catch(() => {});
    }
  }, []);

  // ---- Manage panel ----
  const [manageOpen, setManageOpen] = useState(false);
  const [area, setArea] = useState('');
  const [reason, setReason] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Default the start date to whichever day is on screen, so closing
  // something while looking at next Tuesday means next Tuesday.
  useEffect(() => {
    if (shownDate && !startDate) setStartDate(shownDate);
  }, [shownDate, startDate]);

  const areaOptions = useMemo(
    () =>
      siteSections().flatMap((s) =>
        s.locations.map((l) => ({ value: l, label: `${s.name} — ${l}` }))
      ),
    []
  );

  const addClosure = async () => {
    if (!user || !teamId) return;
    if (!area) {
      setFormError('Pick the area that’s out of use.');
      return;
    }
    const start = startDate || shownDate;
    if (!start) {
      setFormError('Give it a start date.');
      return;
    }
    if (endDate && endDate < start) {
      setFormError('The end date is before the start date.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const id = genId();
      const payload: Omit<SiteClosure, 'id'> = {
        teamId,
        area,
        startDate: start,
        endDate: endDate || null,
        createdAt: Date.now(),
        createdBy: user.uid,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      };
      await setDoc(doc(db, 'siteClosures', id), payload);
      setArea('');
      setReason('');
      setEndDate('');
    } catch (e) {
      console.error('Failed to mark area out of use:', e);
      setFormError('Could not save — only commanders can close an area.');
    } finally {
      setSaving(false);
    }
  };

  const reopen = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'siteClosures', id));
    } catch (e) {
      console.error('Failed to reopen area:', e);
    }
  };

  const chrome = (body: React.ReactNode) => (
    <div className="flex h-[calc(100vh-4rem)] flex-col md:flex-row">
      <AppMobileNav features={team?.features} isMaster={isMaster} />
      <AppSidebar features={team?.features} isMaster={isMaster} />
      <main className="relative flex-1 overflow-y-auto bg-invictus-base font-sans text-neutral-100">{body}</main>
    </div>
  );

  if (!profileLoading && !pageEnabled) {
    return chrome(
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="max-w-md text-sm text-neutral-500">Site Status isn&apos;t enabled for your team.</p>
      </div>
    );
  }
  if (!user) {
    return chrome(
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="max-w-md text-sm text-neutral-500">Sign in to see what&apos;s out of use on site.</p>
      </div>
    );
  }

  const isToday = dayOffset === 0;

  // The board: header, map, and the list of what's shut. Same markup in and
  // out of fullscreen — only the type scale changes, so there's one layout
  // to keep right rather than two.
  const board = (
    <div
      ref={boardRef}
      className={`flex flex-col gap-4 bg-invictus-base ${isFullscreen ? 'h-screen overflow-hidden p-6' : 'p-5 max-md:p-3'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1
            className={`flex items-center gap-2 font-bold uppercase tracking-widest text-neutral-100 ${
              isFullscreen ? 'text-3xl' : 'text-xl'
            }`}
          >
            <Ban className={isFullscreen ? 'h-7 w-7 text-alert' : 'h-5 w-5 text-alert'} />
            Site Status
          </h1>
          <p className={`mt-1 text-neutral-400 ${isFullscreen ? 'text-xl' : 'text-xs'}`}>
            {shownDate ? formatLongDate(shownDate) : ' '}
            {!isToday && <span className="ml-2 text-invictus-crimson-bright">(not today)</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-neutral-400/25 bg-invictus-surface/60 p-1">
            <button
              onClick={() => setDayOffset((d) => d - 1)}
              className="rounded p-1.5 text-neutral-400 transition-colors hover:text-invictus-crimson-bright"
              title="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDayOffset(0)}
              disabled={isToday}
              className="rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 transition-colors hover:text-invictus-crimson-bright disabled:opacity-40"
            >
              Today
            </button>
            <button
              onClick={() => setDayOffset((d) => d + 1)}
              className="rounded p-1.5 text-neutral-400 transition-colors hover:text-invictus-crimson-bright"
              title="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {canManage && !isFullscreen && (
            <button
              onClick={() => setManageOpen((o) => !o)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                manageOpen
                  ? 'border-invictus-crimson-bright/50 bg-invictus-crimson-bright/10 text-invictus-crimson-bright'
                  : 'border-neutral-400/30 text-neutral-300 hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> Manage
            </button>
          )}
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1.5 rounded-md border border-neutral-400/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:text-invictus-crimson-bright"
            title={isFullscreen ? 'Leave display mode' : 'Display mode — fill the screen'}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {isFullscreen ? 'Exit' : 'Display'}
          </button>
        </div>
      </div>

      <div className={`grid min-h-0 flex-1 gap-4 ${isFullscreen ? 'lg:grid-cols-[1fr_22rem]' : 'lg:grid-cols-[1fr_18rem]'}`}>
        <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-400/20 bg-invictus-surface/40 p-3">
          <SiteStatusMap closedAreas={closedToday} className={isFullscreen ? 'h-full' : 'h-auto'} />
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-alert/30 bg-alert/[0.06] p-4">
            <p
              className={`mb-3 flex items-center gap-2 font-semibold uppercase tracking-widest text-alert ${
                isFullscreen ? 'text-base' : 'text-[11px]'
              }`}
            >
              <Ban className={isFullscreen ? 'h-5 w-5' : 'h-3.5 w-3.5'} />
              Out of use
              <span className="ml-auto rounded bg-alert/20 px-2 py-0.5 font-mono">{shownClosures.length}</span>
            </p>
            {shownClosures.length === 0 ? (
              <p className={`flex items-center gap-2 text-emerald-300 ${isFullscreen ? 'text-2xl' : 'text-sm'}`}>
                <Check className={isFullscreen ? 'h-7 w-7' : 'h-4 w-4'} />
                All areas in use
              </p>
            ) : (
              <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto">
                {shownClosures.map((c) => (
                  <li key={c.id} className="rounded-md border border-alert/25 bg-invictus-base/50 px-3 py-2">
                    <p
                      className={`font-bold uppercase tracking-wide text-neutral-100 ${
                        isFullscreen ? 'text-xl' : 'text-sm'
                      }`}
                    >
                      {c.area}
                    </p>
                    {c.reason && (
                      <p className={`mt-0.5 text-neutral-300 ${isFullscreen ? 'text-base' : 'text-xs'}`}>{c.reason}</p>
                    )}
                    <p
                      className={`mt-1 font-mono uppercase tracking-widest text-neutral-500 ${
                        isFullscreen ? 'text-sm' : 'text-[10px]'
                      }`}
                    >
                      {today ? closureWindowLabel(c, today) : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={`flex items-center gap-4 rounded-xl border border-neutral-400/20 px-4 py-3 ${isFullscreen ? 'text-sm' : 'text-[10px]'}`}>
            <span className="flex items-center gap-2 font-semibold uppercase tracking-widest text-neutral-400">
              <span className="h-3 w-3 rounded border-2 border-[rgb(255_99_115)] bg-alert/30" /> Out of use
            </span>
            <span className="flex items-center gap-2 font-semibold uppercase tracking-widest text-neutral-500">
              <span className="h-3 w-3 rounded border border-neutral-400/30 bg-invictus-raised" /> In use
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return chrome(
    <>
      {board}

      {canManage && manageOpen && (
        <div className="border-t border-neutral-400/20 bg-invictus-surface/30 p-5 max-md:p-3">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-neutral-200">
              <SlidersHorizontal className="h-4 w-4 text-invictus-crimson-bright" /> Manage closures
            </h2>
            <button
              onClick={() => setManageOpen(false)}
              className="rounded-md p-1 text-neutral-500 transition-colors hover:text-neutral-200"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-neutral-400/20 bg-invictus-base/40 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                Mark an area out of use
              </p>
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-widest text-neutral-500">Area</label>
                <InvictusSelect
                  value={area}
                  onChange={setArea}
                  options={[{ value: '', label: 'Choose an area…' }, ...areaOptions]}
                  title="Area out of use"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-widest text-neutral-500">From</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-widest text-neutral-500">
                    To <span className="text-neutral-600">(blank = until reopened)</span>
                  </label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-widest text-neutral-500">Reason (optional)</label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Resurfacing — scaffold up"
                  className={inputClass}
                />
              </div>
              {formError && <p className="text-xs text-alert">{formError}</p>}
              <button
                onClick={addClosure}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-md border border-alert/40 bg-alert/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-alert transition-colors hover:bg-alert/20 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Mark out of use
              </button>
            </div>

            <div className="rounded-xl border border-neutral-400/20 bg-invictus-base/40 p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                Every closure ({closures.length})
              </p>
              {closures.length === 0 ? (
                <p className="text-sm text-neutral-500">Nothing is marked out of use.</p>
              ) : (
                <ul className="max-h-80 space-y-2 overflow-y-auto">
                  {[...closures]
                    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.area.localeCompare(b.area))
                    .map((c) => {
                      const past = today ? closureIsPast(c, today) : false;
                      return (
                        <li
                          key={c.id}
                          className={`flex items-start gap-3 rounded-md border px-3 py-2 ${
                            past ? 'border-neutral-400/15 opacity-50' : 'border-neutral-400/25'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-neutral-100">{c.area}</p>
                            {c.reason && <p className="text-xs text-neutral-400">{c.reason}</p>}
                            <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                              <CalendarDays className="h-3 w-3" />
                              {today ? closureWindowLabel(c, today) : ''}
                              {past && <span className="text-neutral-600">· finished</span>}
                            </p>
                          </div>
                          <button
                            onClick={() => reopen(c.id)}
                            className="shrink-0 rounded-md border border-neutral-400/30 p-1.5 text-neutral-400 transition-colors hover:border-emerald-400/50 hover:text-emerald-300"
                            title="Reopen this area"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
