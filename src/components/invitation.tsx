// "Invite someone": an invitation card in the church's branding for an event, with a QR code to
// the event page, shared to WhatsApp or saved as a picture. Used by the office and by members.
import { Copy, Download, ExternalLink, MessageCircle, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { BrandKit } from '@/api/admin-types';
import { formatTime } from '@/lib/format';
import { cardBlob, INVITATION_STYLES, renderInvitation, shareCard, whatsappLink, type InvitationInput, type InvitationStyle } from '@/lib/invitation';

import { Field, Modal, Segmented, useToast } from './ui';

export type InvitationEvent = { id: string; title: string; startsAt: string; endsAt: string; location: string; description: string };
export type InvitationChurch = { name: string; logoUrl?: string | null; brand?: BrandKit | null; phone?: string };

function guessStyle(title: string): InvitationStyle {
  const t = title.toLowerCase();
  if (/christmas|carol|nativity/.test(t)) return 'christmas';
  if (/wedding|marriage|engagement/.test(t)) return 'wedding';
  if (/baptis|dedication|christening/.test(t)) return 'baptism';
  if (/easter|resurrection|good friday/.test(t)) return 'easter';
  return 'event';
}

export function InvitationModal({ event, church, link, shareText, locale = 'en-IN', onCanva, onClose }: { event: InvitationEvent; church: InvitationChurch; link: string; shareText: string; locale?: string; onCanva?: (imageDataUrl: string, title: string) => Promise<string>; onClose: () => void }) {
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  // The card goes to the church's Canva as a new design, with this picture on it, for finer editing.
  async function openInCanva() {
    if (!canvas.current || !onCanva) return;
    setOpening(true);
    const tab = window.open('', '_blank');
    try {
      const editUrl = await onCanva(canvas.current.toDataURL('image/png'), title);
      if (tab) tab.location.href = editUrl; else window.open(editUrl, '_blank');
      toast('Opened in Canva');
    } catch (e) {
      tab?.close();
      toast((e as Error).message || 'Could not open Canva');
    } finally {
      setOpening(false);
    }
  }
  const [style, setStyle] = useState<InvitationStyle>(() => guessStyle(event.title));
  const [headline, setHeadline] = useState(() => INVITATION_STYLES.find((s) => s.id === guessStyle(event.title))!.headline);
  const [title, setTitle] = useState(event.title);
  const [message, setMessage] = useState(() => event.description.split('\n')[0].slice(0, 180));
  const [host, setHost] = useState(church.name);
  const [withQr, setWithQr] = useState(true);
  const [preview, setPreview] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const date = new Date(event.startsAt).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = `${formatTime(event.startsAt, locale)} – ${formatTime(event.endsAt, locale)}`;

  const input: InvitationInput = { style, church: { name: church.name, logoUrl: church.logoUrl ?? null, brand: church.brand, phone: church.phone, tagline: church.brand?.tagline }, headline, title, date, time, place: event.location, message, host, link: withQr ? link : '', linkLabel: 'Scan to RSVP' };
  const key = JSON.stringify(input);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      void renderInvitation(JSON.parse(key) as InvitationInput).then((cv) => {
        if (!live) return;
        canvas.current = cv;
        setPreview(cv.toDataURL('image/jpeg', 0.8));
      });
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key]);

  const fileName = `${title.replace(/[\\/:*?"<>|]+/g, '').slice(0, 60) || 'invitation'}.png`;
  async function share() {
    if (!canvas.current) return;
    setBusy(true);
    try {
      const how = await shareCard(canvas.current, fileName, shareText);
      toast(how === 'shared' ? 'Shared' : 'Saved the card. Attach it in WhatsApp.');
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!canvas.current) return;
    const blob = await cardBlob(canvas.current);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <Modal title="Invitation" onClose={onClose} wide
      footer={<>
        <button className="btn" onClick={onClose}>Close</button>
        <button className="btn" onClick={() => void navigator.clipboard?.writeText(link).then(() => toast('Link copied'))}><Copy size={15} /> Copy link</button>
        <a className="btn" href={whatsappLink(shareText)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp text</a>
        <button className="btn" onClick={download} disabled={!preview}><Download size={15} /> Save picture</button>
        {onCanva && <button className="btn" onClick={openInCanva} disabled={!preview || opening}><ExternalLink size={15} /> {opening ? 'Opening…' : 'Open in Canva'}</button>}
        <button className="btn primary" onClick={share} disabled={!preview || busy}><Share2 size={15} /> Share card</button>
      </>}
    >
      <div className="invite-layout">
        <div className="invite-preview">
          {preview ? <img src={preview} alt="Invitation preview" /> : <div className="invite-blank">Drawing…</div>}
        </div>
        <div className="stack">
          <Field label="Style">
            <select className="select" value={style} onChange={(e) => { const s = e.target.value as InvitationStyle; setStyle(s); setHeadline(INVITATION_STYLES.find((x) => x.id === s)!.headline); }}>
              {INVITATION_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Small line"><input className="input" value={headline} onChange={(e) => setHeadline(e.target.value)} /></Field>
          <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Message" hint="A sentence or two"><textarea className="textarea" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
          <Field label="From" hint="“With love, the Varghese family” or the church"><input className="input" value={host} onChange={(e) => setHost(e.target.value)} /></Field>
          <Field label="QR code">
            <Segmented value={withQr ? 'yes' : 'no'} onChange={(v) => setWithQr(v === 'yes')} options={[{ value: 'yes', label: 'Scan to RSVP' }, { value: 'no', label: 'None' }]} />
          </Field>
          <p className="small muted">{date} · {time}{event.location ? ` · ${event.location}` : ''}. Change these on the event itself.</p>
        </div>
      </div>
    </Modal>
  );
}
