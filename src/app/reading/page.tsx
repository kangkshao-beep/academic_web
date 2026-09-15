import type { Metadata } from 'next';
import ReadingApp from '@/components/reading/ReadingApp';

export const metadata: Metadata = {
  title: 'Reading',
  description: 'A curated research reading library, relationship map, and thematic reading threads.',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  referrer: 'no-referrer',
};

export default function ReadingPage() {
  return <ReadingApp />;
}
