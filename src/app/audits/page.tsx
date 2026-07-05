'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, ExternalLink, ChevronDown, Plus, Trash2, Search } from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';

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

// Small HUD corner accents to echo the INVICTUS panels.
function Corners() {
  const base = 'pointer-events-none absolute h-2 w-2 border-invictus-crimson-bright/40';
  return (
    <>
      <span className={`${base} left-0 top-0 border-l border-t`} />
      <span className={`${base} right-0 top-0 border-r border-t`} />
      <span className={`${base} bottom-0 left-0 border-b border-l`} />
      <span className={`${base} bottom-0 right-0 border-b border-r`} />
    </>
  );
}

const inputClass =
  'w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-surface/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50';

export default function AuditsPage() {
  const { user } = useAuth();
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
    const unsub = onSnapshot(
      collection(db, 'auditForms'),
      (snap) => setCustom(snap.docs.map((d) => ({ ...(d.data() as Omit<CustomAudit, 'id'>), id: d.id }))),
      (error) => console.error('Audits subscription failed:', error)
    );
    return unsub;
  }, [user]);

  // Core audits first, then team categories in the order they were created.
  // Team audits without a category join the core group.
  const groups = useMemo(() => {
    const list: { name: string; audits: DisplayAudit[] }[] = [{ name: CORE_GROUP, audits: [...AUDITS] }];
    for (const c of [...custom].sort((a, b) => a.createdAt - b.createdAt)) {
      const cat = (c.category ?? '').trim() || CORE_GROUP;
      const entry: DisplayAudit = { name: c.name, url: c.url, custom: c };
      const target = list.find((g) => g.name.trim().toLowerCase() === cat.toLowerCase());
      if (target) target.audits.push(entry);
      else list.push({ name: cat, audits: [entry] });
    }
    return list;
  }, [custom]);

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
    setDoc(doc(db, 'auditForms', genId()), {
      name: name.trim(),
      url: link,
      category: category === CORE_GROUP ? '' : category,
      createdAt: Date.now(),
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
    <div key={audit.custom?.id ?? audit.url} className="relative">
      <a
        href={audit.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative flex h-full items-center justify-between gap-3 border border-neutral-400/25 bg-invictus-surface/60 px-4 py-3 shadow-glow-subtle backdrop-blur-sm transition-all hover:border-invictus-crimson-bright/60 hover:shadow-glow-strong"
      >
        <Corners />
        <span className={`font-display text-[11px] uppercase leading-snug tracking-[0.08em] text-neutral-100 ${audit.custom ? 'pr-14' : ''}`}>
          {audit.name}
        </span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-neutral-600 transition-colors group-hover:text-invictus-crimson-bright" />
      </a>
      {audit.custom && user && (
        <button
          onClick={() => handleDelete(audit.custom!)}
          onMouseLeave={() => setConfirmDeleteId((cur) => (cur === audit.custom!.id ? null : cur))}
          title={confirmDeleteId === audit.custom.id ? 'Click again to delete' : `Delete ${audit.name}`}
          className={`absolute right-9 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 rounded-md border px-1.5 py-1 text-[9px] font-semibold uppercase tracking-widest transition-all ${
            confirmDeleteId === audit.custom.id
              ? 'border-red-500/70 bg-red-500/20 text-red-300'
              : 'border-neutral-400/30 bg-invictus-base/70 text-neutral-500 hover:border-red-500/50 hover:text-red-400'
          }`}
        >
          <Trash2 className="h-3 w-3" />
          {confirmDeleteId === audit.custom.id ? 'Sure?' : ''}
        </button>
      )}
    </div>
  );

  return (
    <div className="relative min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-invictus-base font-sans text-neutral-100">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-neutral-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-neutral-500/10 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 z-0 animate-scanlines opacity-[0.06] mix-blend-screen"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0.6) 1px, transparent 1px, transparent 8px)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:py-10">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <ClipboardList className="h-8 w-8 text-invictus-crimson-bright drop-shadow-glow-subtle" />
          <div>
            <h1 className="font-display text-2xl uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)] sm:text-3xl">
              Audits
            </h1>
            <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-500">
              {totalCount} audits · opens in Microsoft Forms
            </p>
          </div>
        </div>

        {/* Add an audit */}
        {user ? (
          <form
            onSubmit={handleAdd}
            className="relative mb-8 space-y-3 border border-neutral-400/25 bg-invictus-surface/60 p-5 shadow-glow-subtle backdrop-blur-sm"
          >
            <Corners />
            <p className="font-display text-sm uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)]">
              <Plus className="mr-1 inline h-4 w-4 text-invictus-crimson-bright" />
              Add an audit
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <select
                value={categoryChoice}
                onChange={(e) => setCategoryChoice(e.target.value)}
                className={inputClass}
                title="Which group this audit belongs to"
              >
                {groups.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name}
                  </option>
                ))}
                <option value={NEW_CATEGORY}>+ New category…</option>
              </select>
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
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong"
            >
              <Plus className="h-4 w-4" /> Add Audit
            </button>
            <p className="text-center text-[10px] uppercase tracking-widest text-neutral-600">
              Added audits appear for the whole team
            </p>
          </form>
        ) : (
          <p className="mb-8 text-center text-xs uppercase tracking-widest text-neutral-600">
            Sign in to add audits
          </p>
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
              className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-neutral-500 transition-colors hover:text-invictus-crimson-bright"
            >
              {openSections.size === groups.length ? 'Collapse all' : 'Expand all'}
            </button>
          )}
        </div>

        {searchResults ? (
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-neutral-600">
              {searchResults.length} match{searchResults.length === 1 ? '' : 'es'}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{searchResults.map(renderCard)}</div>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const isOpen = openSections.has(group.name);
              return (
                <section key={group.name} className="space-y-3">
                  <button
                    onClick={() => toggleSection(group.name)}
                    className="group/hdr flex w-full items-center gap-3 text-left"
                    aria-expanded={isOpen}
                  >
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-invictus-crimson-bright transition-transform ${isOpen ? '' : '-rotate-90'}`}
                    />
                    <h2 className="font-display text-xl uppercase tracking-[0.2em] text-neutral-100 transition-colors [text-shadow:var(--glow-text-strong)] group-hover/hdr:text-invictus-crimson-bright sm:text-2xl">
                      {group.name}
                    </h2>
                    <span className="rounded-full border border-invictus-crimson-bright/50 bg-invictus-crimson-bright/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-200">
                      {group.audits.length}
                    </span>
                    <span className="h-px flex-1 bg-invictus-crimson-bright/25" />
                  </button>
                  {isOpen && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{group.audits.map(renderCard)}</div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <p className="pt-8 text-center text-[10px] uppercase tracking-widest text-neutral-700">
          Each audit opens its live Microsoft Form in a new tab
        </p>
      </div>
    </div>
  );
}
