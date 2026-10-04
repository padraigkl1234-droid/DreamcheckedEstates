'use client';

// The Hotel Operations hub. Only teams switched to the hotel module reach
// here (AppGate routes them in and everyone else out); inside, pages are
// gated by the person's hotel role, never by the estates rank.

import React from 'react';
import { BedDouble, Clock } from 'lucide-react';
import { HotelProvider, useHotel } from '@/components/hotel/HotelProvider';
import { HotelShell } from '@/components/hotel/HotelShell';
import { Centered, Spinner } from '@/components/hotel/ui';

function HotelGate({ children }: { children: React.ReactNode }) {
  const { isHotel, role, loading, teamName } = useHotel();
  if (!isHotel) {
    // Only the master can land here without a hotel team (AppGate redirects
    // everyone else), e.g. while checking the module from the console.
    return (
      <Centered>
        <p className="flex max-w-sm flex-col items-center gap-2 text-sm text-neutral-500">
          <BedDouble className="h-7 w-7" />
          Your current team isn&apos;t a hotel. Move yourself into a hotel team from the master console to view its hub.
        </p>
      </Centered>
    );
  }
  if (loading) return <Spinner />;
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
