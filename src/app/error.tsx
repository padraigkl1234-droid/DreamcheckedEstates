'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console.error as requested
    console.error('Application Error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
      <div className="mb-6 flex flex-col items-center gap-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h1 className="text-[38px] font-extrabold leading-[1.1] tracking-[-0.03em] text-ink max-md:text-[26px]">
          Something went wrong
        </h1>
        <p className="max-w-md text-muted-foreground">
          An unexpected error occurred. We&apos;ve logged the details and are working to fix it.
        </p>
      </div>
      <div className="flex gap-4">
        <Button onClick={() => reset()} variant="default">
          Try again
        </Button>
        <Button onClick={() => window.location.href = '/'} variant="outline">
          Go home
        </Button>
      </div>
    </div>
  );
}
