'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { InvictusSelect } from '@/components/InvictusSelect';
import { Button } from '@/components/ui/button';
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

const inputClass =
  'w-full min-w-0 rounded-md border border-neutral-400/20 bg-invictus-raised px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-400/50 focus:outline-none focus:ring-1 focus:ring-neutral-400/30';

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
          <p className="max-w-md text-sm text-neutral-500">Checklists isn&apos;t enabled for your team.</p>
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
          <h1 className="text-2xl font-bold text-neutral-100 sm:text-3xl">Checklists</h1>
          <p className="mt-1 text-sm text-neutral-500">Team &amp; set-up checklists · opens in Microsoft Forms</p>
        </div>

        {/* Add a checklist */}
        {user ? (
          <form
            onSubmit={handleAdd}
            className="mb-10 space-y-3 rounded-2xl border border-neutral-400/20 bg-invictus-surface p-5"
          >
            <p className="flex items-center gap-1.5 text-sm font-semibold text-neutral-100">
              <Plus className="h-4 w-4 text-neutral-500" />
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
            <Button type="submit" className="w-full gap-2">
              <Plus className="h-4 w-4" /> Add checklist
            </Button>
            <p className="text-center text-xs text-neutral-500">Added checklists appear for the whole team</p>
          </form>
        ) : (
          <p className="mb-10 text-center text-sm text-neutral-500">Sign in to add categories and checklists</p>
        )}

        <div className="mb-3 flex justify-end">
          <button
            onClick={() =>
              setOpenSections((prev) =>
                prev.size === sections.length ? new Set() : new Set(sections.map((s) => s.name))
              )
            }
            className="text-xs font-semibold text-neutral-500 transition-colors hover:text-neutral-300"
          >
            {openSections.size === sections.length ? 'Collapse all' : 'Expand all'}
          </button>
        </div>

        <div className="space-y-3">
          {sections.map((section) => {
            const isOpen = openSections.has(section.name);
            return (
            <section key={section.name} className="overflow-hidden rounded-2xl border border-neutral-400/20 bg-invictus-surface">
              <button
                onClick={() => toggleSection(section.name)}
                className="flex w-full items-center gap-3 p-4 text-left"
                aria-expanded={isOpen}
              >
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${isOpen ? '' : '-rotate-90'}`}
                />
                <h2 className="flex-1 text-base font-semibold text-neutral-100">{section.name}</h2>
                <span className="rounded-full bg-invictus-raised px-2.5 py-0.5 text-xs font-medium text-neutral-400">
                  {section.forms.length}
                </span>
              </button>

              {isOpen && (
              <div className="divide-y divide-neutral-400/15 border-t border-neutral-400/15 px-4">
                {section.forms.map((form) => (
                  <div key={form.custom?.id ?? form.url} className="group relative flex items-center gap-2 py-3">
                    <a
                      href={form.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-0 flex-1 items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-neutral-100">{form.name}</p>
                        {form.description && (
                          <p className="mt-0.5 truncate text-xs text-neutral-500">{form.description}</p>
                        )}
                      </div>
                      <ExternalLink className="h-4 w-4 shrink-0 text-neutral-600 transition-colors group-hover:text-neutral-300" />
                    </a>
                    {form.custom && user && (
                      <button
                        onClick={() => handleDelete(form.custom!)}
                        onMouseLeave={() => setConfirmDeleteId((cur) => (cur === form.custom!.id ? null : cur))}
                        title={confirmDeleteId === form.custom.id ? 'Click again to delete' : `Delete ${form.name}`}
                        className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                          confirmDeleteId === form.custom.id
                            ? 'border-red-500/70 bg-red-500/20 text-red-300'
                            : 'border-neutral-400/20 bg-invictus-base text-neutral-500 hover:border-red-500/50 hover:text-red-400'
                        }`}
                      >
                        <Trash2 className="h-3 w-3" />
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

        <p className="pt-8 text-center text-xs text-neutral-600">
          Each checklist opens its live Microsoft Form in a new tab
        </p>
      </div>
      </main>
    </div>
  );
}
