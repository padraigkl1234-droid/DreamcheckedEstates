'use client';

import { ZonePlanPage } from '@/components/ZonePlanPage';
import { HALL_BY_THE_SEA_PLAN } from '@/lib/zonePlans';

export default function HallByTheSeaFloorPlanPage() {
  return <ZonePlanPage plan={HALL_BY_THE_SEA_PLAN} />;
}
