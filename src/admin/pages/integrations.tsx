// Settings › Integrations: WhatsApp through Chitthi, API keys, and connecting AI assistants (MCP).
import { Bot, Check, Copy, KeyRound, MessageCircle, Plus, Send, Trash2, Unplug } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { ApiKeyView, ChitthiStatus, ChitthiTemplate } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { getApiUrl } from '@/lib/config';
import { formatRelative } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

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
  return (
    <div className="stack">
      <ChitthiCard />
      <ApiKeysCard />
    </div>
  );
}

// ---------------------------------------------------------------- Chitthi

function ChitthiCard() {
  const { data, error, reload, setData } = useApi(() => AdminApi.integrations.get(), []);
  const [connecting, setConnecting] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const toast = useToast();
  if (error) return <div className="card card-pad"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return <div className="card card-pad"><Loading /></div>;
  const c = data.chitthi;
  const set = (chitthi: ChitthiStatus) => setData({ chitthi });
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
  const [mode, setMode] = useState<'template' | 'text'>(status.template ? 'template' : 'text');
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
