import type { Metadata } from 'next';
import { BrainContent } from './brain-content';
import { BrainContentWebGL } from './brain-content-webgl';

export const metadata: Metadata = {
  title: 'Brain',
};

export default function BrainPage() {
  const renderer = (process.env.NEXT_PUBLIC_BRAIN_RENDERER || 'webgl').toLowerCase();
  return renderer === 'canvas' ? <BrainContent /> : <BrainContentWebGL />;
}
