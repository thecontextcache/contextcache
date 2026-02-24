import "./globals.css";
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
      <body suppressHydrationWarning>
        <ThemeProvider>
          <ToastProvider>
            <Shell>{children}</Shell>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
