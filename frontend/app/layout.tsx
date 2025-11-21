import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Disclaimer } from '@/components/disclaimer';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from 'sonner';
import { ClerkProvider, SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { APIProvider } from '@/components/api-provider';
import { EnhancedThemeToggle } from '@/components/enhanced-theme-toggle';

// Force dynamic rendering for all routes (required for Cloudflare deployment with Clerk)
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'thecontextcache - Privacy-first memory engine for AI',
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
                {/* Header with banner and auth */}
                <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
                  {/* Alpha banner */}
                  <div className="bg-primary text-primary-foreground px-4 py-2 text-center text-sm font-medium">
                    Alpha Version - Under Active Development
                  </div>
                  
                  {/* Auth controls */}
                  <div className="container mx-auto px-4 py-3 flex items-center justify-between">
                    <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer">
                      <span className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                        thecontextcache™
                      </span>
                    </a>
                    
                    <div className="flex items-center gap-3">
                      {/* Theme Toggle */}
                      <EnhancedThemeToggle />
                      
                      <SignedOut>
                        <SignUpButton mode="modal">
                          <button className="px-4 py-2 text-sm font-medium border border-primary text-primary dark:text-primary-700 hover:bg-primary/10 rounded-lg transition-all">
                            Sign Up
                          </button>
                        </SignUpButton>
                        <SignInButton mode="modal">
                          <button className="px-4 py-2 text-sm font-medium bg-gradient-primary hover:opacity-90 text-white rounded-lg transition-all">
                            Sign In
                          </button>
                        </SignInButton>
                      </SignedOut>
                      <SignedIn>
                        <UserButton
                          appearance={{
                            elements: {
                              avatarBox: "w-10 h-10 rounded-full border-2 border-primary"
                            }
                          }}
                          afterSignOutUrl="/"
                        />
                      </SignedIn>
                    </div>
                  </div>
                </header>

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
