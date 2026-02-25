import type { Metadata } from 'next';
import { BrainContent } from './brain-content';

export const metadata: Metadata = {
  title: 'Brain',
};

export default function BrainPage() {
  return <BrainContent />;
}
