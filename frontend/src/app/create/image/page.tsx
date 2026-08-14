'use client';

import { Suspense } from 'react';
import { CreateFlow } from '@/components/app/CreateFlow';

// CreateFlow lit `?model=` : useSearchParams impose une frontière Suspense
// sous l'App Router.
export default function CreateImagePage() {
  return (
    <Suspense fallback={null}>
      <CreateFlow kind="image" />
    </Suspense>
  );
}
