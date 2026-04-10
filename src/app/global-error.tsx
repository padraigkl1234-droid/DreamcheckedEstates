'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console.error as requested
    console.error('Global Application Error:', error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            A critical error occurred
          </h1>
          <p className="mt-4 text-muted-foreground">
            The application encountered a fatal error and cannot continue.
          </p>
          <button
            onClick={() => reset()}
            className="mt-6 rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
