'use client';

import React from 'react';
import { ClipboardList, ExternalLink } from 'lucide-react';

// ---------------------------------------------------------------------------
// Audits — a directory of audit Microsoft Forms. Compact cards, two columns,
// each linking out to the live form.
// ---------------------------------------------------------------------------

interface Audit {
  name: string;
  url: string;
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

export default function AuditsPage() {
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
              {AUDITS.length} audits · opens in Microsoft Forms
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {AUDITS.map((audit) => (
            <a
              key={audit.url}
              href={audit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex items-center justify-between gap-3 border border-neutral-400/25 bg-invictus-surface/60 px-4 py-3 shadow-glow-subtle backdrop-blur-sm transition-all hover:border-invictus-crimson-bright/60 hover:shadow-glow-strong"
            >
              <Corners />
              <span className="font-display text-[11px] uppercase leading-snug tracking-[0.08em] text-neutral-100">
                {audit.name}
              </span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-neutral-600 transition-colors group-hover:text-invictus-crimson-bright" />
            </a>
          ))}
        </div>

        <p className="pt-8 text-center text-[10px] uppercase tracking-widest text-neutral-700">
          Each audit opens its live Microsoft Form in a new tab
        </p>
      </div>
    </div>
  );
}
