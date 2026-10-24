// 100 drawn, gently animated avatars for people who have no photo. Each one is a mix of ten hair
// styles (including a head scarf and a bald head with a beard), six skin tones, eight hair colours,
// ten clothes colours and ten backgrounds; the eyes blink and the head bobs a little. The number
// comes from the person's id unless they chose one, so the same person always looks the same.
import type { CSSProperties } from 'react';

export const AVATAR_COUNT = 100;

const BG = ['#FDE2E4', '#E2ECE9', '#DFE7FD', '#FFF1E6', '#E8E8FD', '#D8F3DC', '#FCE1F5', '#FFF8D6', '#E0F4FF', '#F1E4D6'];
const SKIN = ['#F9D7B5', '#EBC097', '#D9A27A', '#C68A5E', '#A86D45', '#7E4E2D'];
const HAIR = ['#1E1A18', '#3B2A20', '#5A3A22', '#8C5A2B', '#B07D3E', '#2B2B35', '#6B6B6B', '#CFCFCF'];
const SHIRT = ['#2F7D6D', '#E07A5F', '#3D5A80', '#F2C14E', '#8E7DBE', '#E56B6F', '#4A9D5B', '#F28C38', '#2A9D8F', '#9C6644'];

export type AvatarLook = { style: number; bg: string; skin: string; hair: string; shirt: string; glasses: boolean; smile: number; blush: boolean };

export function avatarLook(n: number): AvatarLook {
  const i = ((Math.trunc(n) % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT;
  const row = Math.floor(i / 10);
  return {
    style: i % 10,
    bg: BG[(i * 3 + row) % 10]!,
    skin: SKIN[(i * 7 + row) % 6]!,
    hair: HAIR[(i * 5 + row * 3) % 8]!,
    shirt: SHIRT[(i + row * 3) % 10]!,
    glasses: i % 9 === 4 || i % 11 === 7,
    smile: (i + row) % 3,
    blush: i % 4 === 1,
  };
}

/** Stable number 0–99 from any text (a person id, or a name when there is no id). */
export function avatarFor(seed: string): number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619) >>> 0;
  return h % AVATAR_COUNT;
}

function BackHair({ l }: { l: AvatarLook }) {
  switch (l.style) {
    case 3: return <path d="M29 42 C28 20 72 20 71 42 L73 76 L27 76 Z" fill={l.hair} />;
    case 5: return <ellipse cx="71" cy="54" rx="6" ry="14" fill={l.hair} />;
    case 7: return <path d="M29 44 C27 20 73 20 71 44 C73 54 69 62 66 64 L34 64 C31 62 27 54 29 44 Z" fill={l.hair} />;
    case 9: return <path d="M28 50 C26 20 74 20 72 50 C72 66 63 76 50 78 C37 76 28 66 28 50 Z" fill={l.shirt} opacity="0.85" />;
    default: return null;
  }
}

function FrontHair({ l }: { l: AvatarLook }) {
  switch (l.style) {
    case 0: return <path d="M33 44 C32 25 68 25 67 44 C62 35 38 35 33 44 Z" fill={l.hair} />;
    case 1: return <path d="M33 47 C30 23 70 23 67 46 C64 33 52 30 41 36 C37 39 35 43 33 47 Z" fill={l.hair} />;
    case 2: return <g fill={l.hair}>{[[36, 35], [43, 28], [51, 26], [59, 29], [65, 36], [33, 43], [67, 43], [47, 31], [56, 32]].map(([x, y], k) => <circle key={k} cx={x} cy={y} r="6.5" />)}</g>;
    case 3: return <path d="M33 43 C35 27 65 27 67 43 C58 34 42 34 33 43 Z" fill={l.hair} />;
    case 4: return <g fill={l.hair}><circle cx="50" cy="21" r="8" /><path d="M33 43 C33 27 67 27 67 43 C61 35 39 35 33 43 Z" /></g>;
    case 5: return <path d="M33 45 C31 24 69 24 67 45 C63 34 45 31 33 45 Z" fill={l.hair} />;
    case 6: return <path d="M34 52 C36 71 64 71 66 52 C61 62 39 62 34 52 Z" fill={l.hair} />;
    case 7: return <path d="M33 44 C34 26 66 26 67 44 C63 38 59 40 55 36 C51 40 45 37 41 40 C38 38 35 41 33 44 Z" fill={l.hair} />;
    case 8: return <path d="M33 43 L35 28 L41 34 L45 23 L50 32 L55 22 L59 33 L65 27 L67 43 C60 36 40 36 33 43 Z" fill={l.hair} />;
    case 9: return <path d="M32 46 C33 27 67 27 68 46 C61 34 39 34 32 46 Z" fill={l.shirt} />;
    default: return null;
  }
}

/** One avatar as an SVG that fills its box. `still` turns the animation off (galleries, print). */
export function DrawnAvatar({ n, still, title }: { n: number; still?: boolean; title?: string }) {
  const l = avatarLook(n);
  const delay = { '--av-delay': `${(n % 10) * 0.37}s` } as CSSProperties;
  return (
    <svg className={`fw-avatar ${still ? 'still' : ''}`} viewBox="0 0 100 100" style={delay} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect width="100" height="100" fill={l.bg} />
      <path d="M16 102 C16 79 33 70 50 70 C67 70 84 79 84 102 Z" fill={l.shirt} />
      <path d="M43 69 C45 74 55 74 57 69" fill="none" stroke="rgba(0,0,0,.12)" strokeWidth="2" />
      <g className="av-head">
        <BackHair l={l} />
        <rect x="44" y="58" width="12" height="13" rx="5" fill={l.skin} />
        <ellipse cx="50" cy="46" rx="17" ry="19" fill={l.skin} />
        <ellipse cx="33.5" cy="48" rx="2.6" ry="4" fill={l.skin} />
        <ellipse cx="66.5" cy="48" rx="2.6" ry="4" fill={l.skin} />
        <FrontHair l={l} />
        {l.blush && <g fill="#F4978E" opacity="0.45"><circle cx="40" cy="53" r="3" /><circle cx="60" cy="53" r="3" /></g>}
        <g className="av-eyes" fill="#1E1A18"><circle cx="43" cy="47" r="2.1" /><circle cx="57" cy="47" r="2.1" /></g>
        {l.glasses && <g fill="none" stroke="#2B2B35" strokeWidth="1.4"><circle cx="43" cy="47" r="5" /><circle cx="57" cy="47" r="5" /><path d="M48 47 H52" /></g>}
        {l.smile === 0 && <path d="M44 55 Q50 60 56 55" fill="none" stroke="#5A2E1E" strokeWidth="1.8" strokeLinecap="round" />}
        {l.smile === 1 && <path d="M44 54.5 Q50 61.5 56 54.5 Z" fill="#7A2E22" />}
        {l.smile === 2 && <path d="M45.5 56 Q50 58.5 54.5 56" fill="none" stroke="#5A2E1E" strokeWidth="1.8" strokeLinecap="round" />}
      </g>
    </svg>
  );
}
