// Override edge runtime for this route (required for OpenNext Cloudflare)
export const runtime = 'nodejs';

export default function AskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
