import type { Metadata } from 'next';
import WeeklyUniverse from '@/components/reading/WeeklyUniverse';

export const metadata: Metadata = {
  title: 'Weekly Topics | Reading',
  description:
    'Explore ten toy model research topics, physics lectures, and an interactive detector.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nocache: true,
  },
  referrer: 'no-referrer',
};

export default function WeeklyTopicsPage() {
  return <WeeklyUniverse />;
}
