import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ContextCache - Privacy-first memory engine for AI',
  description: 'Local-first, zero-knowledge memory system with explainable answers and cryptographic audit trails',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 dark:bg-gray-900">
        <div className="min-h-screen">
          {/* Development banner */}
          <div className="bg-yellow-500 text-black px-4 py-2 text-center text-sm font-medium">
            🚧 Alpha Version - Under Active Development
          </div>
          
          {children}
        </div>
      </body>
    </html>
  );
}