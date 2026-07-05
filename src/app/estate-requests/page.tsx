'use client';

import React from 'react';
import { Wrench, FileSpreadsheet, ClipboardList, ExternalLink, ChevronRight } from 'lucide-react';
import { useProfile } from '@/components/ProfileProvider';
import { featureEnabled } from '@/lib/teams';

const REQUEST_EXCEL_URL =
  'https://lneallaccess-my.sharepoint.com/:x:/r/personal/padraig_kessonlyons_lyv_livenation_com/_layouts/15/Doc.aspx?sourcedoc=%7B0D9A54B0-596F-4B26-ACA7-3CBEFD452AA4%7D&file=Estates%20Request%20Form.xlsx&action=edit&mobileredirect=true&wdMsFormsCorrelationId=9c4bcf8d-b5ee-4b9a-8f45-d2cce541071d&wdtf=%20Microsoft.Office.Excel.FMsFormsMetadataInWorkbookMetadata%3Atrue';
const SUBMIT_FORM_URL =
  'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUQUQyMzNQRDBZNjFZVkcyUFlDQzJXMEkzVC4u';

interface RequestLink {
  name: string;
  description: string;
  url: string;
  icon: typeof Wrench;
  featured?: boolean;
}

const REQUEST_LINKS: RequestLink[] = [
  {
    name: 'Estate Request Form',
    description: 'Central master sheet for all maintenance and repair tracking.',
    url: REQUEST_EXCEL_URL,
    icon: FileSpreadsheet,
    featured: true,
  },
  {
    name: 'Submit Estate Request',
    description: 'Log a new maintenance or repair request via the form.',
    url: SUBMIT_FORM_URL,
    icon: ClipboardList,
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

export default function EstateRequestsPage() {
  const { team, isMaster, loading } = useProfile();
  const enabled = isMaster || featureEnabled(team?.features, 'estateRequests');

  // Enforce the per-team toggle even if someone navigates here directly.
  if (!loading && !enabled) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-invictus-base px-4 text-center font-sans">
        <p className="max-w-md text-xs uppercase tracking-widest text-neutral-500">
          Estate Requests isn&apos;t enabled for your team.
        </p>
      </div>
    );
  }

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

      <div className="relative z-10 mx-auto max-w-4xl px-4 py-8 sm:py-10">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <Wrench className="h-8 w-8 text-invictus-crimson-bright drop-shadow-glow-subtle" />
          <div>
            <h1 className="font-display text-2xl uppercase tracking-[0.2em] text-neutral-100 [text-shadow:var(--glow-text-subtle)] sm:text-3xl">
              Estate Requests
            </h1>
            <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-500">
              Maintenance &amp; repair requests · opens in a new tab
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {REQUEST_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.url}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`group relative flex flex-col gap-2 border bg-invictus-surface/60 p-5 shadow-glow-subtle backdrop-blur-sm transition-all hover:shadow-glow-strong ${
                  item.featured
                    ? 'border-invictus-crimson-bright/50 hover:border-invictus-crimson-bright'
                    : 'border-neutral-400/25 hover:border-invictus-crimson-bright/60'
                }`}
              >
                <Corners />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-5 w-5 shrink-0 text-invictus-crimson-bright drop-shadow-glow-subtle" />
                    <h3 className="font-display text-sm uppercase tracking-[0.12em] text-neutral-100 sm:text-base">
                      {item.name}
                    </h3>
                  </div>
                  <ExternalLink className="h-4 w-4 shrink-0 text-neutral-600 transition-colors group-hover:text-invictus-crimson-bright" />
                </div>
                <p className="text-xs leading-relaxed text-neutral-400 sm:text-sm">{item.description}</p>
                <span className="mt-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-invictus-crimson-bright">
                  Open {item.featured ? 'sheet' : 'form'} <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </a>
            );
          })}
        </div>

        <p className="pt-8 text-center text-[10px] uppercase tracking-widest text-neutral-700">
          Built for Dreamland Estate Management
        </p>
      </div>
    </div>
  );
}
