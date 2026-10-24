import { CalendarCheck, Camera, Copy, Download, FileText, Gift, HandHeart, HeartHandshake, Pencil, Plus, Search, Trash2, Upload, Users } from 'lucide-react';
import { FilterButton } from '@/components/filters';
import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import type { Consent, LanguageCode, Person, PersonInput, PersonStatus } from '@/api/admin-types';
import { languages } from '@/i18n';
import { useCan } from '@/lib/perms';
import { AdminApi } from '@/api/endpoints';
import { Avatar, Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { PhotoEditor } from '@/components/photo-editor';
import { setFace } from '@/lib/faces';
import { downloadCsv, formatDate, formatDay, formatMoney, formatNumber, formatRelative } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { asChoice, RolePicker, toChoice, type Choice } from '../components/role-picker';
import { PageHeader } from '../layout';
import { StatementModal } from './giving';

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
  const [tag, setTag] = useState('');
  const [campusId, setCampusId] = useState('');
  const [zoneId, setZoneId] = useState(params.get('zone') ?? '');
  const [dupes, setDupes] = useState(false);
  const tags = useApi(AdminApi.people.tags);
  const campuses = useApi(AdminApi.campuses.list);
  const zones = useApi(AdminApi.zones.list);
  const can = useCan();
  const [extra, setExtra] = useState<Person[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editing, setEditing] = useState<Person | 'new' | null>(params.get('new') ? 'new' : null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const list = useApi(async () => {
    const page = await AdminApi.people.list({ q: debounced, status, tag, campusId, zoneId: zoneId || undefined });
    setExtra([]);
    setCursor(page.nextCursor);
    return page;
  }, [debounced, status, tag, campusId, zoneId]);

  const people = [...(list.data?.data ?? []), ...extra];

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await AdminApi.people.list({ q: debounced, status, tag, campusId, zoneId: zoneId || undefined, cursor });
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
      const page = await AdminApi.people.list({ q: debounced, status, tag, campusId, zoneId: zoneId || undefined, cursor: next ?? undefined });
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
            {can('people.edit') && <button className="btn" onClick={() => setDupes(true)}><Copy size={16} /> Duplicates</button>}
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
          <FilterButton
            filters={[
              { key: 'status', label: 'Status', value: status, onChange: (v) => setStatus(v as PersonStatus | ''), options: [{ value: '', label: 'All statuses' }, ...Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label }))] },
              { key: 'tag', label: 'Tag', value: tag, onChange: setTag, hidden: !tags.data?.length, options: [{ value: '', label: 'All tags' }, ...(tags.data ?? []).map((t) => ({ value: t.tag, label: `${t.tag} (${t.count})` }))] },
              { key: 'campus', label: 'Campus', value: campusId, onChange: setCampusId, hidden: (campuses.data?.length ?? 0) < 2, options: [{ value: '', label: 'All campuses' }, ...(campuses.data ?? []).map((c) => ({ value: c.id, label: c.name }))] },
              { key: 'zone', label: 'Zone', value: zoneId, onChange: setZoneId, hidden: !zones.data?.length, options: [{ value: '', label: 'All zones' }, { value: 'none', label: 'No zone' }, ...(zones.data ?? []).map((z) => ({ value: z.id, label: z.name }))] },
            ]}
          />
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
                        <Avatar name={`${p.firstName} ${p.lastName}`} person={p} />
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
          onOpen={(pid) => navigate(`/admin/people/${pid}`)}
          onDeleted={() => {
            navigate('/admin/people');
            list.reload();
          }}
        />
      )}
      {dupes && <DuplicatesModal onClose={() => setDupes(false)} onMerged={() => list.reload()} />}
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

const CONSENT_LABELS: Record<keyof Consent, string> = { email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp', directory: 'Directory listing' };

function PersonDrawer({ id, onClose, onEdit, onDeleted, onOpen }: { id: string; onClose: () => void; onEdit: (p: Person) => void; onDeleted: () => void; onOpen: (id: string) => void }) {
  const { data, error, reload } = useApi(() => AdminApi.people.timeline(id), [id]);
  const campuses = useApi(AdminApi.campuses.list);
  const zones = useApi(AdminApi.zones.list);
  const fields = useApi(AdminApi.fields.list);
  const [tab, setTab] = useState<'profile' | 'activity'>('profile');
  const [statement, setStatement] = useState(false);
  const toast = useToast();
  const can = useCan();
  const remove = useAction(AdminApi.people.remove);
  const [photoOpen, setPhotoOpen] = useState(false);
  const p = data?.person;

  async function openCase() {
    if (!p) return;
    const c = await AdminApi.care.create({ personId: p.id, title: `Follow up with ${p.firstName}`, type: 'follow_up', priority: 'normal', assignedTo: null, dueAt: null, confidential: false });
    toast('Care case opened');
    reload();
    return c;
  }

  return (
    <Modal side title="Person" onClose={onClose}
      footer={p && (
        <>
          {can('people.edit') && <button className="btn danger" disabled={remove.busy} onClick={async () => {
            if (!confirm(`Remove ${p.firstName} ${p.lastName}? This cannot be undone.`)) return;
            if ((await remove.run(p.id)) === undefined && remove.error) return;
            toast('Removed');
            onDeleted();
          }}><Trash2 size={16} /> Remove</button>}
          {can('people.edit') && <button className="btn primary" onClick={() => onEdit(p)}><Pencil size={16} /> Edit</button>}
        </>
      )}
    >
      {error ? <ErrorState error={error} onRetry={reload} /> : !data || !p ? <Loading /> : (
        <div className="stack lg">
          <div className="row">
            {can('people.edit') ? (
              <button className="avatar-edit" onClick={() => setPhotoOpen(true)} aria-label="Change picture" title="Change picture">
                <Avatar name={`${p.firstName} ${p.lastName}`} person={p} size="lg" />
                <span className="badge-cam"><Camera size={12} /></span>
              </button>
            ) : <Avatar name={`${p.firstName} ${p.lastName}`} person={p} size="lg" />}
            {photoOpen && (
              <PhotoEditor who={{ id: p.id, name: `${p.firstName} ${p.lastName}`, photoUrl: p.photoUrl, avatar: p.avatar }} onClose={() => setPhotoOpen(false)}
                onSavePhoto={async (img) => { const r = await AdminApi.people.setPhoto(p.id, img); setFace(p.id, { p: r.photoUrl, a: r.avatar }); reload(); }}
                onRemovePhoto={async () => { const r = await AdminApi.people.removePhoto(p.id); setFace(p.id, { p: r.photoUrl, a: r.avatar }); reload(); }}
                onPickAvatar={async (n) => { const r = await AdminApi.people.setAvatar(p.id, n); setFace(p.id, { p: r.photoUrl, a: r.avatar }); reload(); }} />
            )}
            <div className="grow">
              <h2>{p.firstName} {p.lastName}</h2>
              <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                <span className={`badge ${STATUS[p.status].tone}`}>{STATUS[p.status].label}</span>
                {p.allergies && <span className="badge danger">Allergy: {p.allergies}</span>}
                {p.tags.map((t) => <span key={t} className="badge gray">{t}</span>)}
              </div>
            </div>
          </div>
          <FormError error={remove.error} />
          <div className="row wrap" style={{ gap: 8 }}>
            {p.phone && <a className="btn sm" href={`https://wa.me/${p.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a>}
            {p.phone && <a className="btn sm" href={`tel:${p.phone.replace(/\s/g, '')}`}>Call</a>}
            {p.email && <a className="btn sm" href={`mailto:${p.email}`}>Email</a>}
            {can('care') && <button className="btn sm" onClick={openCase}><HeartHandshake size={14} /> Open care case</button>}
            {can('giving.view') && <button className="btn sm" onClick={() => setStatement(true)}><FileText size={14} /> 80G statement</button>}
          </div>
          <div className="tabs">
            <button className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}>Profile</button>
            <button className={tab === 'activity' ? 'on' : ''} onClick={() => setTab('activity')}>Activity</button>
          </div>
          {tab === 'profile' ? (
            <>
              <dl className="detail-grid">
                <dt>Mobile</dt><dd className="mono">{p.phone ?? '—'}</dd>
                <dt>Email</dt><dd>{p.email ?? '—'}</dd>
                <dt>Household</dt><dd>{p.householdName ?? '—'}</dd>
                {p.zoneId && zones.data && <><dt>Zone</dt><dd><Link to={`/admin/zones?zone=${p.zoneId}`}>{zones.data.find((z) => z.id === p.zoneId)?.name ?? '—'}</Link></dd></>}
                {campuses.data && campuses.data.length > 0 && <><dt>Campus</dt><dd>{campuses.data.find((c) => c.id === p.campusId)?.name ?? '—'}</dd></>}
                <dt>Birthday</dt><dd>{p.birthDate ? formatDate(p.birthDate) : '—'}</dd>
                <dt>Anniversary</dt><dd>{p.anniversary ? formatDate(p.anniversary) : '—'}</dd>
                <dt>Baptised</dt><dd>{p.baptismDate ? formatDate(p.baptismDate) : '—'}</dd>
                <dt>Address</dt><dd>{p.address ?? '—'}</dd>
                <dt>Language</dt><dd>{languages[p.language]?.label ?? p.language}</dd>
                <dt>Groups</dt><dd>{p.groups.length ? p.groups.map((g) => g.name).join(', ') : '—'}</dd>
                <dt>Check-in code</dt><dd><span className="kbd">{p.checkinCode}</span></dd>
                <dt>Consent</dt><dd className="row wrap" style={{ gap: 4 }}>{(Object.keys(CONSENT_LABELS) as (keyof Consent)[]).map((k) => <span key={k} className={`badge ${p.consent[k] ? 'ok' : 'gray'}`}>{p.consent[k] ? '✓' : '✕'} {CONSENT_LABELS[k]}</span>)}{p.prayerChain && <span className="badge">🙏 Prayer chain</span>}</dd>
                {fields.data?.filter((f) => p.custom?.[f.id] !== undefined && p.custom?.[f.id] !== null && p.custom?.[f.id] !== '').map((f) => <Fragment key={f.id}><dt>{f.label}</dt><dd>{p.custom![f.id] === true ? 'Yes' : p.custom![f.id] === false ? 'No' : String(p.custom![f.id])}</dd></Fragment>)}
                <dt>Added</dt><dd>{formatDate(p.joinedAt)}</dd>
                <dt>Last attended</dt><dd>{p.lastAttendedAt ? formatRelative(p.lastAttendedAt) : 'Never'}</dd>
              </dl>
              {p.medicalNotes && <div className="alert warn"><b>Medical notes:</b> {p.medicalNotes}</div>}
              <PersonWorkflows personId={p.id} />
              {data.household.length > 0 && (
                <div className="stack" style={{ gap: 8 }}>
                  <span className="section-title">{p.householdName ?? 'Household'}</span>
                  <div className="card">
                    {data.household.map((h) => (
                      <button key={h.id} className="list-row picker-item" style={{ borderRadius: 0 }} onClick={() => onOpen(h.id)}>
                        <Avatar name={h.name} />
                        <span className="grow" style={{ fontWeight: 600 }}>{h.name}</span>
                        {h.age !== null && <span className="small muted">{h.age} yrs</span>}
                        <span className={`badge ${STATUS[h.status].tone}`}>{STATUS[h.status].label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {p.notes && (
                <div>
                  <span className="section-title">Pastoral notes</span>
                  <p className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{p.notes}</p>
                </div>
              )}
            </>
          ) : (
            <Activity data={data} />
          )}
        </div>
      )}
      {statement && p && <StatementModal personId={p.id} onClose={() => setStatement(false)} />}
    </Modal>
  );
}

function Activity({ data }: { data: NonNullable<ReturnType<typeof useApi<import('@/api/admin-types').PersonTimeline>>['data']> }) {
  const can = useCan();
  return (
    <div className="stack lg">
      {data.giving && can('giving.view') && (
        <div className="stat-row">
          <div className="card mini-stat"><b>{formatMoney(data.giving.thisYear, 'INR')}</b><span>Given this financial year</span></div>
          <div className="card mini-stat"><b>{data.giving.lastGiftAt ? formatRelative(data.giving.lastGiftAt) : '—'}</b><span>{data.giving.recurring ? 'Last gift · gives monthly' : 'Last gift'}</span></div>
        </div>
      )}
      <div className="stack" style={{ gap: 8 }}>
        <span className="section-title"><CalendarCheck size={13} /> Attendance ({data.attendance.length})</span>
        {data.attendance.length === 0 ? <p className="small muted">No check-ins yet.</p> : (
          <div className="card">{data.attendance.slice(0, 10).map((a) => <div key={a.eventId} className="list-row small"><span className="grow">{a.title}</span><span className="muted">{formatDay(a.at)}</span></div>)}</div>
        )}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span className="section-title"><HandHeart size={13} /> Serving</span>
        {data.serving.length === 0 ? <p className="small muted">Not scheduled to serve.</p> : (
          <div className="card">{data.serving.map((s, i) => <div key={i} className="list-row small"><span className="grow"><b>{s.teamName}</b> · {s.positionName} at {s.eventTitle}</span><span className="muted">{formatDay(s.startsAt)}</span><span className={`badge ${s.status === 'accepted' ? 'ok' : s.status === 'declined' ? 'danger' : 'warn'}`}>{s.status}</span></div>)}</div>
        )}
      </div>
      {can('care') && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="section-title"><HeartHandshake size={13} /> Care</span>
          {data.care.length === 0 ? <p className="small muted">No care cases.</p> : (
            <div className="card">{data.care.map((c) => <Link key={c.id} to={`/admin/care?case=${c.id}`} className="list-row small" style={{ color: 'inherit' }}><span className="grow">{c.title}</span><span className="muted">{formatRelative(c.createdAt)}</span><span className={`badge ${c.status === 'closed' ? 'gray' : 'warn'}`}>{c.status.replace('_', ' ')}</span></Link>)}</div>
          )}
        </div>
      )}
      {!data.giving && can('giving.view') && <p className="small muted"><Gift size={13} /> No gifts recorded.</p>}
    </div>
  );
}

function DuplicatesModal({ onClose, onMerged }: { onClose: () => void; onMerged: () => void }) {
  const { data, error, reload } = useApi(AdminApi.people.duplicates);
  const toast = useToast();
  async function merge(keepId: string, mergeId: string, keepName: string) {
    if (!confirm(`Merge into ${keepName}? Attendance, giving, groups and serving history move across. The other record is deleted.`)) return;
    await AdminApi.people.merge(keepId, mergeId);
    toast('Merged');
    reload();
    onMerged();
  }
  return (
    <Modal title="Possible duplicates" onClose={onClose}>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? <Empty icon={<Copy size={28} />} title="No duplicates found" body="We check for the same phone, email, or name and birthday." /> : (
        <div className="stack">
          {data.map((d, i) => (
            <div key={i} className="card">
              <div className="card-head"><span className="small muted">{d.reason}</span></div>
              {d.people.map((p, j) => (
                <div key={p.id} className="list-row">
                  <div className="grow">
                    <b>{p.name}</b>
                    <div className="small muted">{[p.phone, p.email].filter(Boolean).join(' · ') || 'No contact details'}</div>
                  </div>
                  {d.people.length === 2 && <button className="btn sm" onClick={() => merge(p.id, d.people[1 - j].id, p.name)}>Keep this one</button>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function PersonForm({ person, onClose, onSaved }: { person: Person | null; onClose: () => void; onSaved: (p: Person) => void }) {
  const campuses = useApi(AdminApi.campuses.list);
  const zones = useApi(AdminApi.zones.list);
  const [form, setForm] = useState<PersonInput>(() => ({
    firstName: person?.firstName ?? '',
    lastName: person?.lastName ?? '',
    phone: person?.phone ?? '',
    email: person?.email ?? '',
    status: person?.status ?? 'visitor',
    gender: person?.gender ?? null,
    birthDate: person?.birthDate ?? '',
    anniversary: person?.anniversary ?? '',
    baptismDate: person?.baptismDate ?? '',
    householdName: person?.householdName ?? '',
    address: person?.address ?? '',
    language: person?.language ?? 'en',
    campusId: person?.campusId ?? null,
    zoneId: person?.zoneId ?? null,
    tags: person?.tags ?? [],
    notes: person?.notes ?? '',
    allergies: person?.allergies ?? '',
    medicalNotes: person?.medicalNotes ?? '',
    consent: person?.consent ?? { email: true, sms: true, whatsapp: true, directory: false },
    prayerChain: person?.prayerChain ?? false,
    custom: person?.custom ?? {},
  }));
  const fields = useApi(AdminApi.fields.list);
  const [section, setSection] = useState<'basics' | 'family' | 'privacy' | 'access' | 'more'>('basics');
  const can = useCan();
  const [tags, setTags] = useState((person?.tags ?? []).join(', '));
  const save = useAction(async (input: PersonInput) => (person ? AdminApi.people.update(person.id, input) : AdminApi.people.create(input)));
  const set = <K extends keyof PersonInput>(k: K, v: PersonInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fe = save.error?.fields ?? {};
  const consent = form.consent!;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const clean = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])) as PersonInput;
    clean.custom = form.custom ?? {};
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
        <Segmented value={section} onChange={setSection} options={[{ value: 'basics', label: 'Basics' }, { value: 'family', label: 'Family & health' }, { value: 'privacy', label: 'Privacy & notes' }, ...(can('staff') ? [{ value: 'access' as const, label: 'Access' }] : []), ...((fields.data?.length ?? 0) > 0 ? [{ value: 'more' as const, label: 'More' }] : [])]} />
        {section === 'access' && (person ? <AccessPane person={person} /> : <p className="small muted">Save the person first, then come back here to give them office access.</p>)}
        {section === 'more' && (
          <div className="grid cols-2">
            {fields.data?.map((f) => {
              const v = form.custom?.[f.id];
              const setV = (value: string | number | boolean | null) => set('custom', { ...(form.custom ?? {}), [f.id]: value });
              if (f.type === 'checkbox') return <label key={f.id} className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={!!v} onChange={(e) => setV(e.target.checked)} /> {f.label}</label>;
              if (f.type === 'select') return <Field key={f.id} label={f.label}><select className="select" value={String(v ?? '')} onChange={(e) => setV(e.target.value || null)}><option value="">Not set</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select></Field>;
              return <Field key={f.id} label={f.label}><input className="input" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={v === null || v === undefined ? '' : String(v)} onChange={(e) => setV(e.target.value === '' ? null : f.type === 'number' ? Number(e.target.value) : e.target.value)} /></Field>;
            })}
          </div>
        )}
        {section === 'basics' && (
          <div className="grid cols-2">
            <Field label="First name *" error={fe.firstName}><input className="input" autoFocus required value={form.firstName ?? ''} onChange={(e) => set('firstName', e.target.value)} /></Field>
            <Field label="Last name *" error={fe.lastName}><input className="input" required value={form.lastName ?? ''} onChange={(e) => set('lastName', e.target.value)} /></Field>
            <Field label="Email" hint="Used for app sign-in codes"><input className="input" type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Mobile" hint="For calls, SMS and WhatsApp"><input className="input" type="tel" placeholder="+91 98765 43210" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
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
            <Field label="Preferred language">
              <select className="select" value={form.language} onChange={(e) => set('language', e.target.value as LanguageCode)}>
                {(Object.keys(languages) as LanguageCode[]).map((l) => <option key={l} value={l}>{languages[l].label}</option>)}
              </select>
            </Field>
            {(campuses.data?.length ?? 0) > 0 && (
              <Field label="Campus">
                <select className="select" value={form.campusId ?? ''} onChange={(e) => set('campusId', e.target.value || null)}>
                  <option value="">Not set</option>
                  {campuses.data!.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
            {(zones.data?.length ?? 0) > 0 && (
              <Field label="Zone" hint="The whole household moves with them on the Zones page">
                <select className="select" value={form.zoneId ?? ''} onChange={(e) => set('zoneId', e.target.value || null)}>
                  <option value="">Not set</option>
                  {zones.data!.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Tags" hint="Comma separated, e.g. Choir, Usher"><input className="input" value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
          </div>
        )}
        {section === 'family' && (
          <div className="grid cols-2">
            <Field label="Household" hint="Same name links a family, e.g. Thomas family"><input className="input" value={form.householdName ?? ''} onChange={(e) => set('householdName', e.target.value)} /></Field>
            <Field label="Wedding anniversary"><input className="input" type="date" value={form.anniversary ?? ''} onChange={(e) => set('anniversary', e.target.value)} /></Field>
            <Field label="Baptism date"><input className="input" type="date" value={form.baptismDate ?? ''} onChange={(e) => set('baptismDate', e.target.value)} /></Field>
            <Field label="Allergies" hint="Printed on kids' check-in labels"><input className="input" value={form.allergies ?? ''} onChange={(e) => set('allergies', e.target.value)} placeholder="Peanuts" /></Field>
            <div style={{ gridColumn: '1 / -1' }}><Field label="Address"><input className="input" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field></div>
            <div style={{ gridColumn: '1 / -1' }}><Field label="Medical notes" hint="Only visible to staff"><textarea className="textarea" style={{ minHeight: 70 }} value={form.medicalNotes ?? ''} onChange={(e) => set('medicalNotes', e.target.value)} /></Field></div>
          </div>
        )}
        {section === 'privacy' && (
          <div className="stack">
            <p className="small muted">Consent under India's DPDP Act. Messages are only sent on channels the person has agreed to.</p>
            {(Object.keys(CONSENT_LABELS) as (keyof Consent)[]).map((k) => (
              <label key={k} className="check">
                <input type="checkbox" checked={consent[k]} onChange={(e) => set('consent', { ...consent, [k]: e.target.checked })} />
                <span>{k === 'directory' ? 'Show in the member directory' : `OK to receive ${CONSENT_LABELS[k]}`}</span>
              </label>
            ))}
            <label className="check">
              <input type="checkbox" checked={!!form.prayerChain} onChange={(e) => set('prayerChain', e.target.checked)} />
              <span>On the prayer chain <span className="small muted">(gets prayer requests the office sends out)</span></span>
            </label>
            <Field label="Pastoral notes" hint="Only visible to staff"><textarea className="textarea" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
          </div>
        )}
      </form>
    </Modal>
  );
}

/** Follow-up workflows this person is on, with a quick way to add them to one. */
function PersonWorkflows({ personId }: { personId: string }) {
  const cards = useApi(() => AdminApi.workflows.cards({ personId }), [personId]);
  const workflows = useApi(AdminApi.workflows.list);
  const can = useCan();
  const toast = useToast();
  const active = (cards.data ?? []).filter((c) => c.status === 'active');
  if (!can('people.edit', 'care') && !active.length) return null;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <span className="section-title">Follow-up workflows</span>
      {active.map((c) => (
        <div key={c.id} className="card card-pad row" style={{ gap: 8 }}>
          <div className="grow">
            <div style={{ fontWeight: 600 }}>{c.workflowName}</div>
            <div className="small muted">Step {c.stepIndex + 1}: {c.stepTitle}{c.assigneeName ? ` · ${c.assigneeName}` : ''} · {c.overdue ? <span style={{ color: 'var(--danger)' }}>overdue</span> : `due ${formatRelative(c.dueAt)}`}</div>
          </div>
          {can('people.edit', 'care') && <button className="btn sm" onClick={async () => { await AdminApi.workflows.act(c.id, 'advance'); cards.reload(); toast('Step done'); }}>Done, next step</button>}
        </div>
      ))}
      {can('people.edit', 'care') && (workflows.data?.length ?? 0) > 0 && (
        <select className="select" value="" onChange={async (e) => { if (!e.target.value) return; await AdminApi.workflows.add(e.target.value, { personIds: [personId] }); cards.reload(); toast('Added to workflow'); }}>
          <option value="">Add to a workflow…</option>
          {workflows.data!.filter((w) => w.active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      )}
    </div>
  );
}

/** Office access from the person's record: a role (built-in or the church's own) and, for scoped roles, the zones, groups or teams. */
function AccessPane({ person }: { person: Person }) {
  const access = useApi(() => AdminApi.staff.accessOf(person.id), [person.id]);
  const roles = useApi(AdminApi.roles.list);
  const [choice, setChoice] = useState<Choice | null>(null);
  const toast = useToast();
  const current = choice ?? asChoice(access.data ?? null);
  const save = useAction(async () => {
    const next = await AdminApi.staff.setAccess(person.id, toChoice(current));
    access.setData(next);
    setChoice(null);
    toast(next.staffId ? `${person.firstName} can now sign in to the office as ${next.roleName}` : `${person.firstName} no longer has office access`);
  });
  if (access.error) return <ErrorState error={access.error} onRetry={access.reload} />;
  if (!access.data || !roles.data) return <Loading />;
  const a = access.data;
  return (
    <div className="stack">
      {a.role === 'owner' ? <div className="alert">{person.firstName} is the church owner. Ownership is changed in Settings › Team.</div> : (
        <>
          <p className="small muted">{a.staffId ? <>Signs in to the office with <b>{a.email}</b>{a.status === 'invited' ? ' (invited, not signed in yet)' : ''}.</> : person.email ? <>Give {person.firstName} a role and they can sign in to the church office with {person.email}.</> : <>Add an email on the Basics tab first; the office sign-in code goes there.</>}</p>
          <RolePicker value={current} onChange={setChoice} roles={roles.data} allowNone />
          <div className="row" style={{ gap: 8 }}>
            <FormError error={save.error} />
            <span className="grow" />
            <button type="button" className="btn primary" disabled={save.busy || !choice || (current.role !== 'none' && !person.email)} onClick={() => void save.run()}>{save.busy ? 'Saving…' : 'Save access'}</button>
          </div>
        </>
      )}
    </div>
  );
}
