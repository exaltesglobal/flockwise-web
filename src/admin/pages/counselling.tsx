// Care › Counselling notes: private notes a pastor keeps about counselling conversations, with
// follow-up dates. They are locked with the pastor's own passphrase in this browser, so nobody else
// can read them: not other staff, not the church owner, not the Flockwise team.
import { Lock, LockKeyhole, NotebookPen, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { CounselKey, CounselNote } from '@/core/types';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useHiddenRows, useToast, useUndoableDelete } from '@/components/ui';
import { newPassphrase, seal, unlock, unseal } from '@/lib/counsel-crypto';
import { formatDate } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PersonField, type PickedPerson } from '../components/person-picker';
import { PageHeader } from '../layout';

type Body = { personId: string | null; personName: string; title: string; text: string; date: string };
type Open = CounselNote & { body: Body | null };
const today = () => new Date().toISOString().slice(0, 10);
const day = (d: string) => formatDate(`${d}T12:00:00`);
const SUBTITLE = 'Private notes from counselling conversations, with follow-up reminders. Only you can read them: they are locked with your own passphrase before they leave this browser.';

export function CounsellingPage() {
  const q = useApi(AdminApi.counsel.key);
  const [key, setKey] = useState<CryptoKey | null>(null);
  if (q.error) return <><PageHeader title="Counselling notes" /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (q.loading && !q.data) return <><PageHeader title="Counselling notes" /><Loading /></>;
  return (
    <>
      <PageHeader title="Counselling notes" subtitle={SUBTITLE} actions={key && <button className="btn" onClick={() => setKey(null)}><Lock size={15} /> Lock</button>} />
      {key ? <Notes cryptoKey={key} /> : q.data ? <Unlock saved={q.data} onKey={setKey} onReset={() => { setKey(null); q.reload(); }} /> : <SetUp onKey={(k) => { setKey(k); q.reload(); }} />}
    </>
  );
}

function SetUp({ onKey, reset = false }: { onKey: (k: CryptoKey) => void; reset?: boolean }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const save = useAction(async (e: FormEvent) => {
    e.preventDefault();
    if (a.length < 8) throw new Error('Use at least 8 characters.');
    if (a !== b) throw new Error('The two passphrases are not the same.');
    const made = await newPassphrase(a);
    await AdminApi.counsel.setKey({ salt: made.salt, iv: made.iv, check: made.check, reset });
    onKey(made.key);
  });
  return (
    <form className="card card-pad stack cn-lock" onSubmit={save.run}>
      <LockKeyhole size={28} className="cn-lock-icon" />
      <b>{reset ? 'Choose a new passphrase' : 'Choose a passphrase for your notes'}</b>
      <p className="small muted" style={{ margin: 0 }}>
        Your notes are locked with this passphrase on your own device. If you forget it, nobody can open the notes again, not even the Flockwise team. Write it somewhere safe.
      </p>
      <Field label="Passphrase" hint="At least 8 characters. A short sentence is easy to remember."><input type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} autoFocus /></Field>
      <Field label="Type it again"><input type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} /></Field>
      <FormError error={save.error} />
      <button className="btn primary" disabled={save.busy}>{save.busy ? 'Locking…' : 'Set the passphrase'}</button>
    </form>
  );
}

function Unlock({ saved, onKey, onReset }: { saved: CounselKey; onKey: (k: CryptoKey) => void; onReset: () => void }) {
  const [pass, setPass] = useState('');
  const [resetting, setResetting] = useState(false);
  const [sure, setSure] = useState('');
  const open = useAction(async (e: FormEvent) => {
    e.preventDefault();
    const k = await unlock(pass, saved);
    if (!k) throw new Error('That is not the passphrase.');
    onKey(k);
  });
  if (resetting) {
    return sure === 'START AGAIN' ? <SetUp reset onKey={(k) => { onKey(k); onReset(); }} /> : (
      <div className="card card-pad stack cn-lock">
        <b>Start again with a new passphrase?</b>
        <p className="small muted" style={{ margin: 0 }}>Without the old passphrase your existing notes cannot be opened, so starting again deletes them. Type START AGAIN to go on.</p>
        <input value={sure} onChange={(e) => setSure(e.target.value.toUpperCase())} placeholder="START AGAIN" aria-label="Type START AGAIN" />
        <button className="btn ghost" onClick={() => { setResetting(false); setSure(''); }}>Go back</button>
      </div>
    );
  }
  return (
    <form className="card card-pad stack cn-lock" onSubmit={open.run}>
      <LockKeyhole size={28} className="cn-lock-icon" />
      <b>Your notes are locked</b>
      <Field label="Passphrase"><input type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus /></Field>
      <FormError error={open.error} />
      <button className="btn primary" disabled={open.busy || !pass}>{open.busy ? 'Opening…' : 'Open my notes'}</button>
      <button type="button" className="btn ghost sm" onClick={() => setResetting(true)}>Forgot the passphrase?</button>
    </form>
  );
}

function Notes({ cryptoKey }: { cryptoKey: CryptoKey }) {
  const q = useApi(AdminApi.counsel.list);
  const [notes, setNotes] = useState<Open[] | null>(null);
  const [editing, setEditing] = useState<Open | null | undefined>(undefined);
  const [find, setFind] = useState('');
  const rows = useHiddenRows();
  const undoable = useUndoableDelete();
  useEffect(() => {
    if (!q.data) return;
    let live = true;
    void Promise.all(q.data.map(async (n) => ({ ...n, body: await unseal<Body>(cryptoKey, n.iv, n.data).catch(() => null) }))).then((x) => live && setNotes(x));
    return () => { live = false; };
  }, [q.data, cryptoKey]);
  const list = useMemo(() => {
    const t = find.trim().toLowerCase();
    return (notes ?? []).filter((n) => !rows.hidden.has(n.id) && (!t || `${n.body?.personName} ${n.body?.title} ${n.body?.text}`.toLowerCase().includes(t)))
      .sort((a, b) => (b.body?.date ?? '').localeCompare(a.body?.date ?? '') || b.updatedAt.localeCompare(a.updatedAt));
  }, [notes, find, rows.hidden]);
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!notes) return <Loading />;
  const due = notes.filter((n) => n.followUp && n.followUp <= today());

  return (
    <div className="stack">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <div className="search grow"><Search size={16} /><input className="input" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search your notes" /></div>
        <button className="btn primary" onClick={() => setEditing(null)}><Plus size={16} /> New note</button>
      </div>
      {due.length > 0 && <div className="card card-pad small"><b>Follow up today:</b> {due.map((n) => n.body?.personName || n.body?.title || 'A note').join(', ')}</div>}
      {!list.length ? (
        <Empty icon={<NotebookPen size={28} />} title={notes.length ? 'No notes match' : 'No notes yet'} body={notes.length ? undefined : 'After a counselling conversation, write what was shared, what you prayed about and when to follow up.'} />
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {list.map((n) => (
            <button key={n.id} className="card card-pad cn-note" onClick={() => setEditing(n)}>
              <div className="row between" style={{ gap: 8 }}>
                <b>{n.body ? n.body.personName || n.body.title || 'Note' : 'This note cannot be opened'}</b>
                <span className="small muted">{n.body?.date ? day(n.body.date) : ''}</span>
              </div>
              {n.body?.personName && n.body.title && <span className="small">{n.body.title}</span>}
              {n.body?.text && <span className="small muted cn-snippet">{n.body.text}</span>}
              {n.followUp && <span className={`badge ${n.followUp <= today() ? 'danger' : 'gray'}`} style={{ alignSelf: 'flex-start' }}>Follow up {day(n.followUp)}</span>}
            </button>
          ))}
        </div>
      )}
      {editing !== undefined && (
        <NoteEditor
          note={editing}
          cryptoKey={cryptoKey}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); q.reload(); }}
          onDelete={(n) => { setEditing(undefined); undoable({ text: 'Note deleted.', hide: () => rows.hide(n.id), show: () => rows.show(n.id), run: () => AdminApi.counsel.remove(n.id), done: q.reload }); }}
        />
      )}
    </div>
  );
}

function NoteEditor({ note, cryptoKey, onClose, onSaved, onDelete }: { note: Open | null; cryptoKey: CryptoKey; onClose: () => void; onSaved: () => void; onDelete: (n: Open) => void }) {
  const b = note?.body;
  const [person, setPerson] = useState<PickedPerson | null>(b?.personId ? { id: b.personId, name: b.personName } : null);
  const [name, setName] = useState(b && !b.personId ? b.personName : '');
  const [title, setTitle] = useState(b?.title ?? '');
  const [text, setText] = useState(b?.text ?? '');
  const [date, setDate] = useState(b?.date ?? today());
  const [followUp, setFollowUp] = useState(note?.followUp ?? '');
  const toast = useToast();
  const save = useAction(async () => {
    const body: Body = { personId: person?.id ?? null, personName: person?.name ?? name.trim(), title: title.trim(), text, date };
    const sealed = await seal(cryptoKey, body);
    if (note) await AdminApi.counsel.update(note.id, { ...sealed, followUp: followUp || null });
    else await AdminApi.counsel.create({ ...sealed, followUp: followUp || null });
    toast('Saved and locked.');
    onSaved();
  });
  return (
    <Modal
      title={note ? 'Counselling note' : 'New counselling note'}
      onClose={onClose}
      footer={<>
        {note && <button className="btn ghost grow" style={{ justifyContent: 'flex-start' }} onClick={() => onDelete(note)}><Trash2 size={14} /> Delete</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => void save.run()} disabled={save.busy || (!text.trim() && !title.trim())}>Save</button>
      </>}
    >
      <div className="stack">
        <Field label="Who" hint="Choose from People, or type a name for someone not in the church list.">
          {person ? <PersonField value={person} onChange={setPerson} /> : (
            <div className="stack" style={{ gap: 6 }}>
              <PersonField value={null} onChange={setPerson} />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Or type a name" maxLength={80} />
            </div>
          )}
        </Field>
        <div className="row" style={{ gap: 10 }}>
          <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Follow up on" hint="You get a reminder that day. It never says who."><input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} /></Field>
        </div>
        <Field label="Topic"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Marriage, grief, job loss…" maxLength={120} /></Field>
        <Field label="Notes"><textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="What was shared, what you prayed about, next steps" /></Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}
