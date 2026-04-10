'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Wrench, FileSpreadsheet, ClipboardList } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function EstateRequestsPage() {
  const router = useRouter();

  const requestExcelUrl = "https://lneallaccess-my.sharepoint.com/:x:/r/personal/padraig_kessonlyons_lyv_livenation_com/_layouts/15/Doc.aspx?sourcedoc=%7B0D9A54B0-596F-4B26-ACA7-3CBEFD452AA4%7D&file=Estates%20Request%20Form.xlsx&action=edit&mobileredirect=true&wdMsFormsCorrelationId=9c4bcf8d-b5ee-4b9a-8f45-d2cce541071d&wdtf=%20Microsoft.Office.Excel.FMsFormsMetadataInWorkbookMetadata%3Atrue";
  const submitFormUrl = "https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUQUQyMzNQRDBZNjFZVkcyUFlDQzJXMEkzVC4u";

  return (
    <div className="flex min-h-screen flex-col w-full">
      <main className="flex-grow flex flex-col items-center bg-background p-4 pt-8 sm:pt-12">
        <div className="w-full max-w-4xl space-y-8">
            <div className="mb-8 flex flex-col items-center gap-2 text-center">
              <div className="flex items-center gap-3">
                <Wrench className="h-10 w-10 text-primary sm:h-12 sm:w-12" />
                <h1 className="font-headline text-4xl font-bold tracking-tight text-primary sm:text-5xl md:text-6xl">
                  Estate Requests
                </h1>
              </div>
              <p className="max-w-md text-base text-muted-foreground sm:text-lg">
                The following excel sheet is for maintenance and repair requests.
              </p>
            </div>
            
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Card className="sm:col-span-2 transform-gpu transition-all duration-300 hover:scale-[1.01] hover:shadow-xl hover:shadow-primary/10 border-primary/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-2xl">
                    <FileSpreadsheet className="h-6 w-6 text-primary" />
                    Estate Request Form
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  <p className="mb-6 text-muted-foreground">
                    Access the central master sheet for all maintenance and repair tracking.
                  </p>
                  <Button asChild className="w-full h-12 text-lg font-semibold">
                    <Link href={requestExcelUrl} target="_blank" rel="noopener noreferrer">
                      Open Request Sheet
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="sm:col-span-2 transform-gpu transition-transform duration-300 hover:scale-[1.01] hover:shadow-lg hover:shadow-primary/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <ClipboardList className="h-5 w-5" />
                    Submit Estate Request
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline" className="w-full">
                    <Link href={submitFormUrl} target="_blank" rel="noopener noreferrer">
                      Open Request Form
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
