import "./globals.css";
import { ThemeProvider } from "./theme-provider";
import { ToastProvider } from "./components/toast";
import Shell from "./shell";

export const metadata = {
  title: "TheContextCache™ — Project Brain for AI Teams",
  description:
    "Capture high-signal decisions and findings, then recall paste-ready context packs for any LLM. Invite-only alpha.",
  icons: {
    icon: "/favicon-dark.svg",
    shortcut: "/favicon-dark.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/*
          Anti-FOUC: runs synchronously before any CSS paints.
          Reads persisted theme from localStorage; falls back to "dark".
          Must stay inline — no async, no defer.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('contextcache_theme')||'dark';var r=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;document.documentElement.setAttribute('data-theme',r);var f=document.getElementById('dynamic-favicon');if(f){f.setAttribute('href',r==='dark'?'/favicon-dark.svg':'/favicon-light.svg');}}catch(e){}})();`,
          }}
        />
        <link id="dynamic-favicon" rel="icon" href="/favicon-dark.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/favicon-dark.svg" type="image/svg+xml" />
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
      <body>
        <ThemeProvider>
          <ToastProvider>
            <Shell>{children}</Shell>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
