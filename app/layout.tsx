import type {Metadata, Viewport} from 'next';
import {Plus_Jakarta_Sans} from 'next/font/google';
import './globals.css'; // Global styles
import {AuthProvider} from '@/lib/auth-context';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MPT OmniPortal',
  description: 'Luxury Watch Retail Analytics',
};

// viewport-fit=cover lets env(safe-area-inset-*) report the iPhone notch and
// home-indicator insets, which the fixed header and bottom bars pad for.
// Zoom stays allowed on purpose (no maximum-scale / user-scalable).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={plusJakartaSans.variable}>
      <body className="font-sans antialiased bg-slate-50 text-slate-900" suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
