import type { Metadata } from 'next';
import RingsStudio from '@/components/RingsStudio';

export const metadata: Metadata = { title: 'Stack' };

export default function StackPage() {
  return <RingsStudio stack />;
}
