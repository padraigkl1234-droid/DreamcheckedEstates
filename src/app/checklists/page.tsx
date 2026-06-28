'use client';

import React from 'react';
import { ClipboardCheck, ExternalLink, ChevronRight } from 'lucide-react';

// ---------------------------------------------------------------------------
// Checklists — a directory of Mobaro / Microsoft Forms checklists, grouped into
// sections by what they're for. Each entry is just a name, a short description
// and a link out to the live form.
// ---------------------------------------------------------------------------

interface ChecklistForm {
  name: string;
  description?: string;
  url: string;
}
interface ChecklistSection {
  name: string;
  forms: ChecklistForm[];
}

const CHECKLIST_SECTIONS: ChecklistSection[] = [
  {
    name: 'Scenic Stage Show',
    forms: [
      {
        name: 'Event Manager Checklist',
        description: 'Overall event readiness and sign-off for the duty event manager.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUQzM1SVVONkROVFEzM0VYU1VYMDZJMjlBUi4u',
      },
      {
        name: 'Guest Experience Checklist',
        description: 'Guest-facing readiness — front of house, signage and customer areas.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUM0RMMUhPNTdKT0I4Mk1BSFpDOEhKSUtHWC4u',
      },
      {
        name: 'Fire Safety Officer Pre Checklist',
        description: 'Pre-event fire safety checks for the fire safety officer.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUN0dERlE0UDQ0TkkzMTFHWkpSTlJPWDVMUy4u',
      },
      {
        name: 'Operations Control Checklist',
        description: 'Operations control room readiness and comms checks.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUMjM1T0gzMTlOS1ozVjRTU0JXU0o3NzZXWC4u',
      },
      {
        name: 'Production Checklist',
        description: 'Stage, sound, lighting and production readiness checks.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUQkxEVFU1MVFQVFdSNEFIRTVOMEYxS1c1Ri4u',
      },
      {
        name: 'Security Pre-Door Checklist',
        description: 'Security checks completed before doors open.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtURFRPUUpBMUc1T0wzQ0pDOTBROFhLN1dIMS4u',
      },
    ],
  },
  {
    name: 'Park',
    forms: [
      {
        name: 'Operations Control Opening Checklist',
        description: 'Opening checks for the operations control room.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtURUlKU1k2NDNYSUs0WTZFRUdDMDVVTlk3Si4u',
      },
      {
        name: 'Operations Control Closing Checklist',
        description: 'Closing checks for the operations control room.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUNzAwT1VXNjFMM1VTSDdSV1FNMlpLVUNTQS4u',
      },
      {
        name: 'Park Manager Opening Checklist',
        description: "Park manager's opening readiness checks.",
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUNkVGSUxQSzVFSlhSTzhaWDhKTkFFUkoxTi4u',
      },
      {
        name: 'Security Opening Checklist',
        description: 'Security opening checks before the park opens.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUQzdBQTRFRFdWQUVGTFJNWktRNFEwQTRaVC4u',
      },
      {
        name: 'Security Closing Checklist',
        description: 'Security closing checks after the park closes.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUOUJXV0sxQ0dQTUo0QklFQUoyR1JDSU5EOS4u',
      },
      {
        name: 'Guest Experience Opening Checklist',
        description: 'Guest experience opening readiness checks.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUNjhMSldZOTlBTDZOTTVESFpYTjJYOUdXRC4u',
      },
      {
        name: 'Guest Experience Closing Checklist',
        description: 'Guest experience closing checks.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUMlpLRkhBT0dSMzc3RkxFV1hGMDQyNTdXMi4u',
      },
      {
        name: 'Guest Experience Roller Checklist',
        description: 'Guest experience checks for the Roller area.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUOU1SOEFWRUlNS0hROUJSNDJDU0pYR1BPVS4u',
      },
    ],
  },
];

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

export default function ChecklistsPage() {
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

        <div className="space-y-8">
          {CHECKLIST_SECTIONS.map((section) => (
            <section key={section.name} className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="font-display text-xl uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-strong)] sm:text-2xl">
                  {section.name}
                </h2>
                <span className="rounded-full border border-invictus-crimson-bright/50 bg-invictus-crimson-bright/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-200">
                  {section.forms.length}
                </span>
                <span className="h-px flex-1 bg-invictus-crimson-bright/25" />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {section.forms.map((form) => (
                  <a
                    key={form.url}
                    href={form.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative flex flex-col gap-2 border border-neutral-400/25 bg-invictus-surface/60 p-5 shadow-glow-subtle backdrop-blur-sm transition-all hover:border-invictus-crimson-bright/60 hover:shadow-glow-strong"
                  >
                    <Corners />
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-sm uppercase tracking-[0.12em] text-neutral-100">{form.name}</h3>
                      <ExternalLink className="h-4 w-4 shrink-0 text-neutral-600 transition-colors group-hover:text-invictus-crimson-bright" />
                    </div>
                    {form.description && (
                      <p className="text-xs leading-relaxed text-neutral-400">{form.description}</p>
                    )}
                    <span className="mt-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-invictus-crimson-bright">
                      Open form <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="pt-8 text-center text-[10px] uppercase tracking-widest text-neutral-700">
          Each checklist opens its live Microsoft Form in a new tab
        </p>
      </div>
    </div>
  );
}
