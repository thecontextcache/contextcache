import type { Metadata } from 'next';
import { ClientsContent } from './clients-content';

export const metadata: Metadata = {
  title: 'Downloads',
};

export default function ClientsPage() {
  return <ClientsContent />;
}
