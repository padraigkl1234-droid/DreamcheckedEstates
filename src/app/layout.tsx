import type { Metadata, Viewport } from 'next';
import { Inter, Orbitron } from 'next/font/google';
import './globals.css';

export const metadata: Metadata = {
  title: 'JARVIS',
  description: 'Voice-operated AI fitness and diet coach',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'JARVIS' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
};

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const orbitron = Orbitron({ subsets: ['latin'], variable: '--font-orbitron', display: 'swap' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${orbitron.variable}`}>
      <body className="bg-black font-sans antialiased">{children}</body>
    </html>
  );
}
