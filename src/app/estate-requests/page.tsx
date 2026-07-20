'use client';

import React from 'react';
import { FileSpreadsheet, ClipboardList, ExternalLink, ChevronRight } from 'lucide-react';
import { useProfile } from '@/components/ProfileProvider';
import { featureEnabled } from '@/lib/teams';
import { AppSidebar, AppMobileNav } from '@/components/AppSidebar';

const REQUEST_EXCEL_URL =
  'https://lneallaccess-my.sharepoint.com/:x:/r/personal/padraig_kessonlyons_lyv_livenation_com/_layouts/15/Doc.aspx?sourcedoc=%7B0D9A54B0-596F-4B26-ACA7-3CBEFD452AA4%7D&file=Estates%20Request%20Form.xlsx&action=edit&mobileredirect=true&wdMsFormsCorrelationId=9c4bcf8d-b5ee-4b9a-8f45-d2cce541071d&wdtf=%20Microsoft.Office.Excel.FMsFormsMetadataInWorkbookMetadata%3Atrue';
const SUBMIT_FORM_URL =
  'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUQUQyMzNQRDBZNjFZVkcyUFlDQzJXMEkzVC4u';

interface RequestLink {
  name: string;
  description: string;
  url: string;
  icon: typeof FileSpreadsheet;
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

export default function EstateRequestsPage() {
  const { team, isMaster, loading } = useProfile();
  const enabled = isMaster || featureEnabled(team?.features, 'estateRequests');

  // Enforce the per-team toggle even if someone navigates here directly.
  if (!loading && !enabled) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col md:flex-row">
        <AppMobileNav features={team?.features} isMaster={isMaster} />
        <AppSidebar features={team?.features} isMaster={isMaster} />
        <div className="flex flex-1 items-center justify-center bg-invictus-base px-4 text-center font-sans">
          <p className="max-w-md text-sm text-neutral-500">Estate Requests isn&apos;t enabled for your team.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col md:flex-row">
      <AppMobileNav features={team?.features} isMaster={isMaster} />
      <AppSidebar features={team?.features} isMaster={isMaster} />
      <main className="relative flex-1 overflow-y-auto bg-invictus-base font-sans text-neutral-100">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-neutral-100 sm:text-3xl">Estate requests</h1>
          <p className="mt-1 text-sm text-neutral-500">Maintenance &amp; repair requests · opens in a new tab</p>
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
                className="group relative flex flex-col gap-2 rounded-2xl border border-neutral-400/20 bg-invictus-surface p-5 transition-colors hover:border-neutral-400/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-invictus-raised">
                      <Icon className="h-4.5 w-4.5 text-neutral-500" />
                    </span>
                    <h3 className="text-sm font-semibold text-neutral-100 sm:text-base">{item.name}</h3>
                  </div>
                  <ExternalLink className="h-4 w-4 shrink-0 text-neutral-600 transition-colors group-hover:text-neutral-300" />
                </div>
                <p className="text-xs leading-relaxed text-neutral-500 sm:text-sm">{item.description}</p>
                <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-neutral-100">
                  Open {item.featured ? 'sheet' : 'form'} <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </a>
            );
          })}
        </div>

        <p className="pt-8 text-center text-xs text-neutral-600">Built for Dreamland Estate Management</p>
      </div>
      </main>
    </div>
  );
}
