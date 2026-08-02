'use client';

import { ZonePlanPage } from '@/components/ZonePlanPage';
import { BALLROOM_PLAN } from '@/lib/zonePlans';

export default function BallroomFloorPlanPage() {
  return <ZonePlanPage plan={BALLROOM_PLAN} />;
}
