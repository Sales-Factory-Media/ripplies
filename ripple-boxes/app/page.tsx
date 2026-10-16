import type { Metadata } from 'next';
import RingsStudio from '@/components/RingsStudio';

// The layout's title template doesn't apply to a page in the same segment, so spell it out.
export const metadata: Metadata = { title: { absolute: 'Rings · Rippler' } };

export default function RingsPage() {
  return <RingsStudio />;
}
