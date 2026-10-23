// People › Skills & board: who in the church can do what (and is happy to help), so the office can
// find an electrician, a doctor or a tabla player in a minute; plus the members' board of job
// openings, needs and offers, which the office can moderate.
import { Handshake, Pencil, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { SkillPerson, SkillsHub } from '@/core/types';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PersonField, type PickedPerson } from '../components/person-picker';
import { PageHeader } from '../layout';

const KIND = { job: 'Job opening', need: 'Need', offer: 'Offer' } as const;

export function SkillsPage() {
  const q = useApi(AdminApi.skills.hub);
  const can = useCan();
  const editable = can('people.edit');
  const toast = useToast();
  const [tab, setTab] = useState<'people' | 'board'>('people');
  const [search, setSearch] = useState('');
  const [only, setOnly] = useState<string | null>(null);
  const [editing, setEditing] = useState<SkillPerson | 'new' | null>(null);
  const act = useAction(async (fn: () => Promise<SkillsHub>) => q.setData(await fn()));
  if (q.error) return <><PageHeader title="Skills & board" /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title="Skills & board" /><Loading /></>;
  const d = q.data;
  const s = search.trim().toLowerCase();
  const people = d.people.filter((p) => (!only || p.skills.includes(only)) && (!s || `${p.name} ${p.skills.join(' ')} ${p.note}`.toLowerCase().includes(s)));

  return (
    <>
      <PageHeader
        title="Skills & board"
        subtitle="Members add what they can do in the app, so you can find a volunteer in a minute. The board carries job openings, needs and offers from members."
        actions={editable && tab === 'people' && <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> Add skills for someone</button>}
      />
      <div className="stack">
        <div className="stat-row">
          <div className="card card-pad co-stat"><span className="muted small">People with skills listed</span><b className="co-big">{d.counts.people}</b></div>
          <div className="card card-pad co-stat"><span className="muted small">Happy to help the church</span><b className="co-big">{d.counts.willingToServe}</b></div>
          <div className="card card-pad co-stat"><span className="muted small">Open board posts</span><b className="co-big">{d.counts.openPosts}</b></div>
        </div>
        <FormError error={act.error} />
        <Segmented value={tab} onChange={setTab} options={[{ value: 'people', label: 'Skills' }, { value: 'board', label: `Board (${d.posts.length})` }]} />

        {tab === 'people' ? (
          <>
            {d.skills.length > 0 && (
              <div className="row wrap" style={{ gap: 6 }}>
                {d.skills.slice(0, 24).map((x) => (
                  <button key={x.skill} className={`sk-tag ${only === x.skill ? 'on' : ''}`} onClick={() => setOnly(only === x.skill ? null : x.skill)}>{x.skill} <span>{x.count}</span></button>
                ))}
              </div>
            )}
            <input className="input" placeholder="Search name, skill or note" value={search} onChange={(e) => setSearch(e.target.value)} />
            {!people.length ? (
              <Empty icon={<Handshake size={28} />} title={d.people.length ? 'Nobody matches' : 'No skills listed yet'} body={d.people.length ? 'Try another skill.' : 'Members add their skills under Skills & board in the app. You can also add them for someone here.'} />
            ) : (
              <div className="card table-wrap">
                <table className="table">
                  <thead><tr><th>Name</th><th>Skills</th><th>Help the church</th>{editable && <th />}</tr></thead>
                  <tbody>
                    {people.map((p) => (
                      <tr key={p.personId}>
                        <td><b>{p.name}</b>{p.phone && <div className="small muted">{p.phone}</div>}</td>
                        <td><div className="row wrap" style={{ gap: 4 }}>{p.skills.map((x) => <span key={x} className="badge gray">{x}</span>)}</div>{p.note && <div className="small muted">{p.note}</div>}</td>
                        <td className="small">{p.serve ? <span className="badge ok">Yes</span> : <span className="muted">Not now</span>}{p.share && <div className="muted">Listed for members</div>}</td>
                        {editable && <td><button className="btn sm ghost" aria-label="Edit skills" onClick={() => setEditing(p)}><Pencil size={14} /></button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : !d.posts.length ? (
          <Empty icon={<Handshake size={28} />} title="The board is empty" body="Members post job openings, needs (a tutor, a room to rent) and offers from the app. Posts close after 30 days." />
        ) : (
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>Post</th><th>By</th><th>Status</th>{editable && <th />}</tr></thead>
              <tbody>
                {d.posts.map((p) => (
                  <tr key={p.id}>
                    <td><span className="small muted">{KIND[p.kind]}{p.place ? ` · ${p.place}` : ''}</span><div><b>{p.title}</b></div>{p.body && <div className="small">{p.body}</div>}</td>
                    <td className="small">{p.name}{p.phone && <div className="muted">{p.phone}</div>}<div className="muted">{formatDate(p.createdAt)}</div></td>
                    <td>{p.status === 'hidden' ? <span className="badge danger">Hidden</span> : p.status === 'closed' ? <span className="badge gray">Closed</span> : p.expired ? <span className="badge gray">Expired</span> : <span className="badge ok">Open</span>}</td>
                    {editable && <td>{p.status === 'hidden' ? <button className="btn sm" onClick={() => void act.run(() => AdminApi.skills.moderate(p.id, 'show'))}>Show again</button> : p.status === 'open' && <button className="btn sm ghost" onClick={() => { if (confirm('Hide this post from members?')) void act.run(() => AdminApi.skills.moderate(p.id, 'hide')); }}>Hide</button>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && <EditSkills person={editing === 'new' ? null : editing} known={d.skills.map((x) => x.skill)} onClose={() => setEditing(null)} onDone={(h) => { q.setData(h); setEditing(null); toast('Skills saved.'); }} />}
    </>
  );
}

function EditSkills({ person, known, onClose, onDone }: { person: SkillPerson | null; known: string[]; onClose: () => void; onDone: (h: SkillsHub) => void }) {
  const [who, setWho] = useState<PickedPerson | null>(person ? { id: person.personId, name: person.name } : null);
  const [skills, setSkills] = useState(person?.skills.join(', ') ?? '');
  const [note, setNote] = useState(person?.note ?? '');
  const [serve, setServe] = useState(person?.serve ?? true);
  const save = useAction(async (e: FormEvent) => {
    e.preventDefault();
    if (!who) throw new Error('Choose the person.');
    onDone(await AdminApi.skills.set(who.id, { skills: skills.split(',').map((x) => x.trim()).filter(Boolean), note, serve }));
  });
  return (
    <Modal title={person ? `Skills of ${person.name}` : 'Add skills for someone'} onClose={onClose}>
      <form className="stack" onSubmit={save.run}>
        {!person && <Field label="Person"><PersonField value={who} onChange={setWho} /></Field>}
        <Field label="Skills" hint={`Separate with commas.${known.length ? ` Already used: ${known.slice(0, 8).join(', ')}.` : ''}`}><input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Electrician, Tabla, Telugu typing" /></Field>
        <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Weekends only" /></Field>
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={serve} onChange={(e) => setServe(e.target.checked)} /> Happy to help the church with these</label>
        <FormError error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={save.busy}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
