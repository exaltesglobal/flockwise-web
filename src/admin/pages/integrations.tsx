// Settings › Integrations: WhatsApp through Chitthi, the WhatsApp assistant, API keys, and connecting AI assistants (MCP).
import { Bot, CalendarPlus, Check, Copy, KeyRound, Mail, MessageCircle, MessagesSquare, Plus, Power, RefreshCw, Send, Trash2, Unplug } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { ApiKeyView, BotIntent, ChitthiStatus, ChitthiTemplate, EmailAccountStatus, WaBotStatus } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { getApiUrl } from '@/lib/config';
import { formatRelative } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { ConnectionCards } from './connections';

/** Copies text, falling back to selecting it when the browser refuses. */
function CopyField({ value, label, secret = false }: { value: string; label: string; secret?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = (el: HTMLInputElement | null) => {
    navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }, () => el?.select());
  };
  let input: HTMLInputElement | null = null;
  return (
    <div className="row" style={{ gap: 6 }}>
      <input ref={(el) => { input = el; }} className={`input grow mono small ${secret ? 'secret' : ''}`} value={value} readOnly aria-label={label} onFocus={(e) => e.target.select()} />
      <button className="btn sm" type="button" onClick={() => copy(input)}>{done ? <Check size={14} /> : <Copy size={14} />} {done ? 'Copied' : 'Copy'}</button>
    </div>
  );
}

export function IntegrationsSettings() {
  const [chitthiOn, setChitthiOn] = useState<boolean | null>(null);
  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="int-grid">
        <EmailCard />
        <ChitthiCard onChange={setChitthiOn} />
        <WhatsAppBotCard key={String(chitthiOn)} />
        <ConnectionCards />
      </div>
      <CalendarLinksCard />
      <ApiKeysCard />
    </div>
  );
}

// ---------------------------------------------------------------- calendar subscribe links

function CalendarLinksCard() {
  const { data, error, reload, setData } = useApi(AdminApi.calendarLinks.feeds);
  const toast = useToast();
  const reset = useAction((id: string) => AdminApi.calendarLinks.reset(id));
  const [open, setOpen] = useState<string | null>(null);
  const rows = data ? [data.church, ...data.teams] : [];
  return (
    <div className="card">
      <div className="card-head"><h2><CalendarPlus size={18} /> Calendar subscribe links</h2><span className="small muted">Google, Apple and Outlook calendars refresh these on their own: every service and event for the church, and each team's rota and rehearsals. Members get their own link under Events in the app.</span></div>
      {error ? <div className="card-body"><FormError error={error} /></div> : !data ? <div className="card-body"><Loading /></div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Calendar</th><th>Add to</th><th /></tr></thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id}>
                  <td><b>{f.name}</b><div className="small muted">{f.kind === 'church' ? 'Every published service and event' : 'Services this team serves at, with who is on, and rehearsals'}</div>{open === f.id && <div style={{ marginTop: 6, maxWidth: 520 }}><CopyField value={f.url} label={`${f.name} calendar link`} /></div>}</td>
                  <td className="nowrap">
                    <div className="row wrap" style={{ gap: 6 }}>
                      <a className="btn sm" href={f.google} target="_blank" rel="noreferrer">Google</a>
                      <a className="btn sm" href={f.webcal}>Apple / Outlook</a>
                      <button className="btn sm ghost" onClick={() => setOpen(open === f.id ? null : f.id)}><Copy size={14} /> Link</button>
                    </div>
                  </td>
                  <td className="nowrap"><button className="btn ghost sm" disabled={reset.busy} onClick={async () => { if (window.confirm('Make a new link? Anyone using the old one stops getting updates.')) { const r = await reset.run(f.id); if (r) { setData({ church: r.kind === 'church' ? r : data.church, teams: data.teams.map((t) => (t.id === r.id ? r : t)) }); toast('New link made'); } } }}><RefreshCw size={14} /> New link</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <FormError error={reset.error} />
          {rows.length === 1 && <div className="card-body small muted">Add teams under Volunteers to get a calendar for each rota.{' '}<button className="linkish" onClick={reload}>Refresh</button></div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the church's own mailbox

const PRESETS: { id: string; label: string; host: string; port: number; hint: string }[] = [
  { id: 'gmail', label: 'Gmail / Google Workspace', host: 'smtp.gmail.com', port: 465, hint: 'Turn on 2-step verification in the Google account, then make an App password (Google Account › Security › App passwords) and paste that here, not the normal password.' },
  { id: 'outlook', label: 'Outlook / Microsoft 365', host: 'smtp.office365.com', port: 587, hint: 'Use the mailbox password, or an app password if the account has two-step sign-in. SMTP AUTH must be allowed for the mailbox in Microsoft 365 admin.' },
  { id: 'hostinger', label: 'Hostinger email', host: 'smtp.hostinger.com', port: 465, hint: 'The mailbox password from hPanel › Emails.' },
  { id: 'zoho', label: 'Zoho Mail', host: 'smtp.zoho.in', port: 465, hint: 'Use an app-specific password from Zoho Accounts › Security.' },
  { id: 'other', label: 'Other SMTP', host: '', port: 465, hint: 'Ask your email provider for the SMTP server and port (465 for SSL, 587 for STARTTLS).' },
];

function EmailCard() {
  const { data, error, reload, setData } = useApi(() => AdminApi.integrations.get(), []);
  const [open, setOpen] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [testTo, setTestTo] = useState('');
  const toast = useToast();
  const test = useAction(() => AdminApi.integrations.testEmail(testTo.trim() || undefined));
  if (error) return <div className="card card-pad"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return <div className="card card-pad"><Loading /></div>;
  const e = data.email;
  const set = (email: EmailAccountStatus) => setData({ ...data, email });
  return (
    <section className="card card-pad stack">
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="int-logo email"><Mail size={22} /></div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>Send from your church’s email</h3>
            {e.connected ? <span className="badge ok">Connected</span> : <span className="badge">Using Flockwise’s sender</span>}
          </div>
          <p className="muted small" style={{ margin: '4px 0 0' }}>Connect the church mailbox (Gmail, Google Workspace, Outlook, Hostinger or any email account) and every email Flockwise sends, sign-in codes, rota requests, receipts and announcements, comes from that address. Replies go straight to your inbox.</p>
        </div>
      </div>
      {!e.connected ? (
        <div><button className="btn primary" onClick={() => setOpen(true)}><Plus size={15} /> Connect a mailbox</button></div>
      ) : (
        <>
          <dl className="int-facts">
            <div><dt>From</dt><dd>{e.fromName ? `${e.fromName} <${e.from}>` : e.from}</dd></div>
            <div><dt>Server</dt><dd className="mono small">{e.host}:{e.port}</dd></div>
            <div><dt>Connected</dt><dd>{e.connectedAt ? formatRelative(e.connectedAt) : '—'}</dd></div>
            <div><dt>Last sent</dt><dd>{e.lastSentAt ? formatRelative(e.lastSentAt) : 'Nothing yet'}</dd></div>
          </dl>
          {e.lastError && <div className="alert warn">The last email failed: {e.lastError}. If the password changed, connect the mailbox again.</div>}
          <div className="row wrap" style={{ gap: 8 }}>
            <input className="input" style={{ maxWidth: 280 }} placeholder="Send a test to (your email)" value={testTo} onChange={(ev) => setTestTo(ev.target.value)} />
            <button className="btn sm" disabled={test.busy} onClick={async () => { if (await test.run()) toast('Test email sent'); }}>{test.busy ? 'Sending…' : 'Send test'}</button>
            <button className="btn sm ghost" onClick={() => setOpen(true)}>Change</button>
            <span className="grow" />
            {confirmOff ? (
              <>
                <span className="small">Email will go back to Flockwise’s shared sender.</span>
                <button className="btn sm danger" onClick={async () => { set(await AdminApi.integrations.disconnectEmail()); setConfirmOff(false); toast('Mailbox disconnected'); }}>Disconnect</button>
                <button className="btn sm ghost" onClick={() => setConfirmOff(false)}>Cancel</button>
              </>
            ) : <button className="btn sm ghost" onClick={() => setConfirmOff(true)}><Unplug size={14} /> Disconnect</button>}
          </div>
          <FormError error={test.error} />
        </>
      )}
      {open && <ConnectEmail current={e} onClose={() => setOpen(false)} onDone={(st) => { set(st); setOpen(false); toast(`Emails now come from ${st.from}`); }} />}
    </section>
  );
}

function ConnectEmail({ current, onClose, onDone }: { current: EmailAccountStatus; onClose: () => void; onDone: (s: EmailAccountStatus) => void }) {
  const guess = PRESETS.find((p) => p.host === current.host)?.id ?? (current.host ? 'other' : 'gmail');
  const [preset, setPreset] = useState(guess);
  const [form, setForm] = useState({ host: current.host || 'smtp.gmail.com', port: current.port || 465, user: current.user, password: '', from: current.from, fromName: current.fromName });
  const pick = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setPreset(id);
    setForm((f) => ({ ...f, host: p.host || f.host, port: p.port }));
  };
  const save = useAction(() => AdminApi.integrations.connectEmail({ ...form, from: form.from.trim() || form.user.trim(), user: form.user.trim() }));
  const fe = (save.error?.fields ?? {}) as Record<string, string>;
  const hint = PRESETS.find((p) => p.id === preset)?.hint ?? '';
  return (
    <Modal title="Connect the church mailbox" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!form.host || !form.user || (!form.password && !current.connected) || save.busy} onClick={async () => { const s = await save.run(); if (s) onDone(s); }}>{save.busy ? 'Sending a test…' : 'Connect'}</button></>}>
      <div className="stack">
        <Field label="Email provider">
          <select className="select" value={preset} onChange={(ev) => pick(ev.target.value)}>{PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        </Field>
        <p className="small muted" style={{ margin: 0 }}>{hint}</p>
        <div className="grid cols-2">
          <Field label="Email address (sign-in)" error={fe.user}><input className="input" value={form.user} onChange={(ev) => setForm({ ...form, user: ev.target.value, from: form.from || ev.target.value })} placeholder="office@yourchurch.org" autoComplete="off" /></Field>
          <Field label={current.connected ? 'Password (leave blank to keep)' : 'Password or app password'} error={fe.password}><input className="input" type="password" value={form.password} onChange={(ev) => setForm({ ...form, password: ev.target.value })} autoComplete="new-password" /></Field>
        </div>
        <div className="grid cols-2">
          <Field label="Send as" hint="Usually the same address" error={fe.from}><input className="input" value={form.from} onChange={(ev) => setForm({ ...form, from: ev.target.value })} placeholder="office@yourchurch.org" /></Field>
          <Field label="Sender name"><input className="input" value={form.fromName} onChange={(ev) => setForm({ ...form, fromName: ev.target.value })} placeholder="Grace Church office" /></Field>
        </div>
        {preset === 'other' && (
          <div className="grid cols-2">
            <Field label="SMTP server"><input className="input mono" value={form.host} onChange={(ev) => setForm({ ...form, host: ev.target.value })} placeholder="smtp.example.com" /></Field>
            <Field label="Port" error={fe.port}><select className="select" value={form.port} onChange={(ev) => setForm({ ...form, port: Number(ev.target.value) })}><option value={465}>465 (SSL)</option><option value={587}>587 (STARTTLS)</option><option value={2525}>2525</option></select></Field>
          </div>
        )}
        <p className="small muted" style={{ margin: 0 }}>Flockwise sends one test email to you before saving, and stores the password encrypted. It is never shown again.</p>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Chitthi

function ChitthiCard({ onChange }: { onChange: (connected: boolean) => void }) {
  const { data, error, reload, setData } = useApi(() => AdminApi.integrations.get(), []);
  const [connecting, setConnecting] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const toast = useToast();
  if (error) return <div className="card card-pad"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return <div className="card card-pad"><Loading /></div>;
  const c = data.chitthi;
  const set = (chitthi: ChitthiStatus) => { setData({ ...data, chitthi }); onChange(chitthi.connected); };
  return (
    <section className="card card-pad stack">
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="int-logo chitthi"><MessageCircle size={22} /></div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>WhatsApp with Chitthi</h3>
            {c.connected ? <span className="badge ok">Connected</span> : <span className="badge">Not connected</span>}
          </div>
          <p className="muted small" style={{ margin: '4px 0 0' }}>Chitthi is the WhatsApp Business platform from Agape Labs, the team behind Flockwise. Connect it and every WhatsApp message from Flockwise (announcements, birthday wishes, rota reminders, follow-ups) goes from your church’s own WhatsApp number. Replies land in Chitthi’s shared inbox.</p>
        </div>
      </div>

      {!c.connected ? (
        <>
          <ol className="small muted int-steps">
            <li>Don’t have Chitthi yet? <a href={c.signupUrl} target="_blank" rel="noreferrer">Start a 14-day free trial</a> and connect your church’s WhatsApp number there.</li>
            <li>In Chitthi, open Settings › Developer and make an API key.</li>
            <li>Paste it here.</li>
          </ol>
          <div><button className="btn primary" onClick={() => setConnecting(true)}><Plus size={15} /> Connect Chitthi</button></div>
        </>
      ) : (
        <>
          <dl className="int-facts">
            <div><dt>Workspace</dt><dd>{c.workspace}</dd></div>
            <div><dt>Key</dt><dd className="mono small">{c.keyHint}</dd></div>
            <div><dt>Connected</dt><dd>{c.connectedAt ? formatRelative(c.connectedAt) : '—'}</dd></div>
            <div><dt>Last sent</dt><dd>{c.lastSentAt ? formatRelative(c.lastSentAt) : 'Nothing yet'}</dd></div>
          </dl>
          {c.lastError && <div className="alert warn">The last WhatsApp send failed: {c.lastError}</div>}
          <TemplatePicker status={c} onSaved={(s) => { set(s); toast('Template saved'); }} />
          <TestSend />
          <div className="row" style={{ gap: 8 }}>
            {confirmOff ? (
              <>
                <span className="small">WhatsApp will go back to the server’s default provider.</span>
                <button className="btn sm danger" onClick={async () => { set(await AdminApi.integrations.disconnectChitthi()); setConfirmOff(false); toast('Chitthi disconnected'); }}>Disconnect</button>
                <button className="btn sm ghost" onClick={() => setConfirmOff(false)}>Cancel</button>
              </>
            ) : <button className="btn sm ghost" onClick={() => setConfirmOff(true)}><Unplug size={14} /> Disconnect</button>}
          </div>
        </>
      )}
      {connecting && <ConnectChitthi onClose={() => setConnecting(false)} onDone={(s) => { set(s); setConnecting(false); toast(`Connected to ${s.workspace}`); }} />}
    </section>
  );
}

function ConnectChitthi({ onClose, onDone }: { onClose: () => void; onDone: (s: ChitthiStatus) => void }) {
  const [apiKey, setApiKey] = useState('');
  const save = useAction(() => AdminApi.integrations.connectChitthi({ apiKey: apiKey.trim() }));
  return (
    <Modal title="Connect Chitthi" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!apiKey.trim() || save.busy} onClick={async () => { const s = await save.run(); if (s) onDone(s); }}>{save.busy ? 'Checking…' : 'Connect'}</button></>}>
      <div className="stack">
        <Field label="Chitthi API key" hint="From Chitthi › Settings › Developer. Flockwise stores it encrypted and never shows it again.">
          <input className="input mono" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="chk_live_…" autoComplete="off" autoFocus />
        </Field>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

function TemplatePicker({ status, onSaved }: { status: ChitthiStatus; onSaved: (s: ChitthiStatus) => void }) {
  const [list, setList] = useState<{ available: boolean; data: ChitthiTemplate[] } | null>(null);
  const [mode, setMode] = useState<'template' | 'text'>(status.template || !status.lastSentAt ? 'template' : 'text');
  const [t, setT] = useState({ template: status.template, language: status.language, params: status.params });
  const save = useAction(() => AdminApi.integrations.updateChitthi(mode === 'text' ? { template: '', language: t.language, params: t.params } : t));
  useEffect(() => { void AdminApi.integrations.chitthiTemplates().then(setList, () => setList({ available: false, data: [] })); }, []);
  const key = (x: { template?: string; name?: string; language: string }) => `${x.template ?? x.name}|${x.language}`;
  const chosen = list?.data.find((x) => key(x) === key(t));
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="small" style={{ fontWeight: 600 }}>How Flockwise sends</div>
      <Segmented<'template' | 'text'> value={mode} onChange={setMode} options={[{ value: 'template', label: 'Approved template (recommended)' }, { value: 'text', label: 'Plain text' }]} />
      {mode === 'text' ? (
        <p className="small muted" style={{ margin: 0 }}>WhatsApp only delivers plain text to people who messaged your number in the last 24 hours. Others won’t get it, so use a template for announcements and reminders.</p>
      ) : (
        <>
          <p className="small muted" style={{ margin: 0 }}>Make a Utility template in Chitthi with one value, e.g. “Message from Grace Church: {'{{1}}'}”. Flockwise puts the whole message in {'{{1}}'}. If the template has two values, the first gets the person’s first name.</p>
          {list?.available && list.data.length > 0 ? (
            <select className="input" value={key(t)} onChange={(e) => { const x = list.data.find((y) => key(y) === e.target.value); if (x) setT({ template: x.name, language: x.language, params: x.params }); }}>
              {!chosen && <option value={key(t)}>{t.template ? `${t.template} (${t.language})` : 'Pick a template'}</option>}
              {list.data.map((x) => <option key={key(x)} value={key(x)}>{x.name} ({x.language}) · {x.params} value{x.params === 1 ? '' : 's'}</option>)}
            </select>
          ) : (
            <div className="row wrap" style={{ gap: 6 }}>
              <input className="input grow" value={t.template} onChange={(e) => setT({ ...t, template: e.target.value })} placeholder="Template name, e.g. church_update" aria-label="Template name" />
              <input className="input" style={{ width: 90 }} value={t.language} onChange={(e) => setT({ ...t, language: e.target.value })} placeholder="en" aria-label="Language code" />
              <select className="input" style={{ width: 120 }} value={t.params} onChange={(e) => setT({ ...t, params: Number(e.target.value) })} aria-label="Values in the template">
                {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n} value{n === 1 ? '' : 's'}</option>)}
              </select>
            </div>
          )}
          {chosen?.body && <div className="int-preview small">{chosen.body}</div>}
        </>
      )}
      <FormError error={save.error} />
      <div><button className="btn sm" disabled={save.busy || (mode === 'template' && !t.template.trim())} onClick={async () => { const s = await save.run(); if (s) onSaved(s); }}>Save</button></div>
    </div>
  );
}

function TestSend() {
  const [phone, setPhone] = useState('');
  const toast = useToast();
  const send = useAction(() => AdminApi.integrations.testChitthi(phone));
  return (
    <form className="stack" style={{ gap: 6 }} onSubmit={async (e) => { e.preventDefault(); if (await send.run()) toast('Test sent. Check WhatsApp.'); }}>
      <div className="small" style={{ fontWeight: 600 }}>Send a test</div>
      <div className="row" style={{ gap: 6 }}>
        <input className="input grow" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Your WhatsApp number, e.g. 98480 12345" inputMode="tel" aria-label="WhatsApp number" />
        <button className="btn sm" type="submit" disabled={send.busy || phone.replace(/\D/g, '').length < 10}><Send size={14} /> Send</button>
      </div>
      <FormError error={send.error} />
    </form>
  );
}

// ---------------------------------------------------------------- WhatsApp assistant

const INTENT_LABEL: Record<BotIntent, string> = {
  menu: 'Menu', services: 'Service times', events: 'Events', prayer_ask: 'Prayer', prayer: 'Prayer request', give: 'Give',
  sermon: 'Sermon', new: 'New here', talk: 'Talk to someone', stop: 'Stopped', start: 'Started again', unknown: 'Not understood',
  prayed: 'Prayed', chain_join: 'Joined prayer chain', chain_leave: 'Left prayer chain', checkin_ok: 'Doing well', checkin_away: 'Travelling', checkin_call: 'Wants a call', story: 'Bible story reply',
};

function WhatsAppBotCard() {
  const { data, error, reload, setData } = useApi(() => AdminApi.integrations.bot(), []);
  const [welcome, setWelcome] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const toast = useToast();
  const save = useAction(() => AdminApi.integrations.enableBot({ welcome: welcome ?? data?.welcome }));
  if (error) return <div className="card card-pad"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return <div className="card card-pad"><Loading /></div>;
  const b: WaBotStatus = data;
  const edited = welcome !== null && welcome.trim() !== b.welcome;
  return (
    <section className="card card-pad stack">
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="int-logo chitthi"><MessagesSquare size={22} /></div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>WhatsApp assistant</h3>
            {b.enabled ? <span className="badge ok">On</span> : <span className="badge">Off</span>}
          </div>
          <p className="muted small" style={{ margin: '4px 0 0' }}>When someone messages your church’s WhatsApp number, the assistant replies straight away with service times, this week’s events, your giving link or the latest sermon. It also takes prayer requests for your pastors, adds newcomers as visitors with a follow-up, and opens a care case when someone asks to talk.</p>
        </div>
      </div>

      {!b.chitthiConnected ? (
        <div className="alert">Connect Chitthi above first. The assistant answers on your Chitthi WhatsApp number, and needs Chitthi’s Growth plan for webhooks.</div>
      ) : (
        <>
          {b.enabled && (
            <div className="stat-row">
              <div className="mini-stat"><b>{b.last30.messages}</b><span>messages, 30 days</span></div>
              <div className="mini-stat"><b>{b.last30.people}</b><span>people</span></div>
              <div className="mini-stat"><b>{b.last30.prayers}</b><span>prayer requests</span></div>
              <div className="mini-stat"><b>{b.last30.newcomers}</b><span>newcomers</span></div>
              <div className="mini-stat"><b>{b.last30.talk}</b><span>asked to talk</span></div>
            </div>
          )}
          {b.lastError && <div className="alert warn">The last reply could not be sent: {b.lastError}</div>}
          <Field label="Welcome line" hint="The first line of the menu people see when they say hi.">
            <input className="input" value={welcome ?? b.welcome} maxLength={300} onChange={(e) => setWelcome(e.target.value)} />
          </Field>
          <FormError error={save.error} />
          <div className="row wrap" style={{ gap: 8 }}>
            {!b.enabled ? (
              <button className="btn primary" disabled={save.busy} onClick={async () => { const s = await save.run(); if (s) { setData(s); setWelcome(null); toast('The WhatsApp assistant is on'); } }}><Power size={15} /> {save.busy ? 'Turning on…' : 'Turn on'}</button>
            ) : (
              <>
                {edited && <button className="btn primary sm" disabled={save.busy} onClick={async () => { const s = await save.run(); if (s) { setData(s); setWelcome(null); toast('Welcome line saved'); } }}>Save</button>}
                {confirmOff ? (
                  <>
                    <span className="small">People will stop getting automatic replies.</span>
                    <button className="btn sm danger" onClick={async () => { setData(await AdminApi.integrations.disableBot()); setConfirmOff(false); toast('The WhatsApp assistant is off'); }}>Turn off</button>
                    <button className="btn sm ghost" onClick={() => setConfirmOff(false)}>Cancel</button>
                  </>
                ) : <button className="btn sm ghost" onClick={() => setConfirmOff(true)}><Power size={14} /> Turn off</button>}
              </>
            )}
          </div>
          <TryBot />
          {b.enabled && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="small" style={{ fontWeight: 600 }}>Recent conversations</div>
              {b.recent.length === 0 ? <p className="muted small" style={{ margin: 0 }}>No messages yet. Say hi to your church’s WhatsApp number to see it work.</p> : (
                <div className="table-wrap">
                  <table className="table small">
                    <thead><tr><th>When</th><th>From</th><th>Message</th><th>Answered</th></tr></thead>
                    <tbody>
                      {b.recent.slice(0, 15).map((m) => (
                        <tr key={m.id}>
                          <td className="nowrap muted">{formatRelative(m.at)}</td>
                          <td>{m.name || m.phone}</td>
                          <td className="bot-msg">{m.text}</td>
                          <td><span className={`badge ${m.intent === 'unknown' ? 'warn' : m.intent === 'prayer' || m.intent === 'new' || m.intent === 'talk' ? 'ok' : 'gray'}`}>{INTENT_LABEL[m.intent]}</span>{!m.sent && <span className="badge danger" style={{ marginLeft: 4 }}>Not sent</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Lets the office see what the assistant would say, without WhatsApp. */
function TryBot() {
  const [text, setText] = useState('');
  const [out, setOut] = useState<{ q: string; reply: string } | null>(null);
  const ask = useAction(() => AdminApi.integrations.tryBot(text));
  const send = async (q: string) => { const r = await ask.run(); if (r) { setOut({ q, reply: r.reply }); setText(''); } };
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="small" style={{ fontWeight: 600 }}>Try it</div>
      <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (text.trim()) void send(text.trim()); }}>
        <input className="input grow" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type hi, 1, prayer, give…" aria-label="Message to try" />
        <button className="btn sm" type="submit" disabled={ask.busy || !text.trim()}><Send size={14} /> Try</button>
      </form>
      <FormError error={ask.error} />
      {out && (
        <div className="bot-chat">
          <div className="bot-bubble me">{out.q}</div>
          <div className="bot-bubble">{out.reply}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- API keys and MCP

function ApiKeysCard() {
  const { data, error, reload } = useApi(() => AdminApi.integrations.apiKeys(), []);
  const [making, setMaking] = useState(false);
  const [made, setMade] = useState<{ key: ApiKeyView; secret: string } | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyView | null>(null);
  const toast = useToast();
  const api = getApiUrl().replace(/\/v1$/, '');
  return (
    <section className="card card-pad stack">
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="int-logo api"><Bot size={22} /></div>
        <div className="grow" style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0 }}>AI assistants and the API</h3>
          <p className="muted small" style={{ margin: '4px 0 0' }}>Connect Claude or another AI assistant to Flockwise (MCP), or use the REST API from Zapier, n8n or your own scripts. A key works with the permissions of the person who made it.</p>
        </div>
      </div>

      <div className="int-mcp stack" style={{ gap: 6 }}>
        <div className="small" style={{ fontWeight: 600 }}>MCP server URL</div>
        <CopyField value={`${api}/mcp`} label="MCP server URL" />
        <p className="small muted" style={{ margin: 0 }}>Send your key as <code>Authorization: Bearer fw_live_…</code>. In Claude Code: <code>claude mcp add --transport http flockwise {api}/mcp --header "Authorization: Bearer fw_live_…"</code>. For an app that only takes a URL, use {api}/mcp/ followed by your key, and keep that URL private.</p>
      </div>

      <div className="row between">
        <div className="small" style={{ fontWeight: 600 }}>API keys</div>
        <button className="btn sm" onClick={() => setMaking(true)}><KeyRound size={14} /> New key</button>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? (
        <Empty title="No keys yet" body="Make a read-only key to let an assistant look things up, or a full-access key to let it add people and send messages." />
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {data.map((k) => (
            <div key={k.id} className="list-row">
              <div className="grow" style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{k.name} <span className={`badge ${k.access === 'full' ? 'warn' : ''}`}>{k.access === 'full' ? 'Full access' : 'Read-only'}</span></div>
                <div className="small muted"><span className="mono">{k.prefix}…</span> · by {k.createdByName} · {k.lastUsedAt ? `used ${formatRelative(k.lastUsedAt)}` : 'never used'}</div>
              </div>
              <button className="btn sm ghost danger" onClick={() => setRevoking(k)}><Trash2 size={14} /> Revoke</button>
            </div>
          ))}
        </div>
      )}
      {making && <NewKey onClose={() => setMaking(false)} onMade={(m) => { setMaking(false); setMade(m); void reload(); }} />}
      {made && (
        <Modal title="Copy your key now" onClose={() => setMade(null)} footer={<button className="btn primary" onClick={() => setMade(null)}>I’ve saved it</button>}>
          <div className="stack">
            <p style={{ margin: 0 }}>This is the only time Flockwise shows <b>{made.key.name}</b>. Store it somewhere safe, like a password manager.</p>
            <CopyField value={made.secret} label="API key" secret />
          </div>
        </Modal>
      )}
      {revoking && (
        <Modal title={`Revoke “${revoking.name}”?`} onClose={() => setRevoking(null)} footer={<><button className="btn ghost" onClick={() => setRevoking(null)}>Cancel</button><button className="btn danger" onClick={async () => { await AdminApi.integrations.revokeKey(revoking.id); setRevoking(null); void reload(); toast('Key revoked'); }}>Revoke</button></>}>
          <p style={{ margin: 0 }}>Anything using this key stops working straight away. This cannot be undone.</p>
        </Modal>
      )}
    </section>
  );
}

function NewKey({ onClose, onMade }: { onClose: () => void; onMade: (m: { key: ApiKeyView; secret: string }) => void }) {
  const [name, setName] = useState('');
  const [access, setAccess] = useState<'read' | 'full'>('read');
  const make = useAction(() => AdminApi.integrations.createKey({ name: name.trim(), access }));
  return (
    <Modal title="New API key" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!name.trim() || make.busy} onClick={async () => { const m = await make.run(); if (m) onMade(m); }}>Make key</button></>}>
      <div className="stack">
        <Field label="Name" hint="Where you’ll use it, e.g. Claude, Zapier, Website"><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus /></Field>
        <Field label="Access">
          <Segmented<'read' | 'full'> value={access} onChange={setAccess} options={[{ value: 'read', label: 'Read-only' }, { value: 'full', label: 'Full access' }]} />
        </Field>
        <p className="small muted" style={{ margin: 0 }}>{access === 'read' ? 'Can look up people, events, plans, groups and more. Cannot change anything.' : 'Can also add people, post announcements, open care follow-ups and send messages. Keys can never make other keys or change staff roles.'}</p>
        <FormError error={make.error} />
      </div>
    </Modal>
  );
}
