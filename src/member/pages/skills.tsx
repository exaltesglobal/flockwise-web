// Skills & board from the member's side: what I can do (and whether the church may ask me), the
// members who chose to list their skills, and the board of job openings, needs and offers.
import { Phone, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { MemberApi } from '@/api/endpoints';
import type { BoardKind, MySkills } from '@/core/types';
import { ErrorState, FormError, Loading, useToast } from '@/components/ui';
import { useT, type StringKey } from '@/i18n';
import { useAction, useApi } from '@/lib/use-api';

const KIND_KEY: Record<BoardKind, StringKey> = { job: 'skillJob', need: 'skillNeed', offer: 'skillOffer' };
const tel = (p: string) => `tel:${p.replace(/\s/g, '')}`;

export function MemberSkillsPage() {
  const { t } = useT();
  const { data, error, reload, setData } = useApi(MemberApi.skills.get);
  const [tab, setTab] = useState<'board' | 'people' | 'mine'>('board');
  return (
    <>
      <div>
        <h1>{t('skillTitle')}</h1>
        <p className="muted">{t('skillBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : (
        <div className="stack">
          <div className="sk-tabs" role="tablist">
            {(['board', 'people', 'mine'] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(k === 'board' ? 'skillTabBoard' : k === 'people' ? 'skillTabPeople' : 'skillTabMine')}</button>)}
          </div>
          {tab === 'board' ? <Board data={data} onData={setData} /> : tab === 'people' ? <Directory data={data} /> : <Mine data={data} onData={setData} />}
        </div>
      )}
    </>
  );
}

function Board({ data, onData }: { data: MySkills; onData: (d: MySkills) => void }) {
  const { t } = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<BoardKind>('need');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [place, setPlace] = useState('');
  const post = useAction(async (e: FormEvent) => { e.preventDefault(); onData(await MemberApi.skills.post({ kind, title, body, place })); setOpen(false); setTitle(''); setBody(''); setPlace(''); toast(t('skillPosted')); });
  const close = useAction(async (id: string) => onData(await MemberApi.skills.close(id)));
  return (
    <div className="stack">
      {open ? (
        <form className="card card-pad stack" style={{ gap: 10 }} onSubmit={post.run}>
          <div className="sk-tabs">{(['job', 'need', 'offer'] as const).map((k) => <button type="button" key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{t(KIND_KEY[k])}</button>)}</div>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder={t('skillPostTitle')} required />
          <textarea className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} placeholder={t('skillPostBody')} />
          <input className="input" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={80} placeholder={t('skillPostPlace')} />
          <p className="small muted" style={{ margin: 0 }}>{t('skillPostNote')}</p>
          <FormError error={post.error} />
          <div className="row" style={{ gap: 8 }}><button className="btn primary" disabled={post.busy}>{t('skillPostSend')}</button><button type="button" className="btn ghost" onClick={() => setOpen(false)}>{t('occBack')}</button></div>
        </form>
      ) : <div><button className="btn primary" onClick={() => setOpen(true)}><Plus size={15} /> {t('skillPostNew')}</button></div>}
      <FormError error={close.error} />
      {!data.posts.length && <p className="muted small">{t('skillBoardEmpty')}</p>}
      {data.posts.map((p) => (
        <div key={p.id} className="card card-pad stack" style={{ gap: 6 }}>
          <span className="small muted">{t(KIND_KEY[p.kind])}{p.place ? ` · ${p.place}` : ''}</span>
          <b>{p.title}</b>
          {p.body && <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{p.body}</p>}
          <div className="row wrap" style={{ gap: 8, justifyContent: 'space-between' }}>
            <span className="small muted">{p.name}</span>
            {p.mine ? (p.status === 'open' && !p.expired ? <button className="btn sm ghost" onClick={() => void close.run(p.id)}><X size={14} /> {t('skillClose')}</button> : <span className="badge gray">{t('skillClosed')}</span>)
              : p.phone && <a className="btn sm" href={tel(p.phone)}><Phone size={14} /> {t('mentorCall')}</a>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Directory({ data }: { data: MySkills }) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const list = data.directory.filter((p) => !s || `${p.name} ${p.skills.join(' ')}`.toLowerCase().includes(s));
  return (
    <div className="stack" style={{ gap: 8 }}>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('skillSearch')} />
      {!list.length && <p className="muted small">{data.directory.length ? t('libraryNoMatch') : t('skillPeopleEmpty')}</p>}
      {list.map((p) => (
        <div key={p.personId} className="card card-pad row" style={{ justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <b>{p.name}</b>
            <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>{p.skills.map((x) => <span key={x} className="badge gray">{x}</span>)}</div>
            {p.note && <div className="small muted">{p.note}</div>}
          </div>
          {p.phone && <a className="btn sm ghost" href={tel(p.phone)} aria-label={t('mentorCall')}><Phone size={15} /></a>}
        </div>
      ))}
    </div>
  );
}

function Mine({ data, onData }: { data: MySkills; onData: (d: MySkills) => void }) {
  const { t } = useT();
  const toast = useToast();
  const [skills, setSkills] = useState<string[]>(data.mine?.skills ?? []);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState(data.mine?.note ?? '');
  const [serve, setServe] = useState(data.mine?.serve ?? true);
  const [share, setShare] = useState(data.mine?.share ?? false);
  const toggle = (x: string) => setSkills((s) => (s.includes(x) ? s.filter((y) => y !== x) : [...s, x].slice(0, 20)));
  const save = useAction(async () => { onData(await MemberApi.skills.save({ skills, note, serve, share })); toast(t('skillSaved')); });
  const extra = skills.filter((x) => !data.suggestions.includes(x));
  return (
    <div className="card card-pad stack" style={{ gap: 12 }}>
      <span className="small muted">{t('skillPick')}</span>
      <div className="row wrap" style={{ gap: 6 }}>
        {[...data.suggestions, ...extra].map((x) => <button key={x} type="button" className={`sk-tag ${skills.includes(x) ? 'on' : ''}`} onClick={() => toggle(x)}>{x}</button>)}
      </div>
      <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); const v = custom.trim(); if (v && !skills.includes(v)) setSkills((s) => [...s, v].slice(0, 20)); setCustom(''); }}>
        <input className="input grow" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={40} placeholder={t('skillOther')} />
        <button className="btn sm">{t('skillAdd')}</button>
      </form>
      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={t('skillNote')} />
      <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={serve} onChange={(e) => setServe(e.target.checked)} /> {t('skillServe')}</label>
      <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> {t('skillShare')}</label>
      <FormError error={save.error} />
      <div><button className="btn primary" disabled={save.busy} onClick={() => void save.run()}>{t('mentorSave')}</button></div>
    </div>
  );
}
