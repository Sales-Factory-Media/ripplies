'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './SiteNav.module.css';

const LINKS = [
  { href: '/', label: 'Rings' },
  { href: '/boxes', label: 'Boxes' },
];

export default function SiteNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Effects">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link key={href} href={href} className={`${styles.link} ${active ? styles.active : ''}`} aria-current={active ? 'page' : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
