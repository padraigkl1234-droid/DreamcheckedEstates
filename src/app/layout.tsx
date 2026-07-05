import type { Metadata, Viewport } from 'next';
import { Inter, Orbitron } from 'next/font/google';
import './globals.css';

export const metadata: Metadata = {
  title: 'INVICTUS',
  description: 'Elite AI-powered fitness and performance coach',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'INVICTUS' },
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
      <body className="font-sans antialiased bg-black">
        {children}
      </body>
    </html>
  );
}
