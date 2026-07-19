'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, ExternalLink, ChevronRight, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { InvictusSelect } from '@/components/InvictusSelect';
import { CHECKLIST_SECTIONS } from '@/lib/checklists';
import { DREAMLAND_TEAM_ID, featureEnabled } from '@/lib/teams';
import { AppSidebar, AppMobileNav } from '@/components/AppSidebar';

// Checklists — a directory of Mobaro / Microsoft Forms checklists, grouped into
// sections. The built-in sections live in @/lib/checklists (the Show Board
// reuses them); anything the team adds here is stored in the shared
// `checklistForms` collection and shows for everyone, live.

interface CustomChecklist {
  id: string;
  section: string;
  name: string;
  description?: string;
  url: string;
  createdAt: number;
  teamId?: string;
}

interface DisplayForm {
  name: string;
  description?: string;
  url: string;
  custom?: CustomChecklist; // present when this entry is team-added (deletable)
}

const NEW_CATEGORY = '__new__';

function genId() {
  return `cf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Small HUD corner accents to echo the INVICTUS panels.
function Corners() {
  const base = 'pointer-events-none absolute h-2.5 w-2.5 border-invictus-crimson-bright/40';
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

export default function ChecklistsPage() {
  const { user } = useAuth();
  const { profile, team, isMaster, loading: profileLoading } = useProfile();
  const teamId = profile?.teamId ?? null;
  const isDreamland = teamId === DREAMLAND_TEAM_ID;
  const pageEnabled = isMaster || featureEnabled(team?.features, 'checklists');
  const [custom, setCustom] = useState<CustomChecklist[]>([]);

  // Add-checklist form state.
  const [sectionChoice, setSectionChoice] = useState(CHECKLIST_SECTIONS[0]?.name ?? NEW_CATEGORY);
  const [newCategory, setNewCategory] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Which category sections are expanded — all start collapsed for a tidy page.
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const toggleSection = (name: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  useEffect(() => {
    if (!user || !teamId) {
      setCustom([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'checklistForms'), where('teamId', '==', teamId)),
      (snap) =>
        setCustom(snap.docs.map((d) => ({ ...(d.data() as Omit<CustomChecklist, 'id'>), id: d.id }))),
      (error) => console.error('Checklists subscription failed:', error)
    );
    return unsub;
  }, [user, teamId]);

  // Built-in sections first (in their fixed order), then team-added categories
  // in the order they were created. Team-added checklists slot into an existing
  // section when the category name matches.
  const sections = useMemo(() => {
    // Built-in sections are Dreamland's; other teams start empty and add their own.
    const merged: { name: string; forms: DisplayForm[] }[] = isDreamland
      ? CHECKLIST_SECTIONS.map((s) => ({ name: s.name, forms: s.forms.map((f) => ({ ...f })) }))
      : [];
    for (const c of [...custom].sort((a, b) => a.createdAt - b.createdAt)) {
      const entry: DisplayForm = { name: c.name, description: c.description, url: c.url, custom: c };
      const target = merged.find((s) => s.name.trim().toLowerCase() === c.section.trim().toLowerCase());
      if (target) target.forms.push(entry);
      else merged.push({ name: c.section, forms: [entry] });
    }
    return merged;
  }, [custom, isDreamland]);

  const sectionNames = sections.map((s) => s.name);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const section = sectionChoice === NEW_CATEGORY ? newCategory.trim() : sectionChoice;
    if (!section) {
      setFormError('Give the new category a name.');
      return;
    }
    if (!name.trim()) {
      setFormError('Give the checklist a title.');
      return;
    }
    const link = url.trim();
    if (!/^https:\/\/.+/i.test(link)) {
      setFormError('Paste the full form link — it should start with https://');
      return;
    }
    if (!teamId) {
      setFormError('You need to be in a team to add checklists.');
      return;
    }
    const id = genId();
    setDoc(doc(db, 'checklistForms', id), {
      section,
      name: name.trim(),
      description: description.trim(),
      url: link,
      createdAt: Date.now(),
      teamId,
    }).catch((error) => {
      console.error('Failed to add checklist:', error);
      setFormError('Save failed — check your connection and that the database rules allow it.');
    });
    setName('');
    setDescription('');
    setUrl('');
    if (sectionChoice === NEW_CATEGORY) {
      setSectionChoice(section);
      setNewCategory('');
    }
  };

  const handleDelete = (c: CustomChecklist) => {
    if (confirmDeleteId !== c.id) {
      setConfirmDeleteId(c.id);
      return;
    }
    setConfirmDeleteId(null);
    deleteDoc(doc(db, 'checklistForms', c.id)).catch((error) =>
      console.error('Failed to delete checklist:', error)
    );
  };

  if (!profileLoading && !pageEnabled) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col md:flex-row">
        <AppMobileNav features={team?.features} isMaster={isMaster} />
        <AppSidebar features={team?.features} isMaster={isMaster} />
        <div className="flex flex-1 items-center justify-center bg-invictus-base px-4 text-center font-sans">
          <p className="max-w-md text-xs uppercase tracking-widest text-neutral-500">
            Checklists isn&apos;t enabled for your team.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col md:flex-row">
      <AppMobileNav features={team?.features} isMaster={isMaster} />
      <AppSidebar features={team?.features} isMaster={isMaster} />
      <main className="relative flex-1 overflow-y-auto bg-invictus-base font-sans text-neutral-100">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-neutral-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-neutral-500/10 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:py-10">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <ClipboardCheck className="h-8 w-8 text-invictus-crimson-bright drop-shadow-glow-subtle" />
          <div>
            <h1 className="font-display text-2xl uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)] sm:text-3xl">
              Checklists
            </h1>
            <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-500">
              Team &amp; set-up checklists · opens in Microsoft Forms
            </p>
          </div>
        </div>

        {/* Add a checklist */}
        {user ? (
          <form
            onSubmit={handleAdd}
            className="relative mb-10 space-y-3 border border-neutral-400/25 bg-invictus-surface/60 p-5 shadow-glow-subtle backdrop-blur-sm"
          >
            <Corners />
            <p className="font-display text-sm uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)]">
              <Plus className="mr-1 inline h-4 w-4 text-invictus-crimson-bright" />
              Add a checklist
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InvictusSelect
                value={sectionChoice}
                onChange={setSectionChoice}
                title="Which category this checklist belongs to"
                options={[
                  ...sectionNames.map((s) => ({ value: s, label: s })),
                  { value: NEW_CATEGORY, label: '+ New category…' },
                ]}
              />
              {sectionChoice === NEW_CATEGORY ? (
                <input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="New category name (e.g. Rides)"
                  className={inputClass}
                />
              ) : (
                <span className="hidden sm:block" />
              )}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Checklist title (e.g. Ride Ops Opening Checklist)"
                className={inputClass}
              />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Microsoft Forms link (https://forms.office.com/…)"
                className={inputClass}
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description (optional)"
                className={`${inputClass} sm:col-span-2`}
              />
            </div>
            {formError && <p className="text-xs text-red-400">{formError}</p>}
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong"
            >
              <Plus className="h-4 w-4" /> Add Checklist
            </button>
            <p className="text-center text-[10px] uppercase tracking-widest text-neutral-600">
              Added checklists appear for the whole team
            </p>
          </form>
        ) : (
          <p className="mb-10 text-center text-xs uppercase tracking-widest text-neutral-600">
            Sign in to add categories and checklists
          </p>
        )}

        <div className="mb-3 flex justify-end">
          <button
            onClick={() =>
              setOpenSections((prev) =>
                prev.size === sections.length ? new Set() : new Set(sections.map((s) => s.name))
              )
            }
            className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 transition-colors hover:text-invictus-crimson-bright"
          >
            {openSections.size === sections.length ? 'Collapse all' : 'Expand all'}
          </button>
        </div>

        <div className="space-y-4">
          {sections.map((section) => {
            const isOpen = openSections.has(section.name);
            return (
            <section key={section.name} className="space-y-3">
              <button
                onClick={() => toggleSection(section.name)}
                className="group/hdr flex w-full items-center gap-3 text-left"
                aria-expanded={isOpen}
              >
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-invictus-crimson-bright transition-transform ${isOpen ? '' : '-rotate-90'}`}
                />
                <h2 className="font-display text-xl uppercase tracking-[0.2em] text-neutral-100 transition-colors [text-shadow:var(--glow-text-strong)] group-hover/hdr:text-invictus-crimson-bright sm:text-2xl">
                  {section.name}
                </h2>
                <span className="rounded-full border border-invictus-crimson-bright/50 bg-invictus-crimson-bright/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-200">
                  {section.forms.length}
                </span>
                <span className="h-px flex-1 bg-invictus-crimson-bright/25" />
              </button>

              {isOpen && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {section.forms.map((form) => (
                  <div key={form.custom?.id ?? form.url} className="relative">
                    <a
                      href={form.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative flex h-full flex-col gap-2 border border-neutral-400/25 bg-invictus-surface/60 p-5 shadow-glow-subtle backdrop-blur-sm transition-all hover:border-invictus-crimson-bright/60 hover:shadow-glow-strong"
                    >
                      <Corners />
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display text-sm uppercase tracking-[0.12em] text-neutral-100">{form.name}</h3>
                        <ExternalLink className="h-4 w-4 shrink-0 text-neutral-600 transition-colors group-hover:text-invictus-crimson-bright" />
                      </div>
                      {form.description && (
                        <p className="text-xs leading-relaxed text-neutral-400">{form.description}</p>
                      )}
                      <span className="mt-auto flex items-center gap-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-invictus-crimson-bright">
                        Open form <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </a>
                    {form.custom && user && (
                      <button
                        onClick={() => handleDelete(form.custom!)}
                        onMouseLeave={() => setConfirmDeleteId((cur) => (cur === form.custom!.id ? null : cur))}
                        title={confirmDeleteId === form.custom.id ? 'Click again to delete' : `Delete ${form.name}`}
                        className={`absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-md border px-2 py-1 text-[9px] font-semibold uppercase tracking-widest transition-all ${
                          confirmDeleteId === form.custom.id
                            ? 'border-red-500/70 bg-red-500/20 text-red-300'
                            : 'border-neutral-400/30 bg-invictus-base/70 text-neutral-500 hover:border-red-500/50 hover:text-red-400'
                        }`}
                      >
                        <Trash2 className="h-3 w-3" />
                        {confirmDeleteId === form.custom.id ? 'Sure?' : ''}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              )}
            </section>
            );
          })}
        </div>

        <p className="pt-8 text-center text-[10px] uppercase tracking-widest text-neutral-700">
          Each checklist opens its live Microsoft Form in a new tab
        </p>
      </div>
      </main>
    </div>
  );
}
