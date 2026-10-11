import type {Metadata, Viewport} from 'next';
import { Manrope, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: 'INVICTUS',
  description: 'Event management forms for Dreamland',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'INVICTUS',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The navy of the header: this is what paints the status-bar area in an
  // installed app, and white left a strip above the header.
  themeColor: '#0E1A3A',
  // Without cover, the layout viewport stops short of the status bar and
  // env(safe-area-inset-*) is always 0, so the header can't extend under it.
  viewportFit: 'cover',
};

import { AuthProvider } from "@/components/AuthProvider";
import { ProfileProvider } from "@/components/ProfileProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import { PreferencesProvider } from "@/components/PreferencesProvider";
import { AppGate } from "@/components/AppGate";
import { SoundProvider } from "@/components/SoundProvider";
import { PointerCaptureFix } from "@/components/PointerCaptureFix";
import { RadixBodyLockFix } from "@/components/RadixBodyLockFix";
import { AppHeader } from '@/components/AppHeader';
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { PushListener } from "@/components/PushListener";

// One typeface everywhere: Manrope, in the four weights the design uses.
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-hanken',
  display: 'swap',
});

// Monospace kept only for tabular data/numbers (clocks, counts, percentages).
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // One theme. data-theme is set here rather than by a script before paint,
  // because there's no longer a saved preference to read and so nothing to
  // flash. The attribute stays because the stylesheet's overrides hang off it.
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${manrope.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="font-body antialiased">
        <ServiceWorkerRegistration />
        <PointerCaptureFix />
        <RadixBodyLockFix />
        <LanguageProvider>
        <PreferencesProvider>
        <AuthProvider>
          <ProfileProvider>
            <SoundProvider>
              <PushListener />
              <AppGate>
                <AppHeader />
                <div className="pt-[var(--chrome-h)]">
                  {children}
                </div>
              </AppGate>
            </SoundProvider>
          </ProfileProvider>
        </AuthProvider>
        </PreferencesProvider>
        </LanguageProvider>
        <Toaster />
      </body>
    </html>
  );
}
