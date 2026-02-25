import type { Metadata } from 'next';
import { ApiKeysContent } from './api-keys-content';

export const metadata: Metadata = {
  title: 'API Keys',
};

export default function ApiKeysPage() {
  return <ApiKeysContent />;
}
