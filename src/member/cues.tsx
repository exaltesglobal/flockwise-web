// Cue pad for the worship leader. Big buttons ("Repeat chorus", "Key up", "Ending") that flash on
// the band view and the stage display for 20 seconds, plus "Go to <section>" for the song on the
// screen. Opened from Serving on the day of the service.
import { ArrowLeft, Radio, Send, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';

import { MemberApi } from '@/api/endpoints';
import type { WorshipCueKind } from '@/core/types';
import { ErrorState, FormError, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { useAction, useApi } from '@/lib/use-api';

import './cues.css';

const KINDS: Exclude<WorshipCueKind, 'custom'>[] = ['chorus', 'again', 'bridge', 'verse', 'keyup', 'softer', 'build', 'instrumental', 'end', 'stop', 'next'];

export function MemberCuesPage() {
  const { eventId = '' } = useParams();
  const { t } = useT();
  const pad = useApi(() => MemberApi.cues.get(eventId), [eventId]);
  const { reload } = pad;
  const [text, setText] = useState('');
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') void reload(); }, 4000);
    return () => clearInterval(id);
  }, [reload]);
  const send = useAction(async (body: { kind: WorshipCueKind; text?: string } | { clear: true }) => {
    pad.setData(await MemberApi.cues.send(eventId, body));
    try { navigator.vibrate?.(40); } catch { /* not on this phone */ }
  });
  const custom = (e: FormEvent) => { e.preventDefault(); if (text.trim()) void send.run({ kind: 'custom', text: text.trim() }).then((ok) => { if (ok) setText(''); }); };

  if (pad.error && !pad.data) return <ErrorState error={pad.error} onRetry={reload} />;
  if (!pad.data) return <Loading />;
  const d = pad.data;
  return (
    <div className="cues stack">
      <div>
        <Link to="/app/serving" className="small muted row" style={{ gap: 4 }}><ArrowLeft size={14} /> {d.event.title}</Link>
        <h1>{t('cuesTitle')}</h1>
        <p className="muted small">{t('cuesIntro')}</p>
      </div>
      <div className="card card-pad row" style={{ gap: 10 }}>
        <Radio size={18} />
        <span className="grow">
          <span className="eyebrow">{t('cuesOnScreen')}</span>
          <b style={{ display: 'block' }}>{d.item ? `${d.item.title}${d.item.key ? ` · ${d.item.key}` : ''}` : t('cuesNothing')}</b>
        </span>
      </div>
      {d.cue && (
        <div className={`cues-live k-${d.cue.kind}`} role="status">
          <span className="grow"><span className="small">{t('cuesShowing')}</span><b>{d.cue.text}</b></span>
          <button className="btn sm" onClick={() => void send.run({ clear: true })}><X size={14} /> {t('cuesClear')}</button>
        </div>
      )}
      <FormError error={send.error} />
      <div className="cues-grid">
        {KINDS.map((k) => (
          <button key={k} className={`cues-btn k-${k} ${d.cue?.kind === k ? 'on' : ''}`} disabled={send.busy} onClick={() => void send.run({ kind: k })}>{t(`cue_${k}`)}</button>
        ))}
      </div>
      {d.item && d.item.sections.length > 0 && (
        <div className="cues-sections">
          {d.item.sections.map((s) => (
            <button key={s} className="btn" disabled={send.busy} onClick={() => void send.run({ kind: 'custom', text: `Go to ${s}` })}>{t('cuesGoTo', { label: s })}</button>
          ))}
        </div>
      )}
      <form className="row" style={{ gap: 6 }} onSubmit={custom}>
        <input className="input grow" value={text} onChange={(e) => setText(e.target.value)} maxLength={40} placeholder={t('cuesCustom')} aria-label={t('cuesCustom')} />
        <button className="btn primary" disabled={send.busy || !text.trim()}><Send size={15} /> {t('cuesSend')}</button>
      </form>
    </div>
  );
}
