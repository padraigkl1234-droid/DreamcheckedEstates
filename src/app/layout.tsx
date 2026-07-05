import type {Metadata, Viewport} from 'next';
import { Inter, Orbitron } from 'next/font/google';
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
  themeColor: '#000000',
};

import { AuthProvider } from "@/components/AuthProvider";
import { ProfileProvider } from "@/components/ProfileProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import { AppGate } from "@/components/AppGate";
import { SoundProvider } from "@/components/SoundProvider";
import { PointerCaptureFix } from "@/components/PointerCaptureFix";
import { Navbar } from "@/components/Navbar";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
  display: 'swap',
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${orbitron.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before paint to avoid a flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('invictus-theme')||'dark';var d=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;var e=document.documentElement;e.classList.toggle('dark',d==='dark');e.setAttribute('data-theme',d);}catch(_){document.documentElement.classList.add('dark');document.documentElement.setAttribute('data-theme','dark');}})();`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <ServiceWorkerRegistration />
        <PointerCaptureFix />
        <ThemeProvider>
        <LanguageProvider>
        <AuthProvider>
          <ProfileProvider>
            <SoundProvider>
              <AppGate>
                <Navbar />
                <div className="pt-16">
                  {children}
                </div>
              </AppGate>
            </SoundProvider>
          </ProfileProvider>
        </AuthProvider>
        </LanguageProvider>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
