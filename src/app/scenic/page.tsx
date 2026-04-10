'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckSquare, Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ScenicChecklistsPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col w-full">
        <header className="absolute top-0 left-0 w-full p-4 sm:p-6 z-10">
            <Button variant="outline" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
            </Button>
        </header>
      <main className="flex-grow flex flex-col items-center bg-background p-4 pt-20">
        <div className="w-full max-w-4xl space-y-8">
            <div className="mb-8 flex flex-col items-center gap-2 text-center">
              <div className="flex items-center gap-3">
                <CheckSquare className="h-10 w-10 text-primary sm:h-12 sm:w-12" />
                <h1 className="font-headline text-4xl font-bold tracking-tight text-primary sm:text-5xl md:text-6xl">
                  Scenic Event Checklists
                </h1>
              </div>
              <p className="max-w-md text-base text-muted-foreground sm:text-lg">
                Checklists for the Scenic Stage events.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Card className="transform-gpu transition-transform duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <LinkIcon className="h-5 w-5" />
                    Guest Experience Checks: Scenic Stage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button asChild>
                    <Link href="https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUM0RMMUhPNTdKT0I4Mk1BSFpDOEhKSUtHWC4u" target="_blank" rel="noopener noreferrer">
                      Open Checklist
                    </Link>
                  </Button>
                </CardContent>
              </Card>
              <Card className="transform-gpu transition-transform duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <LinkIcon className="h-5 w-5" />
                    Event Manager Checks: Scenic Stage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button asChild>
                    <Link href="https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUQzM1SVVONkROVFEzM0VYU1VYMDZJMjlBUi4u" target="_blank" rel="noopener noreferrer">
                      Open Checklist
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
