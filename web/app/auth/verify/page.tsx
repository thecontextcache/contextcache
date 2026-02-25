import type { Metadata } from 'next';
import { VerifyContent } from './verify-content';

export const metadata: Metadata = {
  title: 'Verifying...',
};

export default function VerifyPage() {
  return <VerifyContent />;
}
