'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileCheck, FileSpreadsheet } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CompliancesPage() {
  const router = useRouter();
  const complianceMatrixUrl = "https://lneallaccess.sharepoint.com/:x:/r/sites/EMEA-UKDL-Operations/Shared%20Documents/UKDL-Operations%20General/Estates/Compliance%20%26%20Servicing/Compliances%20Matrix%202026.xlsx?d=w383aee5c218c4072ac7986fda9761084&csf=1&web=1&e=Pyxbiu";

  return (
    <div className="flex min-h-screen flex-col w-full">
      <main className="flex-grow flex flex-col items-center bg-background p-4 pt-8 sm:pt-12">
        <div className="w-full max-w-4xl space-y-8">
            <div className="mb-8 flex flex-col items-center gap-2 text-center">
              <div className="flex items-center gap-3">
                <FileCheck className="h-10 w-10 text-primary sm:h-12 sm:w-12" />
                <h1 className="font-headline text-4xl font-bold tracking-tight text-primary sm:text-5xl md:text-6xl">
                  Compliances
                </h1>
              </div>
              <p className="max-w-md text-base text-muted-foreground sm:text-lg">
                View and manage estate compliance documentation and servicing matrices.
              </p>
            </div>
            
            <div className="flex justify-center">
              <Card className="w-full max-w-2xl transform-gpu transition-all duration-300 hover:scale-[1.01] hover:shadow-xl hover:shadow-primary/10 border-primary/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-2xl">
                    <FileSpreadsheet className="h-6 w-6 text-primary" />
                    Compliances 2026
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-2 text-center">
                  <p className="mb-6 text-muted-foreground text-left">
                    Access the master compliance matrix for 2026, tracking all essential estate servicing and documentation.
                  </p>
                  <Button asChild className="w-full h-12 text-lg font-semibold">
                    <Link href={complianceMatrixUrl} target="_blank" rel="noopener noreferrer">
                      Open Compliances Matrix 2026
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
