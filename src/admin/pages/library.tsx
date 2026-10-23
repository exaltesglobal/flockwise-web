// People › Library: the church's books, who has them, when they are due back, and requests members
// send from the app. Paste a whole shelf at once; reminders go out the day before and when overdue.
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { LibraryBookView, LibraryHub, LibraryLoanView } from '@/core/types';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { PersonField, type PickedPerson } from '../components/person-picker';
import { PageHeader } from '../layout';

const day = (d: string | null) => (d ? formatDate(`${d}T12:00:00`) : '');
type Draft = { title: string; author: string; language: string; category: string; copies: number; isbn: string; note: string };
const blank: Draft = { title: '', author: '', language: '', category: '', copies: 1, isbn: '', note: '' };

/** "Title | Author | copies | category" per line; only the title is required. */
function parseShelf(text: string): Draft[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [title = '', author = '', copies = '', category = ''] = l.split('|').map((s) => s.trim());
    return { ...blank, title, author, copies: Math.max(1, Number(copies) || 1), category };
  }).filter((b) => b.title);
}

export function LibraryPage() {
  const q = useApi(AdminApi.library.hub);
  const can = useCan();
  const editable = can('people.edit');
  const toast = useToast();
  const [tab, setTab] = useState<'loans' | 'books'>('loans');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<LibraryBookView | 'new' | null>(null);
  const [lending, setLending] = useState<LibraryBookView | null>(null);
  const act = useAction(async (fn: () => Promise<LibraryHub>, msg?: string) => { q.setData(await fn()); if (msg) toast(msg); });
  if (q.error) return <><PageHeader title="Library" /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title="Library" /><Loading /></>;
  const d = q.data;
  const s = search.trim().toLowerCase();
  const books = d.books.filter((b) => !s || `${b.title} ${b.author} ${b.category} ${b.language}`.toLowerCase().includes(s));

  return (
    <>
      <PageHeader
        title="Library"
        subtitle="The church's books and who has them. Members ask for a book from the app, you lend it here, and Flockwise reminds them the day before it is due."
        actions={editable && <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> Add books</button>}
      />
      <div className="stack">
        <div className="stat-row">
          <div className="card card-pad co-stat"><span className="muted small">Titles</span><b className="co-big">{d.counts.titles}</b><span className="small muted">{d.counts.copies} cop{d.counts.copies === 1 ? 'y' : 'ies'}</span></div>
          <div className="card card-pad co-stat"><span className="muted small">Lent out</span><b className="co-big">{d.counts.out}</b></div>
          <div className={`card card-pad co-stat ${d.counts.overdue ? 'sg-risk' : ''}`}><span className="muted small">Overdue</span><b className="co-big">{d.counts.overdue}</b></div>
          <div className="card card-pad co-stat"><span className="muted small">Requests waiting</span><b className="co-big">{d.counts.requests}</b></div>
        </div>
        <FormError error={act.error} />

        {d.requests.length > 0 && (
          <div className="card card-pad stack" style={{ gap: 8 }}>
            <b>Requests from the app</b>
            <ul className="lib-list">
              {d.requests.map((l) => (
                <li key={l.id}>
                  <div className="grow" style={{ minWidth: 0 }}><b>{l.title}</b><span className="small muted"> · {l.name}{l.phone ? ` · ${l.phone}` : ''} · asked {formatDate(l.requestedAt ?? '')}</span></div>
                  {editable && (
                    <div className="row wrap" style={{ gap: 6 }}>
                      <button className="btn sm" onClick={() => void act.run(() => AdminApi.library.act(l.id, 'ready'), `${l.name.split(' ')[0]} has been told the book is ready.`)}>Tell them it's ready</button>
                      <button className="btn sm primary" onClick={() => void act.run(() => AdminApi.library.act(l.id, 'issue'), `Lent to ${l.name}.`)}>Hand over</button>
                      <button className="btn sm ghost" onClick={() => void act.run(() => AdminApi.library.act(l.id, 'cancel'))}>Decline</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Segmented value={tab} onChange={setTab} options={[{ value: 'loans', label: `Lent out (${d.loans.length})` }, { value: 'books', label: `Books (${d.books.length})` }]} />

        {tab === 'loans' ? (
          !d.loans.length ? (
            <Empty icon={<BookOpen size={28} />} title="Nothing lent out" body="Open the Books tab and press Lend next to a book to record who took it." />
          ) : (
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>Book</th><th>With</th><th>Since</th><th>Due back</th>{editable && <th />}</tr></thead>
                <tbody>
                  {d.loans.map((l) => <LoanRow key={l.id} l={l} editable={editable} onAct={(a, msg) => void act.run(() => AdminApi.library.act(l.id, a), msg)} />)}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <>
            <div className="row wrap" style={{ gap: 8 }}>
              <input className="input grow" style={{ minWidth: 200 }} placeholder="Search title, author, category" value={search} onChange={(e) => setSearch(e.target.value)} />
              {editable && <LoanDays days={d.settings.loanDays} onSave={(n) => void act.run(() => AdminApi.library.settings(n), 'Loan length saved.')} />}
            </div>
            {!books.length ? (
              <Empty icon={<BookOpen size={28} />} title={d.books.length ? 'No books match' : 'No books yet'} body={d.books.length ? 'Try another word.' : 'Add the books on your church shelf. You can paste a whole list at once.'} action={editable && !d.books.length && <button className="btn primary" onClick={() => setEditing('new')}>Add books</button>} />
            ) : (
              <div className="card table-wrap">
                <table className="table">
                  <thead><tr><th>Title</th><th>Category</th><th>Copies</th><th>On the shelf</th>{editable && <th />}</tr></thead>
                  <tbody>
                    {books.map((b) => (
                      <tr key={b.id}>
                        <td><b>{b.title}</b>{b.author && <div className="small muted">{b.author}</div>}</td>
                        <td className="small">{b.category || <span className="muted">-</span>}{b.language && <div className="muted">{b.language}</div>}</td>
                        <td className="small">{b.copies}<div className="muted">borrowed {b.timesBorrowed}×</div></td>
                        <td>{b.available > 0 ? <span className="badge ok">{b.available} available</span> : <span className="badge gray">All out</span>}{b.requested > 0 && <div className="small muted">{b.requested} waiting</div>}</td>
                        {editable && (
                          <td>
                            <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                              <button className="btn sm" disabled={b.available < 1} onClick={() => setLending(b)}>Lend</button>
                              <button className="btn sm ghost" aria-label="Edit book" onClick={() => setEditing(b)}><Pencil size={14} /></button>
                              <button className="btn sm ghost" aria-label="Remove book" onClick={() => { if (confirm(`Remove "${b.title}" from the library?`)) void act.run(() => AdminApi.library.remove(b.id), 'Book removed.'); }}><Trash2 size={14} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
      {editing && <BookForm book={editing === 'new' ? null : editing} categories={d.categories} onClose={() => setEditing(null)} onDone={(h, msg) => { q.setData(h); setEditing(null); toast(msg); }} />}
      {lending && <Lend book={lending} days={d.settings.loanDays} onClose={() => setLending(null)} onDone={(h, name) => { q.setData(h); setLending(null); setTab('loans'); toast(`"${lending.title}" lent to ${name}.`); }} />}
    </>
  );
}

function LoanRow({ l, editable, onAct }: { l: LibraryLoanView; editable: boolean; onAct: (a: 'return' | 'renew', msg: string) => void }) {
  return (
    <tr>
      <td><b>{l.title}</b>{l.author && <div className="small muted">{l.author}</div>}</td>
      <td>{l.name}{l.phone && <div className="small muted">{l.phone}</div>}</td>
      <td className="small">{day(l.borrowedOn)}</td>
      <td>{l.overdue ? <span className="badge danger">Overdue since {day(l.dueOn)}</span> : <span className="small">{day(l.dueOn)}</span>}</td>
      {editable && (
        <td>
          <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
            <button className="btn sm ghost" onClick={() => onAct('renew', 'Due date moved on.')}>Renew</button>
            <button className="btn sm primary" onClick={() => onAct('return', `"${l.title}" is back on the shelf.`)}>Returned</button>
          </div>
        </td>
      )}
    </tr>
  );
}

function LoanDays({ days, onSave }: { days: number; onSave: (n: number) => void }) {
  return (
    <label className="row small" style={{ gap: 6 }}>
      <span className="muted">Lend for</span>
      <select value={days} onChange={(e) => onSave(Number(e.target.value))}>
        {[7, 14, 21, 30, 45, 60].map((n) => <option key={n} value={n}>{n} days</option>)}
      </select>
    </label>
  );
}

function BookForm({ book, categories, onClose, onDone }: { book: LibraryBookView | null; categories: string[]; onClose: () => void; onDone: (h: LibraryHub, msg: string) => void }) {
  const [mode, setMode] = useState<'one' | 'many'>('one');
  const [f, setF] = useState<Draft>(book ? { title: book.title, author: book.author, language: book.language, category: book.category, copies: book.copies, isbn: book.isbn, note: book.note } : blank);
  const [shelf, setShelf] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((x) => ({ ...x, [k]: v }));
  const parsed = mode === 'many' ? parseShelf(shelf) : [];
  const save = useAction(async (e: FormEvent) => {
    e.preventDefault();
    if (book) return onDone(await AdminApi.library.update(book.id, f), 'Book saved.');
    const list = mode === 'many' ? parsed : [f];
    if (!list.length) throw new Error('Add at least one book.');
    onDone(await AdminApi.library.add(list), list.length === 1 ? `"${list[0].title}" added.` : `${list.length} books added.`);
  });
  return (
    <Modal title={book ? 'Edit book' : 'Add books'} onClose={onClose}>
      <form className="stack" onSubmit={save.run}>
        {!book && <Segmented value={mode} onChange={setMode} options={[{ value: 'one', label: 'One book' }, { value: 'many', label: 'Paste a list' }]} />}
        {mode === 'many' && !book ? (
          <Field label="One book per line" hint={'Title | Author | copies | category. Only the title is needed. ' + (parsed.length ? `${parsed.length} book${parsed.length === 1 ? '' : 's'} found.` : '')}>
            <textarea rows={8} value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder={'The Pilgrim\'s Progress | John Bunyan | 2 | Classics\nMere Christianity | C. S. Lewis\nGospel of John (Telugu) | | 5 | Bibles'} />
          </Field>
        ) : (
          <>
            <Field label="Title"><input value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={160} required autoFocus /></Field>
            <Field label="Author"><input value={f.author} onChange={(e) => set('author', e.target.value)} maxLength={120} /></Field>
            <div className="co-grid">
              <Field label="Category">
                <input value={f.category} onChange={(e) => set('category', e.target.value)} maxLength={60} list="lib-cats" placeholder="Devotional, Bibles, Children" />
                <datalist id="lib-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="Language"><input value={f.language} onChange={(e) => set('language', e.target.value)} maxLength={40} placeholder="English, Telugu" /></Field>
              <Field label="Copies"><input type="number" min={1} max={500} value={f.copies} onChange={(e) => set('copies', Number(e.target.value))} /></Field>
              <Field label="ISBN"><input value={f.isbn} onChange={(e) => set('isbn', e.target.value)} maxLength={20} /></Field>
            </div>
            <Field label="Note" hint="Optional, e.g. which shelf it is on."><input value={f.note} onChange={(e) => set('note', e.target.value)} maxLength={300} /></Field>
          </>
        )}
        <FormError error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={save.busy}>{book ? 'Save' : mode === 'many' ? `Add ${parsed.length || ''} books` : 'Add book'}</button>
        </div>
      </form>
    </Modal>
  );
}

function Lend({ book, days, onClose, onDone }: { book: LibraryBookView; days: number; onClose: () => void; onDone: (h: LibraryHub, name: string) => void }) {
  const [person, setPerson] = useState<PickedPerson | null>(null);
  const save = useAction(async (e: FormEvent) => {
    e.preventDefault();
    if (!person) throw new Error('Choose who is borrowing the book.');
    onDone(await AdminApi.library.lend(book.id, person.id), person.name);
  });
  return (
    <Modal title={`Lend "${book.title}"`} onClose={onClose}>
      <form className="stack" onSubmit={save.run}>
        <Field label="Borrowed by" hint={`Due back in ${days} days. They get a reminder the day before.`}><PersonField value={person} onChange={setPerson} /></Field>
        <FormError error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={save.busy}>Lend</button>
        </div>
      </form>
    </Modal>
  );
}
