'use client';

import React from 'react';
import AssignmentsModule from '@/components/AssignmentsModule';

export default function AssignmentsPage() {
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
