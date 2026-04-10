'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ClipboardCheck, Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarSystem } from "@/components/CalendarSystem";

export default function AuditsPage() {
  const router = useRouter();

  // Pest Control Audit: 1st Monday of every month until September 2026
  const auditEvents = [
    { date: new Date(2026, 3, 6), title: "Pest Control Audit" },
    { date: new Date(2026, 4, 4), title: "Pest Control Audit" },
    { date: new Date(2026, 5, 1), title: "Pest Control Audit" },
    { date: new Date(2026, 6, 6), title: "Pest Control Audit" },
    { date: new Date(2026, 7, 3), title: "Pest Control Audit" },
    { date: new Date(2026, 8, 7), title: "Pest Control Audit" },
  ];

  return (
    <div className="flex min-h-screen flex-col w-full">
      <main className="flex-grow flex flex-col items-center bg-background p-4 pt-8 sm:pt-12">
        <div className="w-full max-w-4xl space-y-8">
            <div className="mb-8 flex flex-col items-center gap-2 text-center">
              <div className="flex items-center gap-3">
                <ClipboardCheck className="h-10 w-10 text-primary sm:h-12 sm:w-12" />
                <h1 className="font-headline text-4xl font-bold tracking-tight text-primary sm:text-5xl md:text-6xl">
                  Audits
                </h1>
              </div>
              <p className="max-w-md text-base text-muted-foreground sm:text-lg">
                Various audit forms and checklists.
              </p>
            </div>

            <section className="w-full max-w-3xl mx-auto">
                <CalendarSystem title="Audit Schedule" events={auditEvents} />
            </section>

            <div className="flex justify-center">
              <Card className="transform-gpu transition-transform duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/20 w-full max-w-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <LinkIcon className="h-5 w-5" />
                    Pest control Audit
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button asChild>
                    <Link href="https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUNzZXUUI2R1pIN0hVRDBSRE9GR1Y5UVA1Mi4u" target="_blank" rel="noopener noreferrer">
                      Open Audit
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
        </div>
      </main>
      <footer className="w-full py-8 text-center text-sm text-muted-foreground border-t bg-muted/20">
          <p>Built for Dreamland Estate Management, created by Padraig Lyons</p>
      </footer>
    </div>
  );
}
