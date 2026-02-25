import type { Metadata } from 'next';
import { APP_NAME, APP_DESCRIPTION } from '@/lib/constants';
import { Shell } from '@/components/shell';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastProvider } from '@/components/toast';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — ${APP_DESCRIPTION}`,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  icons: {
    icon: [
      { url: '/favicon-dark.svg', media: '(prefers-color-scheme: dark)' },
      { url: '/favicon-light.svg', media: '(prefers-color-scheme: light)' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="bg-bg text-ink antialiased">
        <ThemeProvider>
          <ToastProvider>
            <Shell>{children}</Shell>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
