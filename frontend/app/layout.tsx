import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { DarkModeToggle } from '@/components/dark-mode-toggle';
import { NavBar } from '@/components/nav-bar';
import { Disclaimer } from '@/components/disclaimer';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from 'sonner';
import { ClerkProvider, SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { APIProvider } from '@/components/api-provider';

// Force dynamic rendering for all routes (required for Cloudflare deployment with Clerk)
export const dynamic = 'force-dynamic';

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
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <head>
          <link rel="icon" href="/logo.png" type="image/png" />
          <link rel="apple-touch-icon" href="/logo.png" />
          <meta name="format-detection" content="telephone=no" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        </head>
        <body className="antialiased">
          <ErrorBoundary>
            <ThemeProvider>
              <APIProvider>
                {/* Alpha banner */}
                <div className="relative z-40 bg-primary text-primary-foreground px-4 py-2 text-center text-sm font-medium safe-padding">
                  Alpha Version - Under Active Development
                </div>

                {/* Clerk Auth Header - positioned below banner */}
                <header className="fixed top-10 right-0 z-50 p-4">
                  <div className="flex items-center gap-3">
                    <SignedOut>
                      <SignInButton mode="modal">
                        <button className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors glass-card rounded-lg shadow-sm border border-border">
                          Sign In
                        </button>
                      </SignInButton>
                      <SignUpButton mode="modal">
                        <button className="px-4 py-2 text-sm font-medium bg-primary hover:opacity-90 text-primary-foreground rounded-lg shadow-sm transition-all">
                          Sign Up
                        </button>
                      </SignUpButton>
                    </SignedOut>
                    <SignedIn>
                      <UserButton
                        appearance={{
                          elements: {
                            avatarBox: "w-10 h-10 rounded-full border-2 border-primary"
                          }
                        }}
                      />
                    </SignedIn>
                  </div>
                </header>

                {/*  Dark Mode Toggle - Self-positioning component */}
                <DarkModeToggle />
                
                {/* Navigation */}
                <NavBar />

                {/* Main content - Add padding bottom for disclaimer */}
                <div className="min-h-screen pb-20">{children}</div>

                {/*  ChatGPT-style Disclaimer Banner */}
                <Disclaimer />

                {/* Toast Notifications - Offset for disclaimer */}
                <Toaster
                  position="bottom-right"
                  expand={true}
                  richColors
                  closeButton
                  theme="system"
                  offset="80px"
                />
              </APIProvider>
            </ThemeProvider>
          </ErrorBoundary>
        </body>
      </html>
    </ClerkProvider>
  );
}
