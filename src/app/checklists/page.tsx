'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { CalendarSystem } from "@/components/CalendarSystem";

export default function ChecklistsPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col w-full">
      <main className="flex-grow flex flex-col items-center bg-background p-4 pt-8 sm:pt-12">
        <div className="w-full max-w-4xl space-y-8">
            <div className="mb-8 flex flex-col items-center gap-2 text-center">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-10 w-10 text-primary sm:h-12 sm:w-12" />
                <h1 className="font-headline text-4xl font-bold tracking-tight text-primary sm:text-5xl md:text-6xl">
                  Checklists
                </h1>
              </div>
              <p className="max-w-md text-base text-muted-foreground sm:text-lg">
                View and manage estate maintenance checklists.
              </p>
            </div>

            <section className="w-full max-w-3xl mx-auto">
                <CalendarSystem title="Checklist Schedule" />
            </section>
            
            <div className="flex justify-center italic text-muted-foreground">
                No checklists added yet.
            </div>
        </div>
      </main>
      <footer className="w-full py-8 text-center text-sm text-muted-foreground border-t bg-muted/20">
          <p>Built for Dreamland Estate Management, created by Padraig Lyons</p>
      </footer>
    </div>
  );
}
