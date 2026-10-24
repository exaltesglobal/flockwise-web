// Decorative graphics drawn in the church's own colours (primary and accent), so they follow
// every scheme, dark mode and a church's brand kit. Purely visual: hidden from screen readers.

/** Soft light rays and layered hills for the top of Home and the dashboard. */
export function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 600 220" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="hero-sun" cx="78%" cy="18%" r="60%">
          <stop offset="0" stopOpacity="0.55" style={{ stopColor: 'var(--accent)' }} />
          <stop offset="0.45" stopOpacity="0.12" style={{ stopColor: 'var(--accent)' }} />
          <stop offset="1" stopOpacity="0" style={{ stopColor: 'var(--accent)' }} />
        </radialGradient>
        <linearGradient id="hero-hill-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopOpacity="0.28" style={{ stopColor: 'var(--primary)' }} />
          <stop offset="1" stopOpacity="0.04" style={{ stopColor: 'var(--primary)' }} />
        </linearGradient>
        <linearGradient id="hero-hill-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopOpacity="0.45" style={{ stopColor: 'var(--primary)' }} />
          <stop offset="1" stopOpacity="0.08" style={{ stopColor: 'var(--primary)' }} />
        </linearGradient>
      </defs>
      <rect width="600" height="220" fill="url(#hero-sun)" />
      <g strokeOpacity="0.16" strokeWidth="1.5" strokeLinecap="round" style={{ stroke: 'var(--accent)' }}>
        {[112, 126, 140, 154, 168].map((a) => (
          <line key={a} x1="468" y1="40" x2={468 + Math.cos((a * Math.PI) / 180) * 190} y2={40 + Math.sin((a * Math.PI) / 180) * 190} />
        ))}
      </g>
      <path d="M0 170 C 120 120, 220 150, 320 128 S 520 96, 600 120 L600 220 L0 220 Z" fill="url(#hero-hill-a)" />
      <path d="M180 200 C 280 160, 380 178, 460 156 S 560 150, 600 160 L600 220 L180 220 Z" fill="url(#hero-hill-b)" />
      <g style={{ fill: 'var(--accent)' }}>
        <circle cx="410" cy="62" r="2.2" opacity="0.7" />
        <circle cx="540" cy="92" r="1.6" opacity="0.6" />
        <circle cx="360" cy="34" r="1.4" opacity="0.5" />
        <circle cx="565" cy="40" r="2" opacity="0.55" />
      </g>
    </svg>
  );
}

/** Rings and sparks drawn around an empty-state icon. */
export function EmptyArt() {
  return (
    <svg className="empty-art" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="empty-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopOpacity="0.22" style={{ stopColor: 'var(--primary)' }} />
          <stop offset="1" stopOpacity="0" style={{ stopColor: 'var(--primary)' }} />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill="url(#empty-glow)" />
      <circle cx="60" cy="60" r="44" fill="none" strokeOpacity="0.22" strokeWidth="1.2" style={{ stroke: 'var(--primary)' }} />
      <circle cx="60" cy="60" r="54" fill="none" strokeOpacity="0.14" strokeWidth="1" strokeDasharray="2 6" style={{ stroke: 'var(--primary)' }} />
      <circle cx="104" cy="44" r="2.4" opacity="0.8" style={{ fill: 'var(--accent)' }} />
      <circle cx="18" cy="78" r="1.8" opacity="0.6" style={{ fill: 'var(--accent)' }} />
      <circle cx="84" cy="106" r="1.6" opacity="0.5" style={{ fill: 'var(--primary)' }} />
    </svg>
  );
}
