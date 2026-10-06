'use client';

// /hotel — send each person to their own starting page.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useHotel } from '@/components/hotel/HotelProvider';
import { HOME_FOR_ROLE } from '@/components/hotel/HotelShell';
import { Spinner } from '@/components/hotel/ui';

export default function HotelHome() {
  const { role } = useHotel();
  const router = useRouter();
  useEffect(() => {
    if (role) router.replace(HOME_FOR_ROLE[role]);
  }, [role, router]);
  return <Spinner />;
}
