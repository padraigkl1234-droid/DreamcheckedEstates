import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: 'Dream Checked',
  description: 'Event management forms for Dreamland',
};

import { AuthProvider } from "@/components/AuthProvider";
import { PointerCaptureFix } from "@/components/PointerCaptureFix";
import { Navbar } from "@/components/Navbar";

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <PointerCaptureFix />
        <AuthProvider>
          <Navbar />
          <div className="pt-16">
            {children}
          </div>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
