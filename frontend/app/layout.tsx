import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { DarkModeToggle } from '@/components/dark-mode-toggle';
import { NavBar } from '@/components/nav-bar'; 
import { Disclaimer } from '@/components/disclaimer';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'ContextCache - Privacy-first memory engine for AI',
  description: 'Local-first, zero-knowledge memory system with explainable answers',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
    userScalable: true,
  },
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="antialiased">
        <ErrorBoundary>
          <ThemeProvider>
            {/* Alpha banner */}
            <div className="relative z-50 bg-gradient-to-r from-yellow-500 to-orange-500 text-black px-4 py-2 text-center text-sm font-medium safe-padding">
              🚧 Alpha Version - Under Active Development
            </div>

            {/* Dark mode toggle */}
            <div className="fixed top-20 right-4 z-50">
              <DarkModeToggle />
            </div>

            {/* Navigation bar */}
            <NavBar />

            {/* Main content */}
            <div className="min-h-screen">
              {children}
            </div>

            {/* Disclaimer */}
            <Disclaimer />
            
            {/* Toast Notifications */}
            <Toaster 
              position="bottom-right" 
              expand={true}
              richColors 
              closeButton
              theme="system"
            />
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}