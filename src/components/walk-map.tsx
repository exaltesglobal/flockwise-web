// A light street map for the prayer walk: OpenStreetMap tiles with the church's streets drawn on top.
// Drag to move, scroll or use + and − to zoom, tap a street to pick it, tap the map elsewhere to
// place a point (setting the centre or drawing a street). No map library: tiles are plain images
// placed in Web Mercator, and the streets are one SVG over them.
import { LocateFixed, Minus, Plus } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export type MapStreet = { id: string; path: [number, number][]; covered: boolean; mine?: boolean };
export type LatLng = { lat: number; lng: number };

const TILE = 256;
const MIN_Z = 12;
const MAX_Z = 19;

/** Latitude and longitude to world pixels at zoom z. */
function project(lat: number, lng: number, z: number): [number, number] {
  const w = TILE * 2 ** z;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return [((lng + 180) / 360) * w, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * w];
}
function unproject(x: number, y: number, z: number): LatLng {
  const w = TILE * 2 ** z;
  const n = Math.PI - (2 * Math.PI * y) / w;
  return { lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lng: (x / w) * 360 - 180 };
}
/** A zoom that fits a circle of `radius` metres into the smaller side of the box. */
function fitZoom(lat: number, radius: number, px: number) {
  const mPerPx0 = (156543.03 * Math.cos((lat * Math.PI) / 180));
  const z = Math.log2((mPerPx0 * px) / (radius * 2.2));
  return Math.max(MIN_Z, Math.min(MAX_Z - 1, Math.floor(z)));
}

export function WalkMap({
  center,
  radius,
  streets,
  selected,
  draft,
  here,
  height = 420,
  onStreet,
  onPoint,
  children,
}: {
  center: LatLng;
  radius?: number;
  streets: MapStreet[];
  selected?: Set<string>;
  /** Points of a street being drawn. */
  draft?: [number, number][];
  /** The walker's position. */
  here?: LatLng | null;
  height?: number;
  onStreet?: (id: string) => void;
  onPoint?: (p: LatLng) => void;
  children?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: height });
  const [z, setZ] = useState(16);
  const [c, setC] = useState<[number, number]>(() => project(center.lat, center.lng, 16));
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean; pinch?: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Recentre when the area changes.
  useEffect(() => {
    const el = box.current;
    const nz = radius && el ? fitZoom(center.lat, radius, Math.min(el.clientWidth, el.clientHeight)) : z;
    setZ(nz);
    setC(project(center.lat, center.lng, nz));
  }, [center.lat, center.lng, radius]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomTo = (nz: number, at?: [number, number]) => {
    nz = Math.max(MIN_Z, Math.min(MAX_Z, nz));
    if (nz === z) return;
    const f = 2 ** (nz - z);
    // Keep the point under the cursor (or the middle) still.
    const ax = at ? at[0] : size.w / 2;
    const ay = at ? at[1] : size.h / 2;
    const wx = c[0] - size.w / 2 + ax;
    const wy = c[1] - size.h / 2 + ay;
    setC([wx * f - ax + size.w / 2, wy * f - ay + size.h / 2]);
    setZ(nz);
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomTo(z + (e.deltaY < 0 ? 1 : -1), [e.clientX - r.left, e.clientY - r.top]);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  const left = c[0] - size.w / 2;
  const top = c[1] - size.h / 2;
  const toScreen = ([lat, lng]: [number, number]) => {
    const [x, y] = project(lat, lng, z);
    return `${(x - left).toFixed(1)},${(y - top).toFixed(1)}`;
  };

  const tiles: ReactNode[] = [];
  const n = 2 ** z;
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + size.w) / TILE); tx++) {
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + size.h) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      const wx = ((tx % n) + n) % n;
      tiles.push(<img key={`${z}/${tx}/${ty}`} src={`https://tile.openstreetmap.org/${z}/${wx}/${ty}.png`} alt="" draggable={false} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} style={{ position: 'absolute', left: tx * TILE - left, top: ty * TILE - top, width: TILE, height: TILE, userSelect: 'none', pointerEvents: 'none' }} />);
    }
  }

  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      drag.current = { x: 0, y: 0, cx: c[0], cy: c[1], moved: true, pinch: Math.hypot(a.x - b.x, a.y - b.y) };
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, cx: c[0], cy: c[1], moved: false };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (d.pinch) {
      const [a, b] = [...pointers.current.values()];
      if (!b) return;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist / d.pinch > 1.6) { zoomTo(z + 1); d.pinch = dist; }
      else if (dist / d.pinch < 0.6) { zoomTo(z - 1); d.pinch = dist; }
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;
    if (d.moved) setC([d.cx - dx, d.cy - dy]);
  };
  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (pointers.current.size > 0) return;
    drag.current = null;
    if (!d || d.moved) return;
    const hit = (document.elementFromPoint(e.clientX, e.clientY) as Element | null)?.closest('[data-street]');
    if (hit && onStreet) return onStreet(hit.getAttribute('data-street')!);
    if (onPoint) {
      const r = box.current!.getBoundingClientRect();
      onPoint(unproject(left + e.clientX - r.left, top + e.clientY - r.top, z));
    }
  };

  // The area circle, in screen pixels.
  const [ccx, ccy] = project(center.lat, center.lng, z);
  const mPerPx = (156543.03 * Math.cos((center.lat * Math.PI) / 180)) / 2 ** z;
  const sel = selected ?? new Set<string>();
  const hereXY = here ? project(here.lat, here.lng, z) : null;

  return (
    <div
      ref={box}
      className="walk-map"
      style={{ position: 'relative', height, overflow: 'hidden', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: '#e8eee9', touchAction: 'none', cursor: onPoint ? 'crosshair' : 'grab' }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={(e) => { pointers.current.delete(e.pointerId); drag.current = null; }}
    >
      {tiles}
      <svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0 }}>
        {radius && <circle cx={ccx - left} cy={ccy - top} r={radius / mPerPx} fill="rgba(31,107,92,.06)" stroke="#1f6b5c" strokeDasharray="6 5" strokeWidth={1.5} />}
        {streets.map((s) => {
          const pts = s.path.map(toScreen).join(' ');
          const on = sel.has(s.id);
          const colour = on ? '#2563eb' : s.covered ? '#157f54' : '#c2410c';
          return (
            <g key={s.id} data-street={s.id} style={{ cursor: onStreet ? 'pointer' : undefined }}>
              <polyline points={pts} fill="none" stroke="transparent" strokeWidth={18} strokeLinecap="round" />
              {on && <polyline points={pts} fill="none" stroke="#fff" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />}
              <polyline points={pts} fill="none" stroke={colour} strokeWidth={on ? 6 : 4.5} strokeOpacity={s.covered || on ? 0.95 : 0.75} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.covered || on ? undefined : '7 5'} />
            </g>
          );
        })}
        {draft && draft.length > 0 && (
          <>
            <polyline points={draft.map(toScreen).join(' ')} fill="none" stroke="#7c3aed" strokeWidth={4} strokeLinecap="round" />
            {draft.map((p, i) => { const [x, y] = toScreen(p).split(',').map(Number); return <circle key={i} cx={x} cy={y} r={5} fill="#fff" stroke="#7c3aed" strokeWidth={2} />; })}
          </>
        )}
        {hereXY && (
          <>
            <circle cx={hereXY[0] - left} cy={hereXY[1] - top} r={14} fill="rgba(37,99,235,.18)" />
            <circle cx={hereXY[0] - left} cy={hereXY[1] - top} r={6} fill="#2563eb" stroke="#fff" strokeWidth={2} />
          </>
        )}
      </svg>
      <div className="stack" style={{ position: 'absolute', right: 8, top: 8, gap: 4 }} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
        <button type="button" className="btn icon sm" style={{ background: 'var(--card)' }} title="Zoom in" onClick={() => zoomTo(z + 1)}><Plus size={16} /></button>
        <button type="button" className="btn icon sm" style={{ background: 'var(--card)' }} title="Zoom out" onClick={() => zoomTo(z - 1)}><Minus size={16} /></button>
        <button type="button" className="btn icon sm" style={{ background: 'var(--card)' }} title="Back to the centre" onClick={() => setC(project(center.lat, center.lng, z))}><LocateFixed size={16} /></button>
      </div>
      {children && <div style={{ position: 'absolute', left: 8, top: 8, right: 52 }} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>{children}</div>}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} style={{ position: 'absolute', right: 0, bottom: 0, fontSize: 11, padding: '1px 6px', background: 'rgba(255,255,255,.85)', color: '#333' }}>© OpenStreetMap contributors</a>
    </div>
  );
}

/** Legend under the map. */
export function WalkLegend({ covered, uncovered, picked }: { covered: string; uncovered: string; picked?: string }) {
  const item = (colour: string, label: string, dashed = false) => (
    <span className="row small" style={{ gap: 6 }}>
      <svg width="26" height="8"><line x1="2" y1="4" x2="24" y2="4" stroke={colour} strokeWidth="4" strokeLinecap="round" strokeDasharray={dashed ? '5 4' : undefined} /></svg>
      {label}
    </span>
  );
  return (
    <div className="row wrap" style={{ gap: 14 }}>
      {item('#157f54', covered)}
      {item('#c2410c', uncovered, true)}
      {picked && item('#2563eb', picked)}
    </div>
  );
}

/** Metres between two points. */
export function distance(a: LatLng, b: [number, number]) {
  const R = 6371000;
  const dLat = ((b[0] - a.lat) * Math.PI) / 180;
  const dLng = ((b[1] - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
