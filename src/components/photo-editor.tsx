// Change a profile picture: upload a photo, drag and zoom it inside the circle, or pick one of the
// 100 drawn avatars. The browser crops and shrinks the photo to a 360px square JPEG before sending,
// so uploads stay small even from a phone camera.
import { Camera, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';

import { AVATAR_COUNT, DrawnAvatar, avatarFor } from '@/components/avatars';
import { Avatar, Modal } from '@/components/ui';

const OUT = 360;
const VIEW = 260;

type Who = { id: string; name: string; photoUrl?: string | null; avatar?: number | null };
export type PhotoEditorLabels = {
  title: string; photo: string; avatars: string; choose: string; dragHint: string; zoom: string; save: string; cancel: string; remove: string; auto: string; autoHint: string;
};
export const PHOTO_LABELS_EN: PhotoEditorLabels = {
  title: 'Profile picture', photo: 'Photo', avatars: 'Avatar', choose: 'Choose a photo', dragHint: 'Drag to move, use the slider to zoom.', zoom: 'Zoom', save: 'Save', cancel: 'Cancel', remove: 'Remove photo', auto: 'Pick for me', autoHint: 'Shown when there is no photo.',
};

export function PhotoEditor({ who, labels = PHOTO_LABELS_EN, onSavePhoto, onRemovePhoto, onPickAvatar, onClose }: {
  who: Who; labels?: PhotoEditorLabels;
  onSavePhoto: (dataUrl: string) => Promise<void>; onRemovePhoto: () => Promise<void>; onPickAvatar: (n: number | null) => Promise<void>; onClose: () => void;
}) {
  const [tab, setTab] = useState<'photo' | 'avatar'>('photo');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  // The photo covers the circle at zoom 1; offsets are kept inside so no gap shows.
  const base = img ? VIEW / Math.min(img.width, img.height) : 1;
  const w = img ? img.width * base * zoom : 0;
  const h = img ? img.height * base * zoom : 0;
  const clamp = (p: { x: number; y: number }) => ({ x: Math.max(-(w - VIEW) / 2, Math.min((w - VIEW) / 2, p.x)), y: Math.max(-(h - VIEW) / 2, Math.min((h - VIEW) / 2, p.y)) });
  useEffect(() => { setPos((p) => clamp(p)); }, [zoom, img]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(f: File | undefined) {
    if (!f) return;
    if (!/^image\//.test(f.type)) { setErr('Choose a picture file.'); return; }
    setErr(null);
    const url = URL.createObjectURL(f);
    const i = new Image();
    i.onload = () => { setImg(i); setZoom(1); setPos({ x: 0, y: 0 }); };
    i.onerror = () => setErr('This picture could not be opened. Try a JPG or PNG.');
    i.src = url;
  }

  const down = (e: RPointerEvent) => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; };
  const move = (e: RPointerEvent) => { const d = drag.current; if (d) setPos(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y })); };
  const up = () => { drag.current = null; };

  async function save() {
    if (!img) return;
    const c = document.createElement('canvas');
    c.width = OUT; c.height = OUT;
    const g = c.getContext('2d')!;
    const k = OUT / VIEW;
    g.fillStyle = '#fff'; g.fillRect(0, 0, OUT, OUT);
    g.drawImage(img, (VIEW / 2 - w / 2 + pos.x) * k, (VIEW / 2 - h / 2 + pos.y) * k, w * k, h * k);
    await run(() => onSavePhoto(c.toDataURL('image/jpeg', 0.86)));
  }
  async function run(f: () => Promise<void>) {
    setBusy(true); setErr(null);
    try { await f(); onClose(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const auto = avatarFor(who.id || who.name);
  return (
    <Modal title={labels.title} onClose={onClose}
      footer={tab === 'photo' ? <>
        {who.photoUrl && !img && <button className="btn ghost" disabled={busy} onClick={() => void run(onRemovePhoto)}><Trash2 size={15} /> {labels.remove}</button>}
        <span className="grow" />
        <button className="btn" onClick={onClose}>{labels.cancel}</button>
        <button className="btn primary" disabled={!img || busy} onClick={() => void save()}>{labels.save}</button>
      </> : <button className="btn" onClick={onClose}>{labels.cancel}</button>}>
      <div className="stack">
        <div className="pe-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'photo'} className={tab === 'photo' ? 'on' : ''} onClick={() => setTab('photo')}><Camera size={15} /> {labels.photo}</button>
          <button role="tab" aria-selected={tab === 'avatar'} className={tab === 'avatar' ? 'on' : ''} onClick={() => setTab('avatar')}>{labels.avatars}</button>
        </div>
        {tab === 'photo' ? (
          <div className="stack" style={{ alignItems: 'center', gap: 12 }}>
            {img ? (
              <div className="pe-crop" style={{ width: VIEW, height: VIEW }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
                <img src={img.src} alt="" draggable={false} style={{ width: w, height: h, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }} />
              </div>
            ) : (
              <button className="pe-drop" style={{ width: VIEW, height: VIEW }} onClick={() => file.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}>
                <Avatar name={who.name} person={who} size="xl" />
                <span className="row" style={{ gap: 6 }}><Upload size={15} /> {labels.choose}</span>
              </button>
            )}
            {img && <>
              <p className="small muted" style={{ margin: 0 }}>{labels.dragHint}</p>
              <label className="row small" style={{ gap: 8, width: VIEW }}>{labels.zoom}<input className="grow" type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
              <button className="btn sm ghost" onClick={() => file.current?.click()}>{labels.choose}</button>
            </>}
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            <p className="small muted" style={{ margin: 0 }}>{labels.autoHint}</p>
            <div className="pe-grid">
              <button className={`pe-av ${who.avatar == null ? 'on' : ''}`} disabled={busy} onClick={() => void run(() => onPickAvatar(null))} title={labels.auto}><DrawnAvatar n={auto} /><span>{labels.auto}</span></button>
              {Array.from({ length: AVATAR_COUNT }, (_, n) => (
                <button key={n} className={`pe-av ${who.avatar === n ? 'on' : ''}`} disabled={busy} onClick={() => void run(() => onPickAvatar(n))} aria-label={`Avatar ${n + 1}`}><DrawnAvatar n={n} still /></button>
              ))}
            </div>
          </div>
        )}
        {err && <p className="small" style={{ color: 'var(--danger)', margin: 0 }}>{err}</p>}
      </div>
    </Modal>
  );
}
