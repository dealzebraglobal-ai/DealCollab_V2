'use client';

/**
 * DealCollab — Sidebar menu: "Guide & Trust"
 * ===========================================
 * Drop-in expandable menu for the left panel.
 *
 * Usage inside your sidebar component (server or client — either works):
 *
 *   import GuideMenu from '@/components/GuideMenu';
 *   ...
 *   <GuideMenu />
 *
 * Behavior:
 * - Collapsed by default; click header to toggle.
 * - Auto-expands and highlights the active item when the user is on any
 *   /guide route.
 * - Zero external dependencies: icons are inline SVG, styling is a CSS
 *   module themed via 4 variables at the top of GuideMenu.module.css
 *   (flip them for a dark sidebar).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GUIDE_DOCS } from '@/lib/guideData';
import styles from './GuideMenu.module.css';

function BookIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function GuideMenu() {
  const pathname = usePathname() ?? '';
  const onGuideRoute = pathname === '/guide' || pathname.startsWith('/guide/');
  const [open, setOpen] = useState(onGuideRoute);

  // Auto-expand when the user navigates into the guide section.
  useEffect(() => {
    if (onGuideRoute) setOpen(true);
  }, [onGuideRoute]);

  const itemClass = (href: string) =>
    pathname === href ? `${styles.item} ${styles.itemActive}` : styles.item;

  return (
    <nav className={styles.root} aria-label="Guide and Trust">
      <button
        type="button"
        className={onGuideRoute ? `${styles.trigger} ${styles.triggerActive}` : styles.trigger}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls="guide-menu-items"
      >
        <BookIcon />
        <span className={styles.label}>Guide &amp; Trust</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <ul id="guide-menu-items" className={styles.list}>
          <li>
            <Link
              href="/guide"
              className={itemClass('/guide')}
              aria-current={pathname === '/guide' ? 'page' : undefined}
            >
              Overview
            </Link>
          </li>
          {GUIDE_DOCS.map(doc => {
            const href = `/guide/${doc.slug}`;
            return (
              <li key={doc.slug}>
                <Link
                  href={href}
                  className={itemClass(href)}
                  aria-current={pathname === href ? 'page' : undefined}
                >
                  {doc.title}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
