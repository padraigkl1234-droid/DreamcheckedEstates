'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, ChevronDown, Plus, Trash2, Search } from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, query as fsQuery, setDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { InvictusSelect } from '@/components/InvictusSelect';
import { Button } from '@/components/ui/button';
import { DREAMLAND_TEAM_ID, featureEnabled } from '@/lib/teams';
import { AppSidebar, AppMobileNav } from '@/components/AppSidebar';

// ---------------------------------------------------------------------------
// Audits — a directory of audit Microsoft Forms in collapsible groups. The
// built-in list lives under "Core Audits"; anything the team adds is stored in
// the shared `auditForms` collection (optionally under its own category) and
// shows for everyone, live. A search box cuts across all groups.
// ---------------------------------------------------------------------------

interface Audit {
  name: string;
  url: string;
}

interface CustomAudit extends Audit {
  id: string;
  category?: string;
  createdAt: number;
  teamId?: string;
}

type DisplayAudit = Audit & { custom?: CustomAudit };

const CORE_GROUP = 'Core Audits';
const NEW_CATEGORY = '__new__';

function genId() {
  return `af-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const AUDITS: Audit[] = [
  { name: 'Working at Height — Maintenance Records Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUOUdQVDZHOFFNUTNVVlZPWldNODdHWlc3Ny4u' },
  { name: 'Stage Rigging Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUNlc1RlVGR1c1R1ZTR0lBVFQwQUxFRkxCUy4u' },
  { name: 'Staff Training Records Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUMjhJOVkzUUFHNk1MSkdGMU1WOU5HRzNHWS4u' },
  { name: 'Smoke Control / Ventilation Systems Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUMThLRFVKS0NCWFVXTE5YM08zQVZFVURJSi4u' },
  { name: 'Scenic Shows Ingress Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUNEVQNzMxQlQ1MklJT0taNE4yM0VUQ1AzQS4u' },
  { name: 'Ride Operation / Training Procedures Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUQ09XRzAwNEZEV0ROWjlGSlQ1RDJRRUhNNC4u' },
  { name: 'Pest Control Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUN1FDOTNUWDZLWlFRMDVVMEREN0RDM0MwOC4u' },
  { name: 'PAT Testing Records Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUNkJQQTZVTzk1QUxZSExXM0UyTzdNN1hSSi4u' },
  { name: 'Maintenance & Engineering RA’s for Job Specific Tasks Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUQVc4TThPN1RRWkNTUjVPQTVTMUJYV0dFNi4u' },
  { name: 'LOLER, PUWER, PSSR Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUNExCU0s3OTBBQUFYVzdER0JZSDNBSzlQQS4u' },
  { name: 'Ladder Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUOVVNSTlGTTZaR003WjNCMktGQlRUSjM0Ni4u' },
  { name: 'Inspection & Maintenance / Daily Checks Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUQTBVN045SVpFWDMwOElRRkNRMk85TFNUMS4u' },
  { name: 'Gas Safe Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUOThaOTc0SktLNU5ONVVER1lUM1Y3OVZaUC4u' },
  { name: 'Food Related Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUMDZXMjVHQVFZWkU0VlZUV1RFNDVBNkhWQy4u' },
  { name: 'Fire Extinguisher Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUQkZKOTNDOTk5SjdOVFk3UzVLOFVLTUJWWC4u' },
  { name: 'Fire Evacuation Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUQVM5RjBGOUxZSEhIQ0dUMFRKODFXVDFTQi4u' },
  { name: 'Fire Door Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUN0Y3WDRGQzM3TlRSVURQQTBXNEpaMEtENy4u' },
  { name: 'Fire Alarm Test Records Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUMDRQU1pEVUVHNjg2Q1cyVThISUMxMlRXTC4u' },
  { name: 'Event Management Sheet Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUNUFHME5YSE5CQzNWVUFVVk41U1JTVUkzWi4u' },
  { name: 'Emergency Lighting Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUNEJEN1haUloxRDRVRVk0NVlaWDlLWlZGTS4u' },
  { name: 'Departmental Risk Assessment Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUQkRTTktBRURaNVdLSUUzT0c5OFlUQlg5RS4u' },
  { name: 'Dangerous Equipment Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUOVA3RVNONkZEUE4xUTY1UFNTUkVUTFhWMC4u' },
  { name: 'COSHH Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUN0VFWDRWUDBIUTQ4NkkxVlhMSVZEUkZQWi4u' },
  { name: 'Daily Check Sheet — Park Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUM0FFODJUWEQyMURGNFg0RFRIVkxTQU9VVy4u' },
  { name: 'Control Room Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUMzdDNzZYS0NUSk83WFYwTU00V0FHNFg4Qy4u' },
  { name: 'Cable Management Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUMzdLRFI0MDQxNDJYNUhWS01ROUU4SFFLSC4u' },
  { name: 'Ansul Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUQ1dJMlY5NEMzRlQxVUZVSjYyTFEyMzdXUS4u' },
  { name: 'Accident Record Audit', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUODcwUEREVFNLMUJXVlFBNEFDVFpLWklLUi4u' },
];

const inputClass =
  'w-full min-w-0 rounded-md border border-neutral-400/20 bg-invictus-raised px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-400/50 focus:outline-none focus:ring-1 focus:ring-neutral-400/30';

export default function AuditsPage() {
  const { user } = useAuth();
  const { profile, team, isMaster, loading: profileLoading } = useProfile();
  const teamId = profile?.teamId ?? null;
  const isDreamland = teamId === DREAMLAND_TEAM_ID;
  const pageEnabled = isMaster || featureEnabled(team?.features, 'audits');
  const [custom, setCustom] = useState<CustomAudit[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [categoryChoice, setCategoryChoice] = useState(CORE_GROUP);
  const [newCategory, setNewCategory] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  const toggleSection = (sectionName: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionName)) next.delete(sectionName);
      else next.add(sectionName);
      return next;
    });

  useEffect(() => {
    if (!user) {
      setCustom([]);
      return;
    }
    if (!teamId) {
      setCustom([]);
      return;
    }
    const unsub = onSnapshot(
      fsQuery(collection(db, 'auditForms'), where('teamId', '==', teamId)),
      (snap) => setCustom(snap.docs.map((d) => ({ ...(d.data() as Omit<CustomAudit, 'id'>), id: d.id }))),
      (error) => console.error('Audits subscription failed:', error)
    );
    return unsub;
  }, [user, teamId]);

  // Core audits first, then team categories in the order they were created.
  // Team audits without a category join the core group.
  const groups = useMemo(() => {
    // The built-in Core Audits are Dreamland's; other teams start empty.
    const list: { name: string; audits: DisplayAudit[] }[] = isDreamland
      ? [{ name: CORE_GROUP, audits: [...AUDITS] }]
      : [];
    for (const c of [...custom].sort((a, b) => a.createdAt - b.createdAt)) {
      const cat = (c.category ?? '').trim() || CORE_GROUP;
      const entry: DisplayAudit = { name: c.name, url: c.url, custom: c };
      const target = list.find((g) => g.name.trim().toLowerCase() === cat.toLowerCase());
      if (target) target.audits.push(entry);
      else list.push({ name: cat, audits: [entry] });
    }
    return list;
  }, [custom, isDreamland]);

  const totalCount = groups.reduce((sum, g) => sum + g.audits.length, 0);
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return groups.flatMap((g) => g.audits.filter((a) => a.name.toLowerCase().includes(q)));
  }, [groups, query]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const category = categoryChoice === NEW_CATEGORY ? newCategory.trim() : categoryChoice;
    if (categoryChoice === NEW_CATEGORY && !category) {
      setFormError('Give the new category a name.');
      return;
    }
    if (!name.trim()) {
      setFormError('Give the audit a title.');
      return;
    }
    const link = url.trim();
    if (!/^https:\/\/.+/i.test(link)) {
      setFormError('Paste the full form link — it should start with https://');
      return;
    }
    if (!teamId) {
      setFormError('You need to be in a team to add audits.');
      return;
    }
    setDoc(doc(db, 'auditForms', genId()), {
      name: name.trim(),
      url: link,
      category: category === CORE_GROUP ? '' : category,
      createdAt: Date.now(),
      teamId,
    }).catch((error) => {
      console.error('Failed to add audit:', error);
      setFormError('Save failed — check your connection and that the database rules allow it.');
    });
    setName('');
    setUrl('');
    if (categoryChoice === NEW_CATEGORY) {
      setCategoryChoice(category);
      setNewCategory('');
    }
  };

  const handleDelete = (a: CustomAudit) => {
    if (confirmDeleteId !== a.id) {
      setConfirmDeleteId(a.id);
      return;
    }
    setConfirmDeleteId(null);
    deleteDoc(doc(db, 'auditForms', a.id)).catch((error) => console.error('Failed to delete audit:', error));
  };

  const renderCard = (audit: DisplayAudit) => (
    <div key={audit.custom?.id ?? audit.url} className="group relative flex items-center gap-2 py-3">
      <a
        href={audit.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-center justify-between gap-3"
      >
        <span className="min-w-0 truncate text-sm leading-snug text-neutral-100">{audit.name}</span>
        <ExternalLink className="h-4 w-4 shrink-0 text-neutral-600 transition-colors group-hover:text-neutral-300" />
      </a>
      {audit.custom && user && (
        <button
          onClick={() => handleDelete(audit.custom!)}
          onMouseLeave={() => setConfirmDeleteId((cur) => (cur === audit.custom!.id ? null : cur))}
          title={confirmDeleteId === audit.custom.id ? 'Click again to delete' : `Delete ${audit.name}`}
          className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
            confirmDeleteId === audit.custom.id
              ? 'border-red-500/70 bg-red-500/20 text-red-300'
              : 'border-neutral-400/20 bg-invictus-base text-neutral-500 hover:border-red-500/50 hover:text-red-400'
          }`}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  if (!profileLoading && !pageEnabled) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col md:flex-row">
        <AppMobileNav features={team?.features} isMaster={isMaster} />
        <AppSidebar features={team?.features} isMaster={isMaster} />
        <div className="flex flex-1 items-center justify-center bg-invictus-base px-4 text-center font-sans">
          <p className="max-w-md text-sm text-neutral-500">Audits isn&apos;t enabled for your team.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col md:flex-row">
      <AppMobileNav features={team?.features} isMaster={isMaster} />
      <AppSidebar features={team?.features} isMaster={isMaster} />
      <main className="relative flex-1 overflow-y-auto bg-invictus-base font-sans text-neutral-100">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-neutral-100 sm:text-3xl">Audits</h1>
          <p className="mt-1 text-sm text-neutral-500">{totalCount} audits · opens in Microsoft Forms</p>
        </div>

        {/* Add an audit */}
        {user ? (
          <form
            onSubmit={handleAdd}
            className="mb-8 space-y-3 rounded-2xl border border-neutral-400/20 bg-invictus-surface p-5"
          >
            <p className="flex items-center gap-1.5 text-sm font-semibold text-neutral-100">
              <Plus className="h-4 w-4 text-neutral-500" />
              Add an audit
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InvictusSelect
                value={categoryChoice}
                onChange={setCategoryChoice}
                title="Which group this audit belongs to"
                options={[
                  ...groups.map((g) => ({ value: g.name, label: g.name })),
                  { value: NEW_CATEGORY, label: '+ New category…' },
                ]}
              />
              {categoryChoice === NEW_CATEGORY ? (
                <input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="New category name (e.g. Fire Safety)"
                  className={inputClass}
                />
              ) : (
                <span className="hidden sm:block" />
              )}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Audit title (e.g. Scaffold Register Audit)"
                className={inputClass}
              />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Microsoft Forms link (https://forms.office.com/…)"
                className={inputClass}
              />
            </div>
            {formError && <p className="text-xs text-red-400">{formError}</p>}
            <Button type="submit" className="w-full gap-2">
              <Plus className="h-4 w-4" /> Add audit
            </Button>
            <p className="text-center text-xs text-neutral-500">Added audits appear for the whole team</p>
          </form>
        ) : (
          <p className="mb-8 text-center text-sm text-neutral-500">Sign in to add audits</p>
        )}

        {/* Search + expand controls */}
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-600" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search audits…"
              className={`${inputClass} pl-9`}
            />
          </div>
          {!query && (
            <button
              onClick={() =>
                setOpenSections((prev) =>
                  prev.size === groups.length ? new Set() : new Set(groups.map((g) => g.name))
                )
              }
              className="shrink-0 text-xs font-semibold text-neutral-500 transition-colors hover:text-neutral-300"
            >
              {openSections.size === groups.length ? 'Collapse all' : 'Expand all'}
            </button>
          )}
        </div>

        {searchResults ? (
          <div className="space-y-3">
            <p className="text-xs text-neutral-500">
              {searchResults.length} match{searchResults.length === 1 ? '' : 'es'}
            </p>
            <div className="divide-y divide-neutral-400/15 rounded-2xl border border-neutral-400/20 bg-invictus-surface px-4">
              {searchResults.map(renderCard)}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const isOpen = openSections.has(group.name);
              return (
                <section key={group.name} className="overflow-hidden rounded-2xl border border-neutral-400/20 bg-invictus-surface">
                  <button
                    onClick={() => toggleSection(group.name)}
                    className="flex w-full items-center gap-3 p-4 text-left"
                    aria-expanded={isOpen}
                  >
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${isOpen ? '' : '-rotate-90'}`}
                    />
                    <h2 className="flex-1 text-base font-semibold text-neutral-100">{group.name}</h2>
                    <span className="rounded-full bg-invictus-raised px-2.5 py-0.5 text-xs font-medium text-neutral-400">
                      {group.audits.length}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="divide-y divide-neutral-400/15 border-t border-neutral-400/15 px-4">
                      {group.audits.map(renderCard)}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <p className="pt-8 text-center text-xs text-neutral-600">
          Each audit opens its live Microsoft Form in a new tab
        </p>
      </div>
      </main>
    </div>
  );
}
