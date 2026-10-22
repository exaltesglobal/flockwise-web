import { Download, Pencil, Plus, Search, Trash2, Upload, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import type { Person, PersonInput, PersonStatus } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Avatar, Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { downloadCsv, formatDate, formatNumber, formatRelative } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

export const STATUS: Record<PersonStatus, { label: string; tone: string }> = {
  member: { label: 'Member', tone: '' },
  regular: { label: 'Regular', tone: 'ok' },
  visitor: { label: 'Visitor', tone: 'warn' },
  inactive: { label: 'Inactive', tone: 'gray' },
};

export function PeoplePage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<PersonStatus | ''>('');
  const [extra, setExtra] = useState<Person[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editing, setEditing] = useState<Person | 'new' | null>(params.get('new') ? 'new' : null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const list = useApi(async () => {
    const page = await AdminApi.people.list({ q: debounced, status });
    setExtra([]);
    setCursor(page.nextCursor);
    return page;
  }, [debounced, status]);

  const people = [...(list.data?.data ?? []), ...extra];

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await AdminApi.people.list({ q: debounced, status, cursor });
      setExtra((e) => [...e, ...page.data]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  async function exportAll() {
    const all: Person[] = [];
    let next: string | null | undefined = undefined;
    do {
      const page = await AdminApi.people.list({ q: debounced, status, cursor: next ?? undefined });
      all.push(...page.data);
      next = page.nextCursor;
    } while (next);
    downloadCsv(`flockwise-people-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['First name', 'Last name', 'Mobile', 'Email', 'Status', 'Household', 'Birth date', 'Address', 'Tags', 'Groups'],
      ...all.map((p) => [p.firstName, p.lastName, p.phone, p.email, STATUS[p.status].label, p.householdName, p.birthDate, p.address, p.tags.join('; '), p.groups.map((g) => g.name).join('; ')]),
    ]);
    toast(`Exported ${all.length} people`);
  }

  function closeEditor() {
    setEditing(null);
    if (params.get('new')) setParams({}, { replace: true });
  }

  return (
    <>
      <PageHeader
        title="People"
        subtitle={list.data ? `${formatNumber(list.data.total)} ${status ? STATUS[status].label.toLowerCase() + 's' : 'people'}${debounced ? ` matching “${debounced}”` : ''}` : undefined}
        actions={
          <>
            <Link to="/admin/import" className="btn"><Upload size={16} /> Import</Link>
            <button className="btn" onClick={exportAll}><Download size={16} /> Export</button>
            <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> Add person</button>
          </>
        }
      />

      <div className="card">
        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input className="input" placeholder="Search name, mobile, email or household" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="select" style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value as PersonStatus | '')}>
            <option value="">All statuses</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {list.error ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : !list.data ? (
          <Loading />
        ) : people.length === 0 ? (
          <Empty icon={<Users size={32} />} title="No one found" body={debounced ? 'Try a different search.' : 'Add people one by one or import your spreadsheet.'} action={<Link to="/admin/import" className="btn primary">Import from Excel</Link>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Status</th>
                  <th>Household</th>
                  <th>Groups</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/admin/people/${p.id}`)}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <Avatar name={`${p.firstName} ${p.lastName}`} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{p.firstName} {p.lastName}</div>
                          <div className="small muted ellipsis" style={{ maxWidth: 240 }}>{p.email ?? '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="mono">{p.phone ?? '—'}</td>
                    <td><span className={`badge ${STATUS[p.status].tone}`}>{STATUS[p.status].label}</span></td>
                    <td>{p.householdName ?? <span className="muted">—</span>}</td>
                    <td className="small">{p.groups.length ? p.groups.map((g) => g.name).join(', ') : <span className="muted">—</span>}</td>
                    <td className="small muted">{p.lastAttendedAt ? formatRelative(p.lastAttendedAt) : 'Never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cursor && (
          <div style={{ padding: 16, textAlign: 'center', borderTop: '1px solid var(--border)' }}>
            <button className="btn" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more'}</button>
          </div>
        )}
      </div>

      {id && (
        <PersonDrawer
          id={id}
          onClose={() => navigate('/admin/people')}
          onEdit={(p) => setEditing(p)}
          onDeleted={() => {
            navigate('/admin/people');
            list.reload();
          }}
        />
      )}
      {editing && (
        <PersonForm
          person={editing === 'new' ? null : editing}
          onClose={closeEditor}
          onSaved={(p) => {
            closeEditor();
            list.reload();
            toast(editing === 'new' ? `${p.firstName} added` : 'Saved');
            navigate(`/admin/people/${p.id}`, { replace: true });
          }}
        />
      )}
    </>
  );
}

function PersonDrawer({ id, onClose, onEdit, onDeleted }: { id: string; onClose: () => void; onEdit: (p: Person) => void; onDeleted: () => void }) {
  const { data: p, error, reload } = useApi(() => AdminApi.people.get(id), [id]);
  const toast = useToast();
  const remove = useAction(AdminApi.people.remove);

  return (
    <Modal side title="Person" onClose={onClose}
      footer={p && (
        <>
          <button className="btn danger" disabled={remove.busy} onClick={async () => {
            if (!confirm(`Remove ${p.firstName} ${p.lastName}? This cannot be undone.`)) return;
            await remove.run(p.id);
            toast('Removed');
            onDeleted();
          }}><Trash2 size={16} /> Remove</button>
          <button className="btn primary" onClick={() => onEdit(p)}><Pencil size={16} /> Edit</button>
        </>
      )}
    >
      {error ? <ErrorState error={error} onRetry={reload} /> : !p ? <Loading /> : (
        <div className="stack lg">
          <div className="row">
            <Avatar name={`${p.firstName} ${p.lastName}`} size="lg" />
            <div>
              <h2>{p.firstName} {p.lastName}</h2>
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                <span className={`badge ${STATUS[p.status].tone}`}>{STATUS[p.status].label}</span>
                {p.tags.map((t) => <span key={t} className="badge gray">{t}</span>)}
              </div>
            </div>
          </div>
          <dl className="detail-grid">
            <dt>Mobile</dt><dd className="mono">{p.phone ? <a href={`tel:${p.phone.replace(/\s/g, '')}`}>{p.phone}</a> : '—'}</dd>
            <dt>WhatsApp</dt><dd>{p.phone ? <a href={`https://wa.me/${p.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">Send a message</a> : '—'}</dd>
            <dt>Email</dt><dd>{p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : '—'}</dd>
            <dt>Household</dt><dd>{p.householdName ?? '—'}</dd>
            <dt>Birthday</dt><dd>{p.birthDate ? formatDate(p.birthDate) : '—'}</dd>
            <dt>Address</dt><dd>{p.address ?? '—'}</dd>
            <dt>Language</dt><dd>{p.language === 'hi' ? 'हिन्दी (Hindi)' : 'English'}</dd>
            <dt>Groups</dt><dd>{p.groups.length ? p.groups.map((g) => g.name).join(', ') : '—'}</dd>
            <dt>Added</dt><dd>{formatDate(p.joinedAt)}</dd>
            <dt>Last attended</dt><dd>{p.lastAttendedAt ? formatRelative(p.lastAttendedAt) : 'Never'}</dd>
          </dl>
          {p.notes && (
            <div>
              <h3 style={{ marginBottom: 6 }}>Pastoral notes</h3>
              <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{p.notes}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function PersonForm({ person, onClose, onSaved }: { person: Person | null; onClose: () => void; onSaved: (p: Person) => void }) {
  const [form, setForm] = useState<PersonInput>(() => ({
    firstName: person?.firstName ?? '',
    lastName: person?.lastName ?? '',
    phone: person?.phone ?? '',
    email: person?.email ?? '',
    status: person?.status ?? 'visitor',
    gender: person?.gender ?? null,
    birthDate: person?.birthDate ?? '',
    householdName: person?.householdName ?? '',
    address: person?.address ?? '',
    language: person?.language ?? 'en',
    tags: person?.tags ?? [],
    notes: person?.notes ?? '',
  }));
  const [tags, setTags] = useState((person?.tags ?? []).join(', '));
  const save = useAction(async (input: PersonInput) => (person ? AdminApi.people.update(person.id, input) : AdminApi.people.create(input)));
  const set = <K extends keyof PersonInput>(k: K, v: PersonInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fe = save.error?.fields ?? {};

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const clean = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])) as PersonInput;
    clean.tags = tags.split(',').map((t) => t.trim()).filter(Boolean);
    const saved = await save.run(clean);
    if (saved) onSaved(saved);
  }

  return (
    <Modal title={person ? `Edit ${person.firstName}` : 'Add a person'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="person-form" disabled={save.busy}>{save.busy ? 'Saving…' : 'Save'}</button></>}
    >
      <form id="person-form" className="stack" onSubmit={onSubmit}>
        <FormError error={save.error?.fields ? null : save.error} />
        <div className="grid cols-2">
          <Field label="First name" error={fe.firstName}><input className="input" autoFocus value={form.firstName} onChange={(e) => set('firstName', e.target.value)} /></Field>
          <Field label="Last name" error={fe.lastName}><input className="input" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
          <Field label="Mobile" hint="Used for sign-in and WhatsApp"><input className="input" type="tel" placeholder="+91 98765 43210" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><input className="input" type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Status">
            <select className="select" value={form.status} onChange={(e) => set('status', e.target.value as PersonStatus)}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Gender">
            <select className="select" value={form.gender ?? ''} onChange={(e) => set('gender', (e.target.value || null) as Person['gender'])}>
              <option value="">Not set</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </Field>
          <Field label="Birth date"><input className="input" type="date" value={form.birthDate ?? ''} onChange={(e) => set('birthDate', e.target.value)} /></Field>
          <Field label="Household" hint="e.g. Thomas family"><input className="input" value={form.householdName ?? ''} onChange={(e) => set('householdName', e.target.value)} /></Field>
          <Field label="Preferred language">
            <select className="select" value={form.language} onChange={(e) => set('language', e.target.value as Person['language'])}>
              <option value="en">English</option>
              <option value="hi">हिन्दी (Hindi)</option>
            </select>
          </Field>
          <Field label="Tags" hint="Comma separated, e.g. Choir, Usher"><input className="input" value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
        </div>
        <Field label="Address"><input className="input" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Pastoral notes" hint="Only visible to staff"><textarea className="textarea" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}
