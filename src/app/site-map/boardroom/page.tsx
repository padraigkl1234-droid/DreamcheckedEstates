'use client';

import { ZonePlanPage } from '@/components/ZonePlanPage';
import { BOARDROOM_PLAN } from '@/lib/zonePlans';

export default function BoardroomFloorPlanPage() {
  return <ZonePlanPage plan={BOARDROOM_PLAN} />;
}
