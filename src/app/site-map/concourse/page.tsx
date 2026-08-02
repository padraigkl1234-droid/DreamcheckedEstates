'use client';

import { ZonePlanPage } from '@/components/ZonePlanPage';
import { CONCOURSE_PLAN } from '@/lib/zonePlans';

export default function ConcourseFloorPlanPage() {
  return <ZonePlanPage plan={CONCOURSE_PLAN} />;
}
