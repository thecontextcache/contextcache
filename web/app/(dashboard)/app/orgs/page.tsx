import type { Metadata } from 'next';
import { OrgsContent } from './orgs-content';

export const metadata: Metadata = {
  title: 'Organisation',
};

export default function OrgsPage() {
  return <OrgsContent />;
}
