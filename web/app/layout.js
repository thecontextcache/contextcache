import "./globals.css";
import { ThemeProvider } from "./theme-provider";
import Shell from "./shell";

export const metadata = {
  title: "TheContextCache™",
  description: "Project Brain for LLM Systems",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <Shell>{children}</Shell>
        </ThemeProvider>
      </body>
    </html>
  );
}
