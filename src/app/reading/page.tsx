import type { Metadata } from 'next';
import ReadingApp from '@/components/reading/ReadingApp';

export const metadata: Metadata = {
  title: 'Reading',
  description: 'Private research reading workspace.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  referrer: 'no-referrer',
};

export default function ReadingPage() {
  return <ReadingApp />;
}
