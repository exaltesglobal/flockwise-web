// Elections and AGM: draft a committee election or a resolution, open it for a secret ballot in the
// app, keep the roll (who has voted, never how), enter the hall's paper ballots, close, count,
// publish. The office never sees a ballot with a name on it.
import { Check, Lock, Megaphone, Pencil, Plus, Trash2, Users, Vote, X } from 'lucide-react';
import { useState } from 'react';

import type { ElectionEligibility, ElectionKind, ElectionView } from '@/api/admin-types';
import { AdminApi, type ElectionInput } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDate, formatRelative, formatTime, toLocalInput } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PersonSearch } from '../components/person-picker';
import { PageHeader } from '../layout';

const KIND: Record<ElectionKind, string> = { election: 'Election', resolution: 'Resolution' };
const ELIGIBLE: { value: ElectionEligibility; label: string; hint: string }[] = [
  { value: 'members_18', label: 'Members aged 18+', hint: 'Communicant members who are adults.' },
  { value: 'members', label: 'All members', hint: 'Every communicant member, any age.' },
  { value: 'everyone_18', label: 'All adults on the roll', hint: 'Members and regulars aged 18+. Visitors never vote.' },
];
const STATUS: Record<ElectionView['status'], { label: string; tone: string }> = { draft: { label: 'Draft', tone: 'gray' }, open: { label: 'Voting open', tone: 'ok' }, closed: { label: 'Closed', tone: 'accent' } };
const when = (iso: string) => `${formatDate(iso)}, ${formatTime(iso)}`;

export function ElectionsPage() {
  const canEdit = useCan()('settings', 'people.edit');
  const { data, error, reload } = useApi(AdminApi.elections.list);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const current = data.find((e) => e.id === open) ?? null;
  return (
    <>
      <PageHeader
        title="Elections & AGM"
        subtitle="Committee elections and AGM resolutions by secret ballot on members' phones, with the hall's paper ballots added by the returning officer."
        actions={canEdit && <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> New poll</button>}
      />
      {data.length === 0 ? (
        <div className="card"><Empty icon={<Vote size={28} />} title="No polls yet" body="Draft a committee election or an AGM resolution. Members vote in the app; nobody sees who voted for whom." action={canEdit && <button className="btn primary" onClick={() => setCreating(true)}>New poll</button>} /></div>
      ) : (
        <div className="grid cols-2">
          {data.map((e) => (
            <button key={e.id} className="card card-pad stack text-left" style={{ gap: 8, cursor: 'pointer' }} onClick={() => setOpen(e.id)}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <span className={`badge ${STATUS[e.status].tone}`}>{STATUS[e.status].label}</span>
                <span className="badge gray">{KIND[e.kind]}{e.kind === 'election' ? ` · ${e.seats} ${e.seats === 1 ? 'seat' : 'seats'}` : ''}</span>
              </div>
              <h3>{e.title}</h3>
              <div className="small muted">
                {e.status === 'open' && e.closesAt && <>Closes {when(e.closesAt)} · </>}
                {e.status === 'closed' && e.closedAt && <>Closed {formatRelative(e.closedAt)} · {e.resultsPublished ? 'result published' : 'result not yet published'} · </>}
                {e.status === 'draft' && <>{e.candidates.length} {e.kind === 'resolution' ? 'options' : 'candidates'} · </>}
                {e.turnout.eligible} eligible
              </div>
              {e.status !== 'draft' && (
                <>
                  <div className="progress"><i style={{ width: `${e.turnout.percent}%` }} /></div>
                  <span className="small muted">{e.turnout.voted} voted ({e.turnout.percent}%): {e.turnout.app} in the app, {e.turnout.paper} on paper</span>
                </>
              )}
              {e.results && <span className="small">{e.kind === 'resolution' ? (e.results.tie ? 'Tied' : e.results.passed ? 'Carried' : 'Not carried') : `Elected: ${e.results.rows.filter((r) => r.elected).map((r) => r.name).join(', ') || '—'}`}{e.results.tie && e.kind === 'election' ? ' · tie at the line' : ''}</span>}
            </button>
          ))}
        </div>
      )}
      {current && <Detail e={current} canEdit={canEdit} onClose={() => setOpen(null)} onChange={reload} />}
      {creating && <PollForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
    </>
  );
}

function Detail({ e, canEdit, onClose, onChange }: { e: ElectionView; canEdit: boolean; onClose: () => void; onChange: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [roll, setRoll] = useState(false);
  const [opening, setOpening] = useState(false);
  const [closesAt, setClosesAt] = useState(e.closesAt ? toLocalInput(e.closesAt) : '');
  const [paper, setPaper] = useState<Record<string, string>>(Object.fromEntries(e.candidates.map((c) => [c.id, String(e.paperVotes[c.id] ?? '')])));
  const [invalid, setInvalid] = useState(String(e.paperInvalid || ''));
  const act = useAction(async (what: 'open' | 'close' | 'publish' | 'paper' | 'remove') => {
    if (what === 'open') return AdminApi.elections.open(e.id, new Date(closesAt).toISOString());
    if (what === 'close') return AdminApi.elections.close(e.id);
    if (what === 'publish') return AdminApi.elections.publish(e.id);
    if (what === 'remove') return AdminApi.elections.remove(e.id);
    return AdminApi.elections.paper(e.id, Object.fromEntries(Object.entries(paper).map(([k, v]) => [k, Number(v) || 0])), Number(invalid) || 0);
  });
  const run = async (what: Parameters<typeof act.run>[0], msg: string, close = false) => { if (await act.run(what)) { toast(msg); onChange(); if (close) onClose(); } };
  const res = e.results;
  const max = res ? Math.max(1, ...res.rows.map((r) => r.votes)) : 1;
  return (
    <Modal side title={e.title} onClose={onClose}>
      <div className="stack" style={{ gap: 14 }}>
        <div className="row wrap" style={{ gap: 6 }}>
          <span className={`badge ${STATUS[e.status].tone}`}>{STATUS[e.status].label}</span>
          <span className="badge gray">{KIND[e.kind]}{e.kind === 'election' ? ` · ${e.seats} ${e.seats === 1 ? 'seat' : 'seats'}` : ''}</span>
          <span className="badge gray">{ELIGIBLE.find((x) => x.value === e.eligibility)?.label}</span>
        </div>
        {e.description && <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{e.description}</p>}
        <dl className="kv">
          {e.meetingAt && <><dt>AGM</dt><dd>{when(e.meetingAt)}{e.venue ? ` · ${e.venue}` : ''}</dd></>}
          {e.opensAt && <><dt>Opened</dt><dd>{when(e.opensAt)}</dd></>}
          {e.closesAt && <><dt>{e.status === 'closed' ? 'Closed' : 'Closes'}</dt><dd>{when(e.closedAt ?? e.closesAt)}</dd></>}
          <dt>Returning officer</dt><dd>{e.returningOfficer || '—'}</dd>
          <dt>Turnout</dt><dd>{e.turnout.voted} of {e.turnout.eligible} ({e.turnout.percent}%) · {e.turnout.app} in the app, {e.turnout.paper} on paper</dd>
        </dl>
        <FormError error={act.error} />

        {res ? (
          <div className="stack" style={{ gap: 10 }}>
            <h3>{e.kind === 'resolution' ? (res.tie ? 'Tied' : res.passed ? 'Resolution carried' : 'Resolution not carried') : 'The count'}</h3>
            {res.tie && e.kind === 'election' && <div className="callout" style={{ background: 'var(--warn-tint)' }}>Tie at the last seat. Settle it by the rules of the constitution (a run-off, lot or casting vote), then record the outcome in the description before publishing.</div>}
            <div className="stack" style={{ gap: 8 }}>
              {res.rows.map((r) => (
                <div key={r.candidateId} className={`result-row ${r.elected ? 'elected' : ''}`}>
                  <span className="result-name">{r.name}{r.note && <span className="muted small"> · {r.note}</span>}{r.elected && <span className="badge ok" style={{ marginLeft: 8 }}><Check size={12} /> {e.kind === 'resolution' ? 'Carried' : 'Elected'}</span>}</span>
                  <span className="small"><b>{r.votes}</b> <span className="muted">({r.percent}%) · app {r.app} · paper {r.paper}</span></span>
                  <div className="result-bar"><i style={{ width: `${(r.votes * 100) / max}%` }} /></div>
                </div>
              ))}
            </div>
            <span className="small muted">{res.ballots} ballots counted{res.invalid ? `, ${res.invalid} spoilt` : ''}.</span>
          </div>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            <h3>{e.kind === 'resolution' ? 'Options' : 'Candidates'}</h3>
            {e.candidates.map((c) => <div key={c.id} className="row between small" style={{ gap: 8 }}><span><b>{c.name}</b>{c.note && <span className="muted"> · {c.note}</span>}</span></div>)}
            {e.status === 'open' && <span className="small muted">The count stays sealed until the poll closes.</span>}
          </div>
        )}

        {canEdit && e.status !== 'draft' && !e.resultsPublished && (
          <div className="card card-pad stack" style={{ gap: 8 }}>
            <h3>Paper ballots from the hall</h3>
            <p className="small muted" style={{ margin: 0 }}>Enter the returning officer's count per {e.kind === 'resolution' ? 'option' : 'candidate'}. Mark paper voters on the roll so the app refuses them a second vote.</p>
            <div className="grid cols-2" style={{ gap: 8 }}>
              {e.candidates.map((c) => <Field key={c.id} label={c.name}><input className="input" type="number" min={0} value={paper[c.id] ?? ''} onChange={(ev) => setPaper({ ...paper, [c.id]: ev.target.value })} /></Field>)}
              <Field label="Spoilt / invalid"><input className="input" type="number" min={0} value={invalid} onChange={(ev) => setInvalid(ev.target.value)} /></Field>
            </div>
            <div><button className="btn" disabled={act.busy} onClick={() => run('paper', 'Paper count saved')}>Save paper count</button></div>
          </div>
        )}

        {canEdit && (
          <div className="row wrap" style={{ gap: 8 }}>
            {e.status !== 'closed' && <button className="btn" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</button>}
            {e.status === 'draft' && !opening && <button className="btn primary" onClick={() => setOpening(true)}><Megaphone size={14} /> Open voting</button>}
            {e.status === 'draft' && <button className="btn danger ghost" disabled={act.busy} onClick={() => run('remove', 'Draft deleted', true)}><Trash2 size={14} /> Delete</button>}
            {e.status !== 'draft' && <button className="btn" onClick={() => setRoll(true)}><Users size={14} /> The roll</button>}
            {e.status === 'open' && <button className="btn" disabled={act.busy} onClick={() => run('close', 'Voting closed. The count is below.')}><Lock size={14} /> Close voting now</button>}
            {e.status === 'closed' && !e.resultsPublished && <button className="btn primary" disabled={act.busy} onClick={() => run('publish', 'Result published and voters told')}><Megaphone size={14} /> Publish the result</button>}
          </div>
        )}
        {opening && (
          <div className="card card-pad stack" style={{ gap: 8, background: 'var(--tint)' }}>
            <Field label="Voting closes at" hint="Everyone eligible is told now, by push, WhatsApp and email as their settings allow. The poll closes itself at this time."><input className="input" type="datetime-local" value={closesAt} onChange={(ev) => setClosesAt(ev.target.value)} /></Field>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn primary" disabled={!closesAt || act.busy} onClick={() => run('open', `Voting is open. ${e.turnout.eligible} people told.`)}><Megaphone size={14} /> Open and notify {e.turnout.eligible} voters</button>
              <button className="btn" onClick={() => setOpening(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      {editing && <PollForm e={e} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChange(); }} />}
      {roll && <RollModal e={e} canEdit={canEdit && e.status === 'open'} onClose={() => setRoll(false)} onChange={onChange} />}
    </Modal>
  );
}

function RollModal({ e, canEdit, onClose, onChange }: { e: ElectionView; canEdit: boolean; onClose: () => void; onChange: () => void }) {
  const { data, error, reload } = useApi(() => AdminApi.elections.roll(e.id), [e.id]);
  const [q, setQ] = useState('');
  const mark = useAction((personId: string, voted: boolean) => AdminApi.elections.markRoll(e.id, personId, voted));
  const rows = (data?.people ?? []).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.phone ?? '').includes(q));
  const voted = data?.people.filter((p) => p.voted).length ?? 0;
  return (
    <Modal title={`The roll: ${e.title}`} onClose={onClose} wide>
      <div className="stack" style={{ gap: 10 }}>
        <p className="small muted" style={{ margin: 0 }}>Who may vote and whether they have, never how. Tick "paper" when someone hands in a ballot in the hall so the app refuses them a second vote.</p>
        <div className="row between wrap" style={{ gap: 8 }}>
          <input className="input" placeholder="Find a name or phone" value={q} onChange={(ev) => setQ(ev.target.value)} style={{ maxWidth: 280 }} />
          {data && <span className="small muted">{voted} of {data.people.length} have voted</span>}
        </div>
        <FormError error={mark.error} />
        {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : (
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="table compact">
              <thead><tr><th>Name</th><th>Phone</th><th>Voted</th>{canEdit && <th />}</tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="small muted">{p.phone ?? ''}</td>
                    <td>{p.voted === 'app' ? <span className="badge ok">In the app</span> : p.voted === 'paper' ? <span className="badge accent">On paper</span> : <span className="small muted">Not yet</span>}</td>
                    {canEdit && <td style={{ textAlign: 'right' }}>
                      {!p.voted && <button className="btn sm" disabled={mark.busy} onClick={async () => { if (await mark.run(p.id, true)) { reload(); onChange(); } }}>Voted on paper</button>}
                      {p.voted === 'paper' && <button className="btn sm ghost" disabled={mark.busy} onClick={async () => { if (await mark.run(p.id, false)) { reload(); onChange(); } }}><X size={12} /> Undo</button>}
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

type CandidateDraft = { id?: string; personId: string | null; name: string; note: string };

function PollForm({ e, onClose, onSaved }: { e?: ElectionView; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Omit<ElectionInput, 'candidates'> & { candidates: CandidateDraft[] }>({
    title: e?.title ?? '', kind: e?.kind ?? 'election', description: e?.description ?? '', seats: e?.seats ?? 3,
    candidates: e?.candidates.map((c) => ({ id: c.id, personId: c.personId, name: c.name, note: c.note })) ?? [],
    eligibility: e?.eligibility ?? 'members_18', meetingAt: e?.meetingAt ? toLocalInput(e.meetingAt) : '', venue: e?.venue ?? '', closesAt: e?.closesAt ? toLocalInput(e.closesAt) : '', returningOfficer: e?.returningOfficer ?? '',
  });
  const [typed, setTyped] = useState('');
  const locked = e?.status === 'open';
  const save = useAction(() => {
    const input: ElectionInput = { ...form, meetingAt: form.meetingAt ? new Date(form.meetingAt).toISOString() : null, closesAt: form.closesAt ? new Date(form.closesAt).toISOString() : null };
    if (locked) { delete input.candidates; delete input.seats; delete input.eligibility; delete input.kind; }
    return e ? AdminApi.elections.update(e.id, input) : AdminApi.elections.create(input);
  });
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const addCandidate = (c: CandidateDraft) => { if (c.name.trim() && !form.candidates.some((x) => (c.personId && x.personId === c.personId) || x.name === c.name)) set({ candidates: [...form.candidates, c] }); };
  return (
    <Modal title={e ? 'Edit poll' : 'New poll'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !form.title.trim()} onClick={async () => { if (await save.run()) onSaved(); }}>{e ? 'Save' : 'Save draft'}</button></>}>
      <div className="stack" style={{ gap: 12 }}>
        <FormError error={save.error} />
        {!e && <Segmented value={form.kind!} options={[{ value: 'election', label: 'Committee election' }, { value: 'resolution', label: 'AGM resolution' }]} onChange={(kind) => set({ kind: kind as ElectionKind, seats: kind === 'resolution' ? 1 : form.seats })} />}
        <Field label={form.kind === 'resolution' ? 'The motion, in one line' : 'Title'}><input className="input" value={form.title} onChange={(ev) => set({ title: ev.target.value })} placeholder={form.kind === 'resolution' ? 'Adopt the audited accounts for 2026–27' : 'Church committee 2027–2029'} /></Field>
        <Field label={form.kind === 'resolution' ? 'Full wording and background' : 'What the committee does and how the vote works'}><textarea className="textarea" rows={3} value={form.description} onChange={(ev) => set({ description: ev.target.value })} /></Field>
        {form.kind === 'election' && (
          <>
            <Field label="Seats to fill" hint="Each voter may choose up to this many."><input className="input" type="number" min={1} max={20} style={{ width: 100 }} value={form.seats} disabled={locked} onChange={(ev) => set({ seats: Number(ev.target.value) })} /></Field>
            <Field label="Candidates" hint={locked ? 'Candidates cannot change while voting is open.' : 'Pick from the people list, or type a name for someone not on it.'}>
              <div className="stack" style={{ gap: 6 }}>
                {form.candidates.map((c, i) => (
                  <div key={c.id ?? i} className="row" style={{ gap: 6 }}>
                    <span className="grow"><b>{c.name}</b></span>
                    <input className="input" placeholder="Standing for… (optional)" value={c.note} disabled={locked} style={{ maxWidth: 240 }} onChange={(ev) => set({ candidates: form.candidates.map((x, j) => (j === i ? { ...x, note: ev.target.value } : x)) })} />
                    {!locked && <button className="btn sm ghost" onClick={() => set({ candidates: form.candidates.filter((_, j) => j !== i) })}><X size={12} /></button>}
                  </div>
                ))}
                {!locked && (
                  <>
                    <PersonSearch placeholder="Add a candidate from the people list" exclude={form.candidates.map((c) => c.personId ?? '')} onPick={(p) => addCandidate({ personId: p.id, name: p.name, note: '' })} />
                    <div className="row" style={{ gap: 6 }}>
                      <input className="input" placeholder="Or type a name" value={typed} onChange={(ev) => setTyped(ev.target.value)} onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addCandidate({ personId: null, name: typed.trim(), note: '' }); setTyped(''); } }} />
                      <button className="btn" disabled={!typed.trim()} onClick={() => { addCandidate({ personId: null, name: typed.trim(), note: '' }); setTyped(''); }}>Add</button>
                    </div>
                  </>
                )}
              </div>
            </Field>
          </>
        )}
        <Field label="Who may vote">
          <select className="select" value={form.eligibility} disabled={locked} onChange={(ev) => set({ eligibility: ev.target.value as ElectionEligibility })}>{ELIGIBLE.map((x) => <option key={x.value} value={x.value}>{x.label} — {x.hint}</option>)}</select>
        </Field>
        <div className="grid cols-2" style={{ gap: 10 }}>
          <Field label="AGM date and time"><input className="input" type="datetime-local" value={form.meetingAt ?? ''} onChange={(ev) => set({ meetingAt: ev.target.value })} /></Field>
          <Field label="Venue"><input className="input" value={form.venue} onChange={(ev) => set({ venue: ev.target.value })} /></Field>
          <Field label="Voting closes at" hint="Can be set when you open the poll."><input className="input" type="datetime-local" value={form.closesAt ?? ''} onChange={(ev) => set({ closesAt: ev.target.value })} /></Field>
          <Field label="Returning officer"><input className="input" value={form.returningOfficer} onChange={(ev) => set({ returningOfficer: ev.target.value })} /></Field>
        </div>
      </div>
    </Modal>
  );
}
