'use client';

// The Hotel Operations hub. Only teams switched to the hotel module reach
// here (AppGate routes them in and everyone else out); inside, pages are
// gated by the person's hotel role, never by the estates rank.

import React from 'react';
import Link from 'next/link';
import { BedDouble, ChevronRight, Clock } from 'lucide-react';
import { useProfile } from '@/components/ProfileProvider';
import { HotelProvider, useHotel } from '@/components/hotel/HotelProvider';
import { HotelShell } from '@/components/hotel/HotelShell';
import { Centered, Spinner } from '@/components/hotel/ui';

// The master is above teams: instead of joining a hotel, they pick which
// hotel's hub to open (as its manager).
function MasterHotelPicker() {
  const { hotelTeams, chooseHotel } = useHotel();
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-neutral-100">
        <BedDouble className="h-6 w-6 text-invictus-crimson-bright" /> Choose a hotel
      </h1>
      <p className="mb-5 text-sm text-neutral-500">As master you can open any hotel&apos;s hub as its manager, without joining the team.</p>
      {hotelTeams.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-400/25 p-6 text-center text-sm text-neutral-500">
          No hotel teams yet. In the <Link href="/master" className="text-invictus-crimson-bright underline">master console</Link>, switch a team&apos;s Module to Hotel hub.
        </p>
      ) : (
        <ul className="space-y-2">
          {hotelTeams.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => chooseHotel(t.id)}
                className="flex w-full items-center justify-between rounded-md border border-neutral-400/25 bg-invictus-surface/60 p-4 text-left hover:border-invictus-crimson-bright/50"
              >
                <span>
                  <span className="block font-semibold text-neutral-100">{t.name}</span>
                  <span className="font-mono text-xs tracking-widest text-neutral-500">{t.referralCode}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-neutral-500" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HotelGate({ children }: { children: React.ReactNode }) {
  const { isMaster } = useProfile();
  const { isHotel, role, loading, teamName, rulesMissing } = useHotel();
  if (!isHotel) {
    // Only the master can land here without a hotel team (AppGate redirects
    // everyone else).
    if (isMaster) return <MasterHotelPicker />;
    return (
      <Centered>
        <p className="flex max-w-sm flex-col items-center gap-2 text-sm text-neutral-500">
          <BedDouble className="h-7 w-7" />
          Your team isn&apos;t a hotel.
        </p>
      </Centered>
    );
  }
  if (loading) return <Spinner />;
  if (rulesMissing) {
    return (
      <Centered>
        <div className="flex max-w-sm flex-col items-center gap-2">
          <BedDouble className="h-7 w-7 text-alert" />
          <p className="text-base font-semibold text-neutral-100">The hotel hub isn&apos;t switched on in the database yet</p>
          <p className="text-sm text-neutral-500">
            Firestore refused to load your hotel record. The hotel security rules need publishing to this project&apos;s Firestore database.
          </p>
        </div>
      </Centered>
    );
  }
  if (!role) {
    return (
      <Centered>
        <div className="flex max-w-sm flex-col items-center gap-2">
          <Clock className="h-7 w-7 text-invictus-crimson-bright" />
          <p className="text-base font-semibold text-neutral-100">Welcome to {teamName}</p>
          <p className="text-sm text-neutral-500">
            You&apos;re on the team, but a manager hasn&apos;t given you a role yet. Ask them to set it in Settings → Staff.
          </p>
        </div>
      </Centered>
    );
  }
  return <HotelShell>{children}</HotelShell>;
}

export default function HotelLayout({ children }: { children: React.ReactNode }) {
  return (
    <HotelProvider>
      <HotelGate>{children}</HotelGate>
    </HotelProvider>
  );
}
