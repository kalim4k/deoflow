'use client';

import { Suspense } from 'react';
import { CreateFlow } from '@/components/app/CreateFlow';

export default function CreateVideoPage() {
  return (
    <Suspense fallback={null}>
      <CreateFlow kind="video" />
    </Suspense>
  );
}
