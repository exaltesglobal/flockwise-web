import { Bell, Clock, Copy, FileText, Inbox, Mail, MessageCircle, Pencil, Plus, Send, Smartphone, Trash2, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import type { Audience, AudiencePreview, AudienceType, Automation, Automations, Channel, Message, Template } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { demoOutbox } from '@/api/mock';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { isUsingMocks } from '@/lib/config';
import { formatDate, formatRelative, formatTime, toLocalInput } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

import { AiWriter } from '../ai';

import { PersonSearch, type PickedPerson } from '../components/person-picker';
import { PageHeader } from '../layout';

type Tab = 'history' | 'templates' | 'automations' | 'outbox';

const CHANNELS: { value: Channel; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
];
const CHANNEL_ICON: Record<Channel | 'push', typeof Mail> = { email: Mail, sms: Smartphone, whatsapp: MessageCircle, push: Bell };
const MERGE_FIELDS = ['{{firstName}}', '{{lastName}}', '{{fullName}}', '{{church}}', '{{appLink}}'];
const AUDIENCE_TYPES: { value: AudienceType; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'status', label: 'By status' },
  { value: 'group', label: 'A group' },
  { value: 'team', label: 'A serving team' },
  { value: 'tag', label: 'A tag' },
  { value: 'campus', label: 'A campus' },
  { value: 'event', label: 'Event RSVPs' },
  { value: 'list', label: 'A smart list' },
  { value: 'people', label: 'Chosen people' },
];
const STATUSES = [
  { id: 'member', name: 'Members' },
  { id: 'regular', name: 'Regulars' },
  { id: 'visitor', name: 'Visitors' },
  { id: 'inactive', name: 'Inactive' },
];

export function MessagesPage() {
  const [tab, setTab] = useState<Tab>('history');
  // Opening /admin/messages?list=<id> starts a message to that smart list.
  const [composing, setComposing] = useState<Partial<Message> | null>(() => {
    const listId = new URLSearchParams(window.location.search).get('list');
    return listId ? { audience: { type: 'list', ids: [listId] } } : null;
  });
  const channels = useApi(AdminApi.messages.channels);
  const can = useCan();
  const list = useApi(AdminApi.messages.list);
  const toast = useToast();

  const tabs: { id: Tab; label: string }[] = [
    { id: 'history', label: 'Sent & scheduled' },
    { id: 'templates', label: 'Templates' },
    { id: 'automations', label: 'Automations' },
    ...(isUsingMocks() ? [{ id: 'outbox' as Tab, label: 'Demo outbox' }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Messages"
        subtitle="Email, SMS and WhatsApp to your whole church or just the people who need it. Consent is respected automatically."
        actions={<button className="btn primary" onClick={() => setComposing({})}><Plus size={16} /> New message</button>}
      />
      {channels.data && (
        <div className="stat-row" style={{ marginBottom: 16 }}>
          {CHANNELS.map((c) => {
            const s = channels.data![c.value];
            const Icon = CHANNEL_ICON[c.value];
            return (
              <div key={c.value} className="card mini-stat">
                <span className="row small muted" style={{ gap: 6 }}><Icon size={14} /> {c.label}</span>
                <strong className="row" style={{ gap: 6, margin: '4px 0' }}>
                  <span className={`dot ${s.configured ? 'ok' : 'warn'}`} />
                  {s.configured ? s.provider : 'Not connected'}
                </strong>
                {!s.configured && <span className="small muted">Messages are logged, not delivered.</span>}
                {!s.configured && c.value === 'whatsapp' && can('settings') && <Link className="small" to="/admin/settings#integrations">Connect Chitthi</Link>}
              </div>
            );
          })}
        </div>
      )}
      <div className="tabs">
        {tabs.map((t) => <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      {tab === 'history' && (
        <div className="card">
          {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : list.data.data.length === 0 ? (
            <Empty icon={<Send size={32} />} title="No messages yet" body="Send a note to everyone, a group, a serving team or just the visitors from last Sunday." />
          ) : list.data.data.map((m) => (
            <MessageRow key={m.id} m={m}
              onEdit={() => setComposing(m)}
              onDuplicate={() => setComposing({ channel: m.channel, audience: m.audience, subject: m.subject, body: m.body })}
              onDelete={async () => {
                if (!confirm('Delete this message?')) return;
                await AdminApi.messages.remove(m.id);
                toast('Deleted');
                list.reload();
              }}
            />
          ))}
        </div>
      )}
      {tab === 'templates' && <TemplatesPane onUse={(t) => setComposing({ channel: t.channel, subject: t.subject, body: t.body })} />}
      {tab === 'automations' && <AutomationsPane />}
      {tab === 'outbox' && <OutboxPane />}
      {composing && (
        <Composer initial={composing} onClose={() => setComposing(null)}
          onDone={(msg) => { setComposing(null); list.reload(); toast(msg); }} />
      )}
    </>
  );
}

function MessageRow({ m, onEdit, onDuplicate, onDelete }: { m: Message; onEdit: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const Icon = CHANNEL_ICON[m.channel];
  const editable = m.status === 'draft' || m.status === 'scheduled';
  return (
    <div className="list-row" style={{ alignItems: 'flex-start' }}>
      <Icon size={18} className="muted" style={{ marginTop: 3 }} />
      <div className="grow stack" style={{ gap: 4, minWidth: 0 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <h3>{m.subject || m.body.slice(0, 60)}</h3>
          <StatusBadge m={m} />
          {m.source !== 'manual' && <span className="badge gray">{m.source === 'automation' ? 'Automation' : 'System'}</span>}
          {m.simulated && <span className="badge warn" title="No provider was connected for this channel, so delivery was only logged.">Simulated</span>}
        </div>
        <p className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.body}</p>
        <span className="small muted">
          To {m.audienceLabel}
          {m.status === 'sent' && m.sentAt && ` · ${formatRelative(m.sentAt)} · ${m.stats.sent} delivered`}
          {m.status === 'sent' && m.stats.skipped > 0 && `, ${m.stats.skipped} skipped (no consent or contact)`}
          {m.stats.failed > 0 && `, ${m.stats.failed} failed`}
          {m.status === 'scheduled' && m.scheduledAt && ` · goes out ${formatDate(m.scheduledAt)} at ${formatTime(m.scheduledAt)}`}
        </span>
      </div>
      {editable && <button className="btn ghost icon sm" title="Edit" onClick={onEdit}><Pencil size={15} /></button>}
      <button className="btn ghost icon sm" title="Duplicate" onClick={onDuplicate}><Copy size={15} /></button>
      {editable && <button className="btn ghost icon sm danger" title="Delete" onClick={onDelete}><Trash2 size={15} /></button>}
    </div>
  );
}

function StatusBadge({ m }: { m: Message }) {
  switch (m.status) {
    case 'sent': return <span className="badge ok">Sent</span>;
    case 'scheduled': return <span className="badge"><Clock size={12} /> Scheduled</span>;
    case 'sending': return <span className="badge">Sending</span>;
    case 'failed': return <span className="badge danger">Failed</span>;
    default: return <span className="badge gray">Draft</span>;
  }
}

// ---------- composer ----------

function Composer({ initial, onClose, onDone }: { initial: Partial<Message>; onClose: () => void; onDone: (toast: string) => void }) {
  const [channel, setChannel] = useState<Channel>(initial.channel ?? 'whatsapp');
  const [audience, setAudience] = useState<Audience>(initial.audience ?? { type: 'everyone', ids: [] });
  const [subject, setSubject] = useState(initial.subject ?? '');
  const [body, setBody] = useState(initial.body ?? '');
  const [when, setWhen] = useState<'now' | 'later'>(initial.scheduledAt ? 'later' : 'now');
  const [scheduledAt, setScheduledAt] = useState(initial.scheduledAt ? toLocalInput(initial.scheduledAt) : '');
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const templates = useApi(AdminApi.messages.templates);
  const save = useAction((send: boolean) => {
    const input = {
      channel,
      audience,
      subject: channel === 'email' ? subject : undefined,
      body,
      scheduledAt: when === 'later' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      send,
    };
    return initial.id ? AdminApi.messages.update(initial.id, input) : AdminApi.messages.create(input);
  });

  const audienceKey = JSON.stringify(audience);
  useEffect(() => {
    let live = true;
    setPreview(null);
    const needsIds = audience.type !== 'everyone';
    if (needsIds && audience.ids.length === 0) return;
    AdminApi.messages.preview(channel, audience).then((p) => live && setPreview(p)).catch(() => undefined);
    return () => { live = false; };
  }, [channel, audienceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const segments = channel === 'sms' ? Math.max(1, Math.ceil(body.length / 160)) : 0;
  const ready = body.trim() && (channel !== 'email' || subject.trim()) && (audience.type === 'everyone' || audience.ids.length > 0) && (when === 'now' || scheduledAt);

  const submit = async (send: boolean) => {
    const res = await save.run(send);
    if (!res) return;
    if (!send) onDone('Saved as draft');
    else if (res.status === 'scheduled') onDone('Scheduled');
    else onDone(`Sent to ${res.stats.sent} ${res.stats.sent === 1 ? 'person' : 'people'}${res.simulated ? ' (simulated)' : ''}`);
  };

  return (
    <Modal title={initial.id ? 'Edit message' : 'New message'} onClose={onClose} wide
      footer={<>
        <button className="btn" disabled={save.busy || !body.trim()} onClick={() => submit(false)}>Save draft</button>
        <button className="btn primary" disabled={save.busy || !ready} onClick={() => submit(true)}>
          {when === 'later' ? <><Clock size={15} /> Schedule</> : <><Send size={15} /> Send now</>}
        </button>
      </>}
    >
      <div className="stack">
        <FormError error={save.error} />
        <Field label="Channel"><Segmented value={channel} options={CHANNELS} onChange={setChannel} /></Field>
        <AudiencePicker value={audience} onChange={setAudience} />
        {preview && (
          <div className="callout small">
            <strong>{preview.reachable}</strong> of {preview.total} will receive this
            {preview.optedOut > 0 && ` · ${preview.optedOut} opted out of ${channel === 'whatsapp' ? 'WhatsApp' : channel.toUpperCase()}`}
            {preview.noContact > 0 && ` · ${preview.noContact} have no ${channel === 'email' ? 'email' : 'mobile number'}`}
            {preview.sample.length > 0 && <div className="muted" style={{ marginTop: 4 }}>Including {preview.sample.join(', ')}{preview.reachable > preview.sample.length ? '…' : ''}</div>}
          </div>
        )}
        {templates.data && templates.data.some((t) => t.channel === channel) && (
          <Field label="Start from a template">
            <select className="select" value="" onChange={(e) => {
              const t = templates.data!.find((x) => x.id === e.target.value);
              if (t) { setSubject(t.subject); setBody(t.body); }
            }}>
              <option value="">Choose…</option>
              {templates.data.filter((t) => t.channel === channel).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        )}
        {channel === 'email' && <Field label="Subject"><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>}
        <Field label="Message" hint={channel === 'sms' ? `${body.length} characters · ${segments} SMS ${segments === 1 ? 'part' : 'parts'} per person` : undefined}>
          <textarea className="textarea" rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <AiWriter purpose="message" channel={channel} body={body} onDraft={(d) => { if (d.subject && channel === 'email') setSubject(d.subject); setBody(d.text); }} />
        <div className="row wrap small" style={{ gap: 6 }}>
          <span className="muted">Personalise:</span>
          {MERGE_FIELDS.map((f) => <button key={f} type="button" className="chip" onClick={() => setBody((b) => `${b}${f}`)}>{f}</button>)}
        </div>
        <Field label="When">
          <div className="row wrap" style={{ gap: 12 }}>
            <Segmented value={when} options={[{ value: 'now', label: 'Right away' }, { value: 'later', label: 'Later' }]} onChange={setWhen} />
            {when === 'later' && <input className="input" type="datetime-local" style={{ maxWidth: 240 }} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

function AudiencePicker({ value, onChange }: { value: Audience; onChange: (a: Audience) => void }) {
  const [people, setPeople] = useState<PickedPerson[]>([]);
  const options = useOptions(value.type);
  const setType = (type: AudienceType) => { setPeople([]); onChange({ type, ids: [] }); };
  const toggle = (id: string) => onChange({ ...value, ids: value.ids.includes(id) ? value.ids.filter((x) => x !== id) : [...value.ids, id] });

  return (
    <Field label="Send to">
      <div className="stack" style={{ gap: 8 }}>
        <select className="select" value={value.type} onChange={(e) => setType(e.target.value as AudienceType)}>
          {AUDIENCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {value.type === 'people' ? (
          <>
            <div className="chips">
              {people.map((p) => (
                <span key={p.id} className="chip">{p.name}
                  <button type="button" className="link-btn" onClick={() => { setPeople(people.filter((x) => x.id !== p.id)); toggle(p.id); }}>×</button>
                </span>
              ))}
            </div>
            <PersonSearch placeholder="Add a person…" exclude={value.ids} onPick={(p) => { setPeople([...people, p]); toggle(p.id); }} />
          </>
        ) : value.type !== 'everyone' && (
          options === null ? <Loading /> : options.length === 0 ? <span className="small muted">Nothing to choose yet.</span> : (
            <div className="chips">
              {options.map((o) => (
                <button key={o.id} type="button" className={`chip ${value.ids.includes(o.id) ? 'on' : ''}`} onClick={() => toggle(o.id)}>{o.name}</button>
              ))}
            </div>
          )
        )}
      </div>
    </Field>
  );
}

function useOptions(type: AudienceType) {
  const [opts, setOpts] = useState<{ id: string; name: string }[] | null>(null);
  useEffect(() => {
    let live = true;
    setOpts(null);
    const load = async (): Promise<{ id: string; name: string }[]> => {
      switch (type) {
        case 'status': return STATUSES;
        case 'group': return (await AdminApi.groups.list()).data.map((g) => ({ id: g.id, name: g.name }));
        case 'team': return (await AdminApi.volunteers.teams()).map((t) => ({ id: t.id, name: t.name }));
        case 'tag': return (await AdminApi.people.tags()).map((t) => ({ id: t.tag, name: `${t.tag} (${t.count})` }));
        case 'campus': return (await AdminApi.campuses.list()).map((c) => ({ id: c.id, name: c.name }));
        case 'event': return (await AdminApi.events.list('upcoming')).data.map((e) => ({ id: e.id, name: `${e.title} · ${formatDate(e.startsAt)}` }));
        case 'list': return (await AdminApi.lists.list()).map((l) => ({ id: l.id, name: `${l.name} (${l.count})` }));
        default: return [];
      }
    };
    load().then((o) => live && setOpts(o)).catch(() => live && setOpts([]));
    return () => { live = false; };
  }, [type]);
  return opts;
}

// ---------- templates ----------

function TemplatesPane({ onUse }: { onUse: (t: Template) => void }) {
  const { data, error, reload } = useApi(AdminApi.messages.templates);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const toast = useToast();
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <p className="small muted">Reusable messages for things you send often: welcome notes, service reminders, giving thank-yous.</p>
        <button className="btn sm" onClick={() => setEditing('new')}><Plus size={14} /> New template</button>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? (
        <Empty icon={<FileText size={32} />} title="No templates yet" />
      ) : data.map((t) => {
        const Icon = CHANNEL_ICON[t.channel];
        return (
          <div key={t.id} className="list-row">
            <Icon size={18} className="muted" />
            <div className="grow" style={{ minWidth: 0 }}>
              <h3>{t.name}</h3>
              <p className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject ? `${t.subject} · ` : ''}{t.body}</p>
            </div>
            <button className="btn sm" onClick={() => onUse(t)}>Use</button>
            <button className="btn ghost icon sm" title="Edit" onClick={() => setEditing(t)}><Pencil size={15} /></button>
            <button className="btn ghost icon sm danger" title="Delete" onClick={async () => {
              if (!confirm(`Delete “${t.name}”?`)) return;
              await AdminApi.messages.removeTemplate(t.id);
              toast('Deleted');
              reload();
            }}><Trash2 size={15} /></button>
          </div>
        );
      })}
      {editing && <TemplateForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); toast('Saved'); }} />}
    </div>
  );
}

function TemplateForm({ item, onClose, onSaved }: { item: Template | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Omit<Template, 'id'>>({ name: item?.name ?? '', channel: item?.channel ?? 'whatsapp', subject: item?.subject ?? '', body: item?.body ?? '' });
  const save = useAction(() => (item ? AdminApi.messages.updateTemplate(item.id, form) : AdminApi.messages.createTemplate(form)));
  return (
    <Modal title={item ? 'Edit template' : 'New template'} onClose={onClose}
      footer={<button className="btn primary" disabled={save.busy || !form.name.trim() || !form.body.trim()} onClick={async () => { if (await save.run()) onSaved(); }}>Save</button>}>
      <div className="stack">
        <FormError error={save.error} />
        <Field label="Name"><input className="input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Channel"><Segmented value={form.channel} options={CHANNELS} onChange={(channel) => setForm({ ...form, channel })} /></Field>
        {form.channel === 'email' && <Field label="Subject"><input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>}
        <Field label="Message" hint={`Merge fields: ${MERGE_FIELDS.join(' ')}`}><textarea className="textarea" rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

// ---------- automations ----------

type MessageAutomation = Exclude<keyof Automations, 'staffDigest'>;
const AUTOMATION_INFO: Record<MessageAutomation, { title: string; body: string }> = {
  birthday: { title: 'Birthday wishes', body: 'Sent on the morning of each person’s birthday.' },
  anniversary: { title: 'Wedding anniversaries', body: 'Sent to both spouses on their anniversary.' },
  welcome: { title: 'Welcome new visitors', body: 'Sent the day after someone is added as a visitor.' },
  missing: { title: 'We miss you', body: 'Sent when a regular or member hasn’t attended for a few weeks.' },
  volunteerReminder: { title: 'Serving reminders', body: 'Reminds scheduled volunteers before they serve.' },
};

function AutomationsPane() {
  const { data, error, reload } = useApi(AdminApi.messages.automations);
  const [draft, setDraft] = useState<Automations | null>(null);
  const save = useAction((a: Automations) => AdminApi.messages.saveAutomations(a));
  const toast = useToast();
  const can = useCan();
  useEffect(() => { if (data) setDraft(structuredClone(data)); }, [data]);
  const dirty = useMemo(() => draft && data && JSON.stringify(draft) !== JSON.stringify(data), [draft, data]);

  if (error) return <div className="card"><ErrorState error={error} onRetry={reload} /></div>;
  if (!draft) return <div className="card"><Loading /></div>;
  const set = <K extends keyof Automations>(k: K, patch: Partial<Automations[K]>) => setDraft({ ...draft, [k]: { ...draft[k], ...patch } });

  return (
    <div className="stack">
      <FormError error={save.error} />
      {(Object.keys(AUTOMATION_INFO) as MessageAutomation[]).map((k) => {
        const a = draft[k] as Automation & { weeks?: number; daysBefore?: number; createFollowUp?: boolean; askReply?: boolean; assignLeader?: boolean };
        return (
          <div key={k} className="card stack" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 10 }}>
              <Zap size={18} className={a.enabled ? '' : 'muted'} />
              <div className="grow"><h3>{AUTOMATION_INFO[k].title}</h3><p className="small muted">{AUTOMATION_INFO[k].body}</p></div>
              <label className="row small" style={{ gap: 6 }}>
                <input type="checkbox" checked={a.enabled} onChange={(e) => set(k, { enabled: e.target.checked } as never)} /> On
              </label>
            </div>
            {a.enabled && (
              <>
                <div className="row wrap" style={{ gap: 12 }}>
                  <Segmented value={a.channel} options={CHANNELS} onChange={(channel) => set(k, { channel } as never)} />
                  {'weeks' in a && (
                    <label className="row small" style={{ gap: 6 }}>After
                      <input className="input" type="number" min={2} max={12} style={{ width: 70 }} value={a.weeks} onChange={(e) => set(k, { weeks: Number(e.target.value) } as never)} /> weeks away
                    </label>
                  )}
                  {'daysBefore' in a && (
                    <label className="row small" style={{ gap: 6 }}>
                      <input className="input" type="number" min={1} max={7} style={{ width: 70 }} value={a.daysBefore} onChange={(e) => set(k, { daysBefore: Number(e.target.value) } as never)} /> days before
                    </label>
                  )}
                  {'createFollowUp' in a && (
                    <label className="row small" style={{ gap: 6 }}>
                      <input type="checkbox" checked={!!a.createFollowUp} onChange={(e) => set(k, { createFollowUp: e.target.checked } as never)} /> Also open a follow-up care case
                    </label>
                  )}
                </div>
                {k === 'missing' && (
                  <div className="row wrap" style={{ gap: 12 }}>
                    {a.channel === 'whatsapp' && (
                      <label className="row small" style={{ gap: 6 }}>
                        <input type="checkbox" checked={a.askReply !== false} onChange={(e) => set(k, { askReply: e.target.checked } as never)} /> Ask how they are (reply 1 = all well, 2 = travelling, 3 = call me; the answer lands on the care case)
                      </label>
                    )}
                    {a.createFollowUp && (
                      <label className="row small" style={{ gap: 6 }}>
                        <input type="checkbox" checked={a.assignLeader !== false} onChange={(e) => set(k, { assignLeader: e.target.checked } as never)} /> Give the case to their zone leader
                      </label>
                    )}
                  </div>
                )}
                {a.channel === 'email' && <input className="input" placeholder="Subject" value={a.subject} onChange={(e) => set(k, { subject: e.target.value } as never)} />}
                <textarea className="textarea" rows={3} value={a.body} onChange={(e) => set(k, { body: e.target.value } as never)} />
              </>
            )}
          </div>
        );
      })}
      <div className="card stack" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 10 }}>
          <Zap size={18} className={draft.staffDigest.enabled ? '' : 'muted'} />
          <div className="grow">
            <h3>Celebrations digest for staff</h3>
            <p className="small muted">Emails pastors and care staff each morning someone has a birthday or anniversary, and a full list every Monday.</p>
          </div>
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={draft.staffDigest.enabled} onChange={(e) => setDraft({ ...draft, staffDigest: { ...draft.staffDigest, enabled: e.target.checked } })} /> On
          </label>
        </div>
        {draft.staffDigest.enabled && (
          <label className="row small" style={{ gap: 6 }}>Monday list covers the next
            <input className="input" type="number" min={1} max={31} style={{ width: 70 }} value={draft.staffDigest.daysAhead} onChange={(e) => setDraft({ ...draft, staffDigest: { ...draft.staffDigest, daysAhead: Number(e.target.value) } })} /> days
          </label>
        )}
      </div>
      {can('comms') && (
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          {dirty && <button className="btn" onClick={() => setDraft(structuredClone(data!))}>Discard changes</button>}
          <button className="btn primary" disabled={!dirty || save.busy} onClick={async () => { if (await save.run(draft)) { toast('Automations saved'); reload(); } }}>Save automations</button>
        </div>
      )}
    </div>
  );
}

// ---------- demo outbox ----------

function OutboxPane() {
  const [items, setItems] = useState(demoOutbox);
  useEffect(() => {
    const t = setInterval(() => setItems(demoOutbox()), 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="card">
      <p className="small muted" style={{ marginBottom: 8 }}>In demo mode nothing leaves your browser. Every email, SMS and WhatsApp the system would send shows up here, including sign-in codes and automations.</p>
      {items.length === 0 ? <Empty icon={<Inbox size={32} />} title="Nothing sent yet" /> : items.slice(0, 100).map((m, i) => {
        const Icon = CHANNEL_ICON[m.channel];
        return (
          <div key={i} className="list-row" style={{ alignItems: 'flex-start' }}>
            <Icon size={16} className="muted" style={{ marginTop: 3 }} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="small"><strong>{m.to}</strong>{m.subject && <span className="muted"> · {m.subject}</span>}</div>
              <p className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{m.text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
