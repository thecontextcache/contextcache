import "./globals.css";

export const metadata = {
  title: "ContextCache",
  description: "Tiny UI for ContextCache MVP",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
