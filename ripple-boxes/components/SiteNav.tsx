'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './SiteNav.module.css';

const LINKS = [
  { href: '/', label: 'Rings' },
  { href: '/boxes', label: 'Boxes' },
];

/** The post that inspired this project. Keep this credit visible on every page. */
export const INSPIRATION_URL = 'https://x.com/MoizArshi29/status/2100228031113793717';

export default function SiteNav() {
  const pathname = usePathname();
  return (
    <>
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
      <a className={styles.credit} href={INSPIRATION_URL} target="_blank" rel="noopener noreferrer">
        Inspired by <strong>@MoizArshi29</strong>’s post on X <span aria-hidden="true">↗</span>
        <span className={styles.srOnly}> (opens in a new tab)</span>
      </a>
    </>
  );
}
