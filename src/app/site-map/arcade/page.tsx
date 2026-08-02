'use client';

import { ZonePlanPage } from '@/components/ZonePlanPage';
import { ARCADE_PLAN } from '@/lib/zonePlans';

export default function ArcadeFloorPlanPage() {
  return <ZonePlanPage plan={ARCADE_PLAN} />;
}
