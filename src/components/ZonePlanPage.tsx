'use client';

// The shared page body behind every zone's floor-plan drill-down (see
// app/site-map/*/page.tsx) — a 2.5D isometric floor plan with clickable
// safety-equipment pins. Each pin is a SiteAsset: a real Firestore doc with
// its own compliance due-date, so this is a visual index into live data
// rather than a static picture. One thin page per zone just supplies the
// plan; everything else (subscriptions, CRUD, seeding, chrome) lives here.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { AppSidebar, AppMobileNav } from '@/components/AppSidebar';
import { ZoneFloorPlan } from '@/components/ZoneFloorPlan';
import { featureEnabled, rankOf } from '@/lib/teams';
import type { ZonePlan } from '@/lib/zonePlans';
import type { AssetMount, AssetType, SiteAsset } from '@/lib/assets';

const genId = () => `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const RULES_HINT =
  "Can't reach this zone's pins — publish the latest Firestore rules (the assets block) in the Firebase Console, then reload.";

export function ZonePlanPage({ plan }: { plan: ZonePlan }) {
  const { user } = useAuth();
  const { profile, team, isMaster, loading: profileLoading } = useProfile();
  const teamId = profile?.teamId ?? null;
  const pageEnabled = isMaster || featureEnabled(team?.features, 'siteMap');
  const canEdit = isMaster || rankOf(profile) !== 'viewer';

  const [assets, setAssets] = useState<SiteAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (!user || !teamId) {
      setAssets([]);
      return;
    }
    return onSnapshot(
      query(collection(db, 'assets'), where('teamId', '==', teamId), where('zone', '==', plan.zone)),
      (snap) => {
        setError(null);
        setAssets(snap.docs.map((d) => ({ ...(d.data() as Omit<SiteAsset, 'id'>), id: d.id })));
      },
      (e) => {
        console.error('Assets subscription failed:', e);
        setError(RULES_HINT);
      }
    );
  }, [user, teamId, plan.zone]);

  const create = async (draft: { type: AssetType; name: string; x: number; y: number; mount: AssetMount }) => {
    if (!user || !teamId) throw new Error('You need to be in a team to add a pin.');
    const id = genId();
    await setDoc(doc(db, 'assets', id), {
      id,
      ...draft,
      zone: plan.zone,
      teamId,
      createdAt: Date.now(),
      createdBy: user.uid,
    } satisfies SiteAsset);
  };

  const update = async (id: string, changes: Partial<SiteAsset>) => {
    await updateDoc(doc(db, 'assets', id), changes);
  };

  const remove = async (id: string) => {
    await deleteDoc(doc(db, 'assets', id));
  };

  const seedStarters = async () => {
    if (!user || !teamId) return;
    setSeeding(true);
    setError(null);
    try {
      for (const starter of plan.starterAssets) {
        const id = genId();
        await setDoc(doc(db, 'assets', id), {
          id,
          type: starter.type,
          name: starter.name,
          x: starter.x,
          y: starter.y,
          mount: starter.mount,
          zone: plan.zone,
          teamId,
          createdAt: Date.now(),
          createdBy: user.uid,
        } satisfies SiteAsset);
      }
    } catch (err) {
      console.error('Failed to seed starter pins:', err);
      setError(RULES_HINT);
    } finally {
      setSeeding(false);
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
        <p className="max-w-md text-sm text-neutral-500">Site Map isn&apos;t enabled for your team.</p>
      </div>
    );
  }

  return chrome(
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/jarvis-tracker?page=sitemap"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Site Map
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-100 sm:text-3xl">{plan.zone}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Fire exits, emergency lighting and other safety equipment, pinned to where they actually are.
          </p>
        </div>
        {canEdit && assets.length === 0 && (
          <button
            onClick={seedStarters}
            disabled={seeding}
            className="flex items-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" /> {seeding ? 'Loading…' : 'Load reference pins'}
          </button>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-300">{error}</p>
      )}

      <ZoneFloorPlan plan={plan} assets={assets} canEdit={canEdit} onCreate={create} onUpdate={update} onDelete={remove} />
    </div>
  );
}
