import { LandingContent } from './landing-content';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TheContextCache — Project Brain for AI Teams',
};

export default function HomePage() {
  return <LandingContent />;
}
