import "./globals.css";
import { Suspense } from "react";
import Script from "next/script";
import { ThemeProvider } from "./theme-provider";
import { ToastProvider } from "./components/toast";
import Shell from "./shell";

export const metadata = {
  title: "TheContextCache™ — Project Brain for AI Teams",
  description:
    "Capture high-signal decisions and findings, then recall paste-ready context packs for any LLM. Invite-only alpha.",
  icons: {
    icon: { url: "/favicon-dark.svg", type: "image/svg+xml" },
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Space+Grotesk:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap"
        />
      </head>
      <body suppressHydrationWarning>
        {/* Anti-FOUC theme init — runs before first paint via next/script.
            Placed in <body> (not <head>) to keep it outside React's <head>
            hydration tree, preventing mismatch when the browser or Cloudflare
            reorders/modifies <head> elements. */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('contextcache_theme')||'dark';if(t!=='dark'&&t!=='light'&&t!=='system'){t='dark';}var r=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;document.documentElement.setAttribute('data-theme',r);}catch(e){}})();`,
          }}
        />
        {/* Suspense boundary: if a hydration mismatch occurs anywhere in the
            client component tree below, React recovers by client-rendering
            ONLY this subtree — NOT the entire document.  Without this boundary,
            React calls createRoot(document) and tries appendChild(<html>),
            which throws HierarchyRequestError and produces a permanent white
            screen. */}
        <Suspense>
          <ThemeProvider>
            <ToastProvider>
              <Shell>{children}</Shell>
            </ToastProvider>
          </ThemeProvider>
        </Suspense>
      </body>
    </html>
  );
}
