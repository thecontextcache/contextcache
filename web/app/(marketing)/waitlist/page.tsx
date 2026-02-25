import type { Metadata } from 'next';
import { WaitlistContent } from './waitlist-content';

export const metadata: Metadata = {
  title: 'Join the Waitlist',
};

export default function WaitlistPage() {
  return <WaitlistContent />;
}
