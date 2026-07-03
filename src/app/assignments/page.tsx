'use client';

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AssignmentsModule from '@/components/AssignmentsModule';
import { useAuth } from '@/components/AuthProvider';

export default function AssignmentsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const arrivedSignedOut = useRef(false);

  // People land here via the Sign In button. Once they've signed in, take
  // them to the INVICTUS home dashboard instead of leaving them on this page.
  // (Visiting this page while already signed in still works normally.)
  useEffect(() => {
    if (loading) return;
    if (!user) {
      arrivedSignedOut.current = true;
      return;
    }
    if (arrivedSignedOut.current) {
      router.replace('/jarvis-tracker');
    }
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen flex-col w-full">
      <main className="flex-grow flex flex-col items-center bg-background p-4 pt-8 sm:pt-12">
        <div className="w-full max-w-4xl space-y-8">
          <AssignmentsModule />
        </div>
      </main>

      <footer className="border-t bg-muted/20 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Dreamland Margate Estate Management
        </p>
      </footer>
    </div>
  );
}
