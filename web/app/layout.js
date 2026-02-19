import "./globals.css";
import { ThemeProvider } from "./theme-provider";
import { ToastProvider } from "./components/toast";
import Shell from "./shell";

export const metadata = {
  title: "TheContextCache™",
  description: "Project Brain for AI-assisted teams — capture decisions, recall context.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
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
