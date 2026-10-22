// The church's logo beside its name, and its colours as the theme of a surface.
import { useEffect, useState, type CSSProperties } from 'react';

import type { Church } from '@/api/admin-types';
import { brandVars, isDark, logoFor } from '@/lib/brand';

import { Mark } from './ui';

type Branded = Pick<Church, 'name' | 'logoUrl' | 'brand'>;

/** The church's logo at `size`, or the Flockwise mark while the church has none. */
export function ChurchLogo({ church, size = 32, dark = false, fallback = true, className = '' }: { church: Branded | null | undefined; size?: number; dark?: boolean; fallback?: boolean; className?: string }) {
  const src = logoFor(church, dark);
  if (!src) return fallback ? <Mark size={size} reverse={dark} /> : null;
  return <img src={src} alt="" width={size} height={size} className={`church-logo ${className}`} style={{ width: size, height: size }} />;
}

/** Logo and name together, as on every header. */
export function ChurchName({ church, size = 30, dark = false, children }: { church: Branded | null | undefined; size?: number; dark?: boolean; children?: React.ReactNode }) {
  return (
    <div className="row" style={{ gap: 10, minWidth: 0 }}>
      <ChurchLogo church={church} size={size} dark={dark} />
      <div style={{ minWidth: 0 }}>
        <div className="church-name ellipsis">{church?.name ?? ''}</div>
        {children}
      </div>
    </div>
  );
}

/** Follows the page theme (system setting or the data-theme attribute). */
export function useDarkTheme() {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const update = () => setDark(isDark());
    mq?.addEventListener('change', update);
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq?.removeEventListener('change', update);
      obs.disconnect();
    };
  }, []);
  return dark;
}

/** Style for a wrapper so everything inside uses the church's colours and heading font. */
export function useBrandStyle(church: Pick<Church, 'brand'> | null | undefined): CSSProperties | undefined {
  const dark = useDarkTheme();
  return church?.brand ? brandVars(church.brand, dark) : undefined;
}
