import "./globals.css";
import { ThemeProvider } from "./theme-provider";
import { ToastProvider } from "./components/toast";
import Shell from "./shell";

export const metadata = {
  title: "TheContextCache™ — Project Brain for AI Teams",
  description:
    "Capture high-signal decisions and findings, then recall paste-ready context packs for any LLM. Invite-only alpha.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
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
