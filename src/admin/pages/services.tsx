import { ArrowDown, ArrowUp, ClipboardList, Copy, Music, Pencil, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { PlanItem, PlanItemKind, ServiceDetail, Song, SongView } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDay, formatRelative, formatTime } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { printHtml } from '@/lib/print';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const KINDS: { value: PlanItemKind; label: string }[] = [
  { value: 'song', label: 'Song' },
  { value: 'reading', label: 'Scripture reading' },
  { value: 'sermon', label: 'Sermon' },
  { value: 'prayer', label: 'Prayer' },
  { value: 'announcement', label: 'Announcements' },
  { value: 'offering', label: 'Offering' },
  { value: 'video', label: 'Video' },
  { value: 'other', label: 'Other' },
];
const kindLabel = (k: PlanItemKind) => KINDS.find((x) => x.value === k)?.label ?? k;

type Draft = Partial<PlanItem> & { key_: string };
let seq = 0;
const draftKey = () => `d${++seq}`;

export function ServicesPage() {
  const [tab, setTab] = useState<'plans' | 'songs'>('plans');
  return (
    <>
      <PageHeader title="Service planning" subtitle="Order of service, songs and keys, timings and who is serving. Volunteers see the plan in the app once they accept." />
      <div className="tabs">
        <button className={tab === 'plans' ? 'on' : ''} onClick={() => setTab('plans')}>Plans</button>
        <button className={tab === 'songs' ? 'on' : ''} onClick={() => setTab('songs')}>Song library</button>
      </div>
      {tab === 'plans' ? <Plans /> : <Songs />}
    </>
  );
}

function Plans() {
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const list = useApi(() => AdminApi.services.list(when), [when]);
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected ?? list.data?.[0]?.event.id ?? null;
  return (
    <div className="split">
      <div className="card side-list">
        <div className="toolbar"><Segmented value={when} onChange={(v) => { setWhen(v); setSelected(null); }} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} /></div>
        {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : list.data.length === 0 ? <Empty icon={<ClipboardList size={28} />} title="No services" /> : list.data.map((s) => (
          <div key={s.event.id} className={`list-row ${s.event.id === current ? 'on' : ''}`} onClick={() => setSelected(s.event.id)}>
            <div className="date-chip"><b>{new Date(s.event.startsAt).getDate()}</b><small>{new Date(s.event.startsAt).toLocaleDateString('en-IN', { month: 'short' })}</small></div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="ellipsis" style={{ fontWeight: 600 }}>{s.event.title}</div>
              <div className="small muted ellipsis">{s.items ? `${s.items} items · ${s.minutes} min${s.theme ? ` · ${s.theme}` : ''}` : 'No plan yet'}</div>
              <div className="small muted">{s.volunteers.filled}/{s.volunteers.needed} volunteers</div>
            </div>
          </div>
        ))}
      </div>
      {current && <PlanEditor key={current} eventId={current} onSaved={list.reload} />}
    </div>
  );
}

function PlanEditor({ eventId, onSaved }: { eventId: string; onSaved: () => void }) {
  const detail = useApi(() => AdminApi.services.get(eventId), [eventId]);
  const songs = useApi(() => AdminApi.services.songs());
  const past = useApi(() => AdminApi.services.list('past'));
  const [theme, setTheme] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Draft[]>([]);
  const [dirty, setDirty] = useState(false);
  const save = useAction(() => AdminApi.services.save(eventId, { theme, notes, items: items.map(({ key_: _k, ...i }) => i) }));
  const toast = useToast();
  const can = useCan();
  const editable = can('services');

  useEffect(() => {
    if (!detail.data) return;
    setTheme(detail.data.plan.theme);
    setNotes(detail.data.plan.notes);
    setItems(detail.data.plan.items.map((i) => ({ ...i, key_: draftKey() })));
    setDirty(false);
  }, [detail.data]);

  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />;
  if (!detail.data) return <Loading />;
  const ev = detail.data.event;
  const start = new Date(ev.startsAt).getTime();
  let clock = start;
  const total = items.reduce((s, i) => s + (i.minutes ?? 0), 0);
  const endMin = Math.round((new Date(ev.endsAt).getTime() - start) / 60000);

  const update = (k: string, patch: Partial<PlanItem>) => { setItems((xs) => xs.map((x) => (x.key_ === k ? { ...x, ...patch } : x))); setDirty(true); };
  const move = (i: number, d: -1 | 1) => { const xs = [...items]; [xs[i], xs[i + d]] = [xs[i + d], xs[i]]; setItems(xs); setDirty(true); };
  const add = (kind: PlanItemKind) => { setItems([...items, { key_: draftKey(), kind, title: kind === 'song' ? '' : kindLabel(kind), minutes: kind === 'sermon' ? 35 : kind === 'song' ? 5 : 3, notes: '', person: '', songId: null, key: null }]); setDirty(true); };

  return (
    <div className="stack">
      <div className="card card-pad row wrap between">
        <div>
          <h2>{ev.title}</h2>
          <div className="small muted">{formatDay(ev.startsAt)} · {formatTime(ev.startsAt)} · planned {total} of {endMin} min{total > endMin ? <span className="badge danger" style={{ marginLeft: 6 }}>{total - endMin} min over</span> : null}</div>
        </div>
        <div className="row wrap">
          {editable && past.data && past.data.some((p) => p.items) && (
            <select className="select" style={{ width: 210 }} value="" onChange={async (e) => {
              if (!e.target.value) return;
              if (items.length && !confirm('Replace this plan with a copy?')) return;
              await AdminApi.services.copy(eventId, e.target.value);
              toast('Plan copied');
              detail.reload();
              onSaved();
            }}>
              <option value="">Copy from a past service…</option>
              {past.data.filter((p) => p.items).map((p) => <option key={p.event.id} value={p.event.id}>{formatDay(p.event.startsAt)} · {p.event.title}</option>)}
            </select>
          )}
          <button className="btn" onClick={() => printPlan(detail.data!, theme, notes, items)}><Printer size={15} /> Print</button>
          {editable && <button className="btn primary" disabled={!dirty || save.busy} onClick={async () => { if (await save.run()) { toast('Plan saved'); setDirty(false); onSaved(); } }}>{save.busy ? 'Saving…' : 'Save plan'}</button>}
        </div>
      </div>
      <FormError error={save.error} />
      <div className="plan-grid">
        <div className="stack">
          <div className="card card-pad grid cols-2">
            <Field label="Theme or sermon series"><input className="input" disabled={!editable} value={theme} onChange={(e) => { setTheme(e.target.value); setDirty(true); }} placeholder="The Good Shepherd · John 10" /></Field>
            <Field label="Notes for the team"><input className="input" disabled={!editable} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} placeholder="Communion this week" /></Field>
          </div>
          <div className="card">
            {items.length === 0 && <Empty icon={<ClipboardList size={28} />} title="Empty plan" body="Add songs, readings and the sermon below, or copy last week's plan." />}
            {items.map((it, i) => {
              const at = clock;
              clock += (it.minutes ?? 0) * 60000;
              return (
                <div key={it.key_} className="list-row" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 54, flexShrink: 0, paddingTop: 9 }} className="small muted mono">{new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</div>
                  <div className="grow stack" style={{ gap: 6 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <select className="select" disabled={!editable} style={{ width: 150 }} value={it.kind} onChange={(e) => update(it.key_, { kind: e.target.value as PlanItemKind })}>
                        {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                      </select>
                      {it.kind === 'song' && songs.data ? (
                        <select className="select grow" disabled={!editable} value={it.songId ?? ''} onChange={(e) => { const s = songs.data!.find((x) => x.id === e.target.value); update(it.key_, { songId: s?.id ?? null, title: s?.title ?? '', key: s?.defaultKey ?? null }); }}>
                          <option value="">Choose a song…</option>
                          {songs.data.map((s) => <option key={s.id} value={s.id}>{s.title}{s.author ? ` · ${s.author}` : ''}</option>)}
                        </select>
                      ) : (
                        <input className="input grow" disabled={!editable} value={it.title ?? ''} onChange={(e) => update(it.key_, { title: e.target.value })} />
                      )}
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      {it.kind === 'song' && <input className="input" disabled={!editable} style={{ width: 70 }} value={it.key ?? ''} onChange={(e) => update(it.key_, { key: e.target.value })} placeholder="Key" title="Key" />}
                      <input className="input" disabled={!editable} style={{ width: 160 }} value={it.person ?? ''} onChange={(e) => update(it.key_, { person: e.target.value })} placeholder="Who" />
                      <input className="input grow" disabled={!editable} value={it.notes ?? ''} onChange={(e) => update(it.key_, { notes: e.target.value })} placeholder="Notes" />
                      <div className="row" style={{ gap: 2 }}><input className="input" disabled={!editable} style={{ width: 64 }} type="number" min={0} value={it.minutes ?? 0} onChange={(e) => update(it.key_, { minutes: Number(e.target.value) })} /><span className="small muted">min</span></div>
                    </div>
                  </div>
                  {editable && (
                    <div className="stack" style={{ gap: 0 }}>
                      <button className="btn ghost icon sm" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
                      <button className="btn ghost icon sm" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
                      <button className="btn ghost icon sm danger" onClick={() => { setItems(items.filter((x) => x.key_ !== it.key_)); setDirty(true); }}><X size={14} /></button>
                    </div>
                  )}
                </div>
              );
            })}
            {editable && (
              <div className="list-row row wrap" style={{ gap: 6 }}>
                <span className="small muted">Add:</span>
                {KINDS.map((k) => <button key={k.value} className="btn sm" onClick={() => add(k.value)}><Plus size={13} /> {k.label}</button>)}
              </div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Serving</h2></div>
          {detail.data.team.length === 0 ? <p className="card-body small muted">No one scheduled yet. Use Volunteers to build the rota.</p> : detail.data.team.map((t, i) => (
            <div key={i} className="list-row small">
              <div className="grow"><b>{t.name}</b><div className="muted">{t.teamName} · {t.positionName}</div></div>
              {t.status === 'pending' && <span className="badge warn">Asked</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function printPlan(d: ServiceDetail, theme: string, notes: string, items: Draft[]) {
  const esc = (v: string) => v.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  let t = new Date(d.event.startsAt).getTime();
  const rows = items.map((i) => {
    const at = new Date(t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    t += (i.minutes ?? 0) * 60000;
    return `<tr><td>${at}</td><td><b>${esc(i.title ?? '')}</b>${i.key ? ` <span class="muted">(${esc(i.key)})</span>` : ''}<div class="muted">${esc(kindLabel(i.kind!))}${i.notes ? ` · ${esc(i.notes)}` : ''}</div></td><td>${esc(i.person ?? '')}</td><td class="num">${i.minutes ?? 0}′</td></tr>`;
  });
  printHtml(`Plan ${d.event.title}`, `<h1>${esc(d.event.title)}</h1><div class="muted">${esc(formatDay(d.event.startsAt))} · ${esc(formatTime(d.event.startsAt))}${theme ? ` · ${esc(theme)}` : ''}</div>${notes ? `<p>${esc(notes)}</p>` : ''}
    <table><thead><tr><th>Time</th><th>Item</th><th>Who</th><th class="num">Min</th></tr></thead><tbody>${rows.join('')}</tbody></table>
    <h2>Team</h2><table><tbody>${d.team.map((m) => `<tr><td>${esc(m.teamName)} · ${esc(m.positionName)}</td><td>${esc(m.name)}</td></tr>`).join('')}</tbody></table>`);
}

function Songs() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 200); return () => clearTimeout(t); }, [q]);
  const list = useApi(() => AdminApi.services.songs(debounced), [debounced]);
  const [editing, setEditing] = useState<SongView | 'new' | null>(null);
  const [viewing, setViewing] = useState<SongView | null>(null);
  const toast = useToast();
  const can = useCan();
  return (
    <div className="card">
      <div className="toolbar">
        <div className="search"><Search size={16} /><input className="input" placeholder="Search title, author or tag" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="grow" />
        {can('services') && <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> Add song</button>}
      </div>
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : list.data.length === 0 ? <Empty icon={<Music size={28} />} title="No songs" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Title</th><th>Key</th><th>BPM</th><th>Tags</th><th className="num">Used</th><th>Last used</th><th /></tr></thead>
            <tbody>
              {list.data.map((s) => (
                <tr key={s.id} className="clickable" onClick={() => setViewing(s)}>
                  <td><b>{s.title}</b><div className="small muted">{s.author}{s.ccli ? ` · CCLI ${s.ccli}` : ''}</div></td>
                  <td className="mono">{s.defaultKey}</td>
                  <td className="small">{s.bpm ?? '—'}</td>
                  <td className="small">{s.tags.map((t) => <span key={t} className="badge gray" style={{ marginRight: 4 }}>{t}</span>)}</td>
                  <td className="num">{s.timesUsed}</td>
                  <td className="small muted">{s.lastUsedAt ? formatRelative(s.lastUsedAt) : 'Never'}</td>
                  <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                    {can('services') && <>
                      <button className="btn ghost icon sm" onClick={() => setEditing(s)}><Pencil size={15} /></button>
                      <button className="btn ghost icon sm danger" onClick={async () => { if (!confirm(`Delete ${s.title}?`)) return; await AdminApi.services.removeSong(s.id); toast('Deleted'); list.reload(); }}><Trash2 size={15} /></button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <SongForm song={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); toast('Saved'); }} />}
      {viewing && (
        <Modal title={viewing.title} onClose={() => setViewing(null)} footer={<button className="btn" onClick={() => { navigator.clipboard?.writeText(viewing.lyrics); toast('Lyrics copied'); }}><Copy size={15} /> Copy lyrics</button>}>
          <p className="small muted">{viewing.author} · Key {viewing.defaultKey}{viewing.bpm ? ` · ${viewing.bpm} bpm` : ''}</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 15, marginTop: 12 }}>{viewing.lyrics || 'No lyrics saved.'}</pre>
        </Modal>
      )}
    </div>
  );
}

function SongForm({ song, onClose, onSaved }: { song: Song | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Omit<Song, 'id'>>({ title: song?.title ?? '', author: song?.author ?? '', defaultKey: song?.defaultKey ?? '', bpm: song?.bpm ?? null, ccli: song?.ccli ?? '', tags: song?.tags ?? [], lyrics: song?.lyrics ?? '' });
  const [tags, setTags] = useState((song?.tags ?? []).join(', '));
  const save = useAction(() => {
    const input = { ...form, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) };
    return song ? AdminApi.services.updateSong(song.id, input) : AdminApi.services.createSong(input);
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal title={song ? 'Edit song' : 'Add a song'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !form.title.trim()} onClick={async () => { if (await save.run()) onSaved(); }}>Save</button></>}
    >
      <div className="stack">
        <FormError error={save.error} />
        <div className="grid cols-2">
          <Field label="Title"><input className="input" autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="Author"><input className="input" value={form.author} onChange={(e) => set('author', e.target.value)} /></Field>
          <Field label="Default key"><input className="input" value={form.defaultKey} onChange={(e) => set('defaultKey', e.target.value)} placeholder="G" /></Field>
          <Field label="BPM"><input className="input" type="number" value={form.bpm ?? ''} onChange={(e) => set('bpm', e.target.value ? Number(e.target.value) : null)} /></Field>
          <Field label="CCLI number"><input className="input" value={form.ccli} onChange={(e) => set('ccli', e.target.value)} /></Field>
          <Field label="Tags" hint="e.g. Telugu, Opening, Communion"><input className="input" value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
        </div>
        <Field label="Lyrics or chord chart"><textarea className="textarea" style={{ minHeight: 200 }} value={form.lyrics} onChange={(e) => set('lyrics', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
