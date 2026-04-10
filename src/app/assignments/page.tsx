'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AssignmentsModule from '@/components/AssignmentsModule';

export default function AssignmentsPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col w-full">
      <main className="flex-grow flex flex-col items-center bg-background p-4 pt-8 sm:pt-12">
        <div className="w-full max-w-4xl space-y-8">
          <div className="mb-8 flex flex-col items-center gap-2 text-center">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-10 w-10 text-primary sm:h-12 sm:w-12" />
              <h1 className="font-headline text-4xl font-bold tracking-tight text-primary sm:text-5xl md:text-6xl">
                Assignments
              </h1>
            </div>
            <p className="max-w-md text-base text-muted-foreground sm:text-lg">
              Manage and track estate maintenance tasks and team assignments.
            </p>
          </div>

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
