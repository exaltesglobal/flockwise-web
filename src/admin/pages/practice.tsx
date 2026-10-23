// Choir practice: who came to each rehearsal and what was sung, with the attendance of every
// singer over the last practices; and part recordings (soprano, alto, tenor, bass…) put on songs
// so singers can learn their line at home. The parts show in the musicians' view and the app.
import { Download, ExternalLink, MicVocal, Music2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { PracticeSong, PracticeView, PracticesHub, SongPartName, SongView } from '@/api/admin-types';
import { AdminApi, type PracticeInput } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { downloadCsv, formatDate, formatTime } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const PART_LABEL: Record<SongPartName, string> = { soprano: 'Soprano', alto: 'Alto', tenor: 'Tenor', bass: 'Bass', melody: 'Melody', harmony: 'Harmony', instrumental: 'Instrumental', full: 'Whole song' };
const toLocalInput = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
const when = (iso: string) => `${formatDate(iso)}, ${formatTime(iso)}`;

export function PracticePage() {
  const toast = useToast();
  const canEdit = useCan()('services', 'volunteers');
  const [teamId, setTeamId] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<'practices' | 'members' | 'parts'>('practices');
  const { data, error, reload } = useApi(() => AdminApi.practices.hub(teamId), [teamId]);
  const [recording, setRecording] = useState<PracticeView | 'new' | null>(null);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const team = data.teams.find((t) => t.id === data.teamId);
  const next = data.nextRehearsal;
  return (
    <>
      <PageHeader title="Choir practice" subtitle="Tick who came to each rehearsal and what was sung, see who is slipping away, and put part recordings (soprano, alto, tenor, bass) on songs so singers learn their line at home. The team gets a nudge the evening before a rehearsal."
        actions={canEdit && team && <button className="btn primary" onClick={() => setRecording('new')}><Plus size={16} /> Record a practice</button>} />
      <div className="row between wrap" style={{ gap: 10 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <select className="input" style={{ width: 'auto' }} value={data.teamId ?? ''} onChange={(e) => setTeamId(e.target.value)} aria-label="Team">
            {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.roster})</option>)}
          </select>
          <Segmented value={tab} onChange={setTab} options={[{ value: 'practices', label: 'Practices' }, { value: 'members', label: 'Attendance' }, { value: 'parts', label: 'Part recordings' }]} />
        </div>
      </div>
      {next && (
        <div className="card card-pad stack" style={{ gap: 6 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <b>Next rehearsal: {when(next.at)}</b>
            <span className="small muted">for {next.eventTitle}</span>
          </div>
          {next.notes && <p className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{next.notes}</p>}
          <div className="row wrap small" style={{ gap: 6 }}>
            {next.songs.length === 0 ? <span className="muted">No songs on the plan yet.</span> : next.songs.map((s) => <span key={s.id} className={`badge ${s.parts.length ? 'ok' : 'gray'}`}>{s.title}{s.key ? ` · ${s.key}` : ''}{s.parts.length ? ' ♪' : ''}</span>)}
          </div>
          <span className="small muted">Set the rehearsal time and notes on the service plan. ♪ = has part recordings.</span>
        </div>
      )}
      {tab === 'practices' && (
        <div className="card">
          {data.practices.length === 0 ? <Empty icon={<MicVocal size={26} />} title="No practice recorded yet" body="After Thursday's rehearsal, record who came and what you sang. Two weeks in you will see who needs a call." action={canEdit && team ? <button className="btn primary" onClick={() => setRecording('new')}><Plus size={16} /> Record a practice</button> : undefined} /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>When</th><th>For</th><th className="num">Came</th><th>Songs</th><th>Notes</th></tr></thead>
              <tbody>{data.practices.map((x) => (
                <tr key={x.id} className={canEdit ? 'clickable' : ''} onClick={() => canEdit && setRecording(x)}>
                  <td><b>{formatDate(x.at)}</b><div className="small muted">{formatTime(x.at)} · {x.minutes} min</div></td>
                  <td className="small">{x.eventTitle ?? '—'}</td>
                  <td className="num"><b>{x.present}</b> <span className="small muted">of {x.roster}</span></td>
                  <td className="small">{x.songs.map((s) => s.title).join(', ') || '—'}</td>
                  <td className="small muted">{x.notes}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}
      {tab === 'members' && (
        <div className="card">
          <div className="row between wrap card-pad" style={{ gap: 8, paddingBottom: 0 }}>
            <span className="small muted">Over the last {Math.min(12, data.practices.length)} practice{data.practices.length === 1 ? '' : 's'}. Those who have missed the most sort first.</span>
            <button className="btn sm" onClick={() => downloadCsv(`${team?.name ?? 'team'}-practice-attendance.csv`, [['Name', 'Parts', 'Present', 'Of', 'Missed in a row', 'Last came'], ...data.members.map((m) => [m.name, m.positions.join(' / '), m.present, m.total, m.missedInARow, m.lastAt ? formatDate(m.lastAt) : ''])])}><Download size={14} /> CSV</button>
          </div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Singer</th><th>Parts</th><th className="num">Came</th><th>Missed in a row</th><th>Last came</th></tr></thead>
            <tbody>{data.members.map((m) => (
              <tr key={m.personId}>
                <td><b>{m.name}</b></td>
                <td className="small">{m.positions.join(', ')}</td>
                <td className="num">{m.present} <span className="small muted">of {m.total}</span></td>
                <td>{m.missedInARow >= 3 ? <span className="badge danger">{m.missedInARow}: give them a call</span> : m.missedInARow === 2 ? <span className="badge warn">2</span> : m.missedInARow === 1 ? <span className="badge gray">1</span> : <span className="small muted">—</span>}</td>
                <td className="small">{m.lastAt ? formatDate(m.lastAt) : <span className="muted">never</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
      {tab === 'parts' && <Parts songs={data.songsWithParts} next={next} parts={data.parts} canEdit={canEdit} onChanged={reload} />}
      {recording && team && <RecordPractice teamId={team.id} teamName={team.name} roster={data.members} existing={recording === 'new' ? null : recording} next={next} onClose={() => setRecording(null)} onSaved={() => { setRecording(null); toast('Practice recorded'); reload(); }} />}
    </>
  );
}

function RecordPractice({ teamId, teamName, roster, existing, next, onClose, onSaved }: { teamId: string; teamName: string; roster: PracticesHub['members']; existing: PracticeView | null; next: PracticesHub['nextRehearsal']; onClose: () => void; onSaved: () => void }) {
  const [at, setAt] = useState(toLocalInput(existing?.at ?? (next && Date.parse(next.at) < Date.now() + 86_400_000 ? next.at : new Date().toISOString())));
  const [minutes, setMinutes] = useState(String(existing?.minutes ?? 90));
  const [eventId, setEventId] = useState<string>(existing?.eventId ?? next?.eventId ?? '');
  const [present, setPresent] = useState<Set<string>>(new Set(existing?.presentIds ?? []));
  const [songIds, setSongIds] = useState<Set<string>>(new Set(existing?.songIds ?? (next?.songs ?? []).map((s) => s.id)));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const songs = useMemo(() => { const m = new Map<string, PracticeSong>(); for (const s of [...(next?.songs ?? []), ...(existing?.songs ?? [])]) m.set(s.id, s); return [...m.values()]; }, [next, existing]);
  const input = (): PracticeInput => ({ at: new Date(at).toISOString(), minutes: Number(minutes) || 0, eventId: eventId || null, presentIds: [...present], songIds: [...songIds], notes });
  const save = useAction(() => (existing ? AdminApi.practices.update(existing.id, input()) : AdminApi.practices.create({ teamId, ...input() })));
  const remove = useAction(() => AdminApi.practices.remove(existing!.id));
  const toggle = (id: string) => setPresent((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const sorted = [...roster].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Modal side wide title={existing ? `${teamName} practice, ${formatDate(existing.at)}` : `Record a ${teamName} practice`} onClose={onClose}
      footer={<>{existing && <button className="btn danger" disabled={remove.busy} onClick={async () => { if (await remove.run()) onSaved(); }}><Trash2 size={14} /> Remove</button>}<span className="grow" /><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy} onClick={async () => { if (await save.run()) onSaved(); }}>{existing ? 'Save' : 'Record'}</button></>}>
      <div className="stack">
        <FormError error={save.error ?? remove.error} />
        <div className="grid cols-3">
          <Field label="When"><input className="input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
          <Field label="Minutes"><input className="input" type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>
          <Field label="For the service"><select className="input" value={eventId} onChange={(e) => setEventId(e.target.value)}><option value="">Not tied to a service</option>{next && <option value={next.eventId}>{next.eventTitle}</option>}{existing?.eventId && existing.eventId !== next?.eventId && <option value={existing.eventId}>{existing.eventTitle}</option>}</select></Field>
        </div>
        <div className="row between wrap" style={{ gap: 8 }}>
          <b>Who came <span className="muted small">({present.size} of {sorted.length})</span></b>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm" onClick={() => setPresent(new Set(sorted.map((m) => m.personId)))}>All</button>
            <button className="btn sm" onClick={() => setPresent(new Set())}>None</button>
          </div>
        </div>
        <div className="grid cols-2" style={{ gap: 4 }}>
          {sorted.map((m) => (
            <label key={m.personId} className={`row card ${present.has(m.personId) ? 'picked' : ''}`} style={{ gap: 8, padding: '8px 10px', cursor: 'pointer', borderColor: present.has(m.personId) ? 'var(--primary)' : undefined }}>
              <input type="checkbox" checked={present.has(m.personId)} onChange={() => toggle(m.personId)} />
              <span style={{ minWidth: 0 }}><span className="ellipsis">{m.name}</span>{m.positions.length > 0 && <span className="small muted"> · {m.positions.join(', ')}</span>}</span>
            </label>
          ))}
        </div>
        {songs.length > 0 && (
          <>
            <b>Songs practised</b>
            <div className="row wrap" style={{ gap: 6 }}>
              {songs.map((s) => <button key={s.id} className={`btn sm ${songIds.has(s.id) ? 'primary' : ''}`} onClick={() => setSongIds((p) => { const n = new Set(p); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}><Music2 size={13} /> {s.title}{s.key ? ` · ${s.key}` : ''}</button>)}
            </div>
          </>
        )}
        <Field label="Notes"><textarea className="input" rows={3} placeholder="What needs work, who sang which part…" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function Parts({ songs, next, parts, canEdit, onChanged }: { songs: PracticeSong[]; next: PracticesHub['nextRehearsal']; parts: SongPartName[]; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<{ id: string; title: string } | null>(null);
  const [part, setPart] = useState<SongPartName>('soprano');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const { data: hits } = useApi(() => (q.trim().length >= 2 ? AdminApi.services.songs(q.trim()) : Promise.resolve([] as SongView[])), [q]);
  const add = useAction(() => AdminApi.practices.addPart(picked!.id, { part, url, name: name || undefined }));
  const removePart = useAction((songId: string, partId: string) => AdminApi.practices.removePart(songId, partId));
  const list = useMemo(() => { const m = new Map<string, PracticeSong>(); for (const s of [...(next?.songs ?? []), ...songs]) m.set(s.id, s); return [...m.values()]; }, [songs, next]);
  useEffect(() => { if (!picked && next?.songs[0]) setPicked({ id: next.songs[0].id, title: next.songs[0].title }); }, [next, picked]);
  return (
    <div className="stack">
      {canEdit && (
        <div className="card card-pad stack" style={{ gap: 10 }}>
          <b>Add a part recording</b>
          <p className="small muted">Record each voice on a phone, upload it to Drive or YouTube (unlisted) or the media library, and paste the link. Singers tap it in the app and in the musicians' view.</p>
          <FormError error={add.error} />
          <div className="grid cols-2">
            <Field label="Song">
              {picked ? <div className="row" style={{ gap: 8 }}><span className="badge">{picked.title}</span><button className="link-btn small" onClick={() => setPicked(null)}>change</button></div> : (
                <div className="stack" style={{ gap: 4 }}>
                  <input className="input" placeholder="Search the song library" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
                  {(hits ?? []).slice(0, 6).map((s) => <button key={s.id} className="btn sm" style={{ justifyContent: 'flex-start' }} onClick={() => { setPicked({ id: s.id, title: s.title }); setQ(''); }}>{s.title}{s.defaultKey ? ` · ${s.defaultKey}` : ''}</button>)}
                </div>
              )}
            </Field>
            <Field label="Part"><select className="input" value={part} onChange={(e) => setPart(e.target.value as SongPartName)}>{parts.map((p) => <option key={p} value={p}>{PART_LABEL[p]}</option>)}</select></Field>
          </div>
          <div className="grid cols-2">
            <Field label="Link to the recording"><input className="input" placeholder="https://drive.google.com/… or https://youtu.be/…" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
            <Field label="Label (optional)"><input className="input" placeholder={`${PART_LABEL[part]} (Mary, slow)`} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          </div>
          <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={!picked || !url.trim() || add.busy} onClick={async () => { if (await add.run()) { toast('Recording added'); setUrl(''); setName(''); onChanged(); } }}><Plus size={16} /> Add recording</button>
        </div>
      )}
      <div className="card">
        {list.length === 0 ? <Empty icon={<Music2 size={26} />} title="No part recordings yet" body="Add the first one above. The songs on the next service plan are the best place to start." /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Song</th><th>Recordings</th></tr></thead>
            <tbody>{list.map((s) => (
              <tr key={s.id}>
                <td><b>{s.title}</b><div className="small muted">{[s.author, s.key].filter(Boolean).join(' · ')}{next?.songs.some((n) => n.id === s.id) ? ' · next service' : ''}</div></td>
                <td>
                  {s.parts.length === 0 ? <span className="small muted">None yet</span> : (
                    <div className="row wrap" style={{ gap: 6 }}>
                      {s.parts.map((p) => (
                        <span key={p.id} className="row" style={{ gap: 2 }}>
                          <a href={p.url} target="_blank" rel="noreferrer" className="btn sm"><ExternalLink size={12} /> {p.name}</a>
                          {canEdit && <button className="btn sm icon" title="Remove" disabled={removePart.busy} onClick={async () => { if (await removePart.run(s.id, p.id)) onChanged(); }}><Trash2 size={12} /></button>}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
