import type { Metadata } from 'next';
import RippleBoxes from '@/components/RippleBoxes';

export const metadata: Metadata = { title: 'Boxes' };

export default function BoxesPage() {
  return <RippleBoxes />;
}
