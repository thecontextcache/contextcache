import type { Metadata } from 'next';
import { AdminContent } from './admin-content';

export const metadata: Metadata = {
  title: 'Admin',
};

export default function AdminPage() {
  return <AdminContent />;
}
