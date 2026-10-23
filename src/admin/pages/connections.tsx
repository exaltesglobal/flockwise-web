// Settings › Integrations: Zoom (meeting links on events), Google Cloud Storage (the church's own
// bucket for photos and videos), Canva (designs with the brand kit) and OBS Studio (the stream).
import { Clapperboard, Cloud, ExternalLink, Palette, Plus, Unplug, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';

import type { CanvaStatus, ConnectionsStatus, GcsStatus, ZoomStatus } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { OBS_MOMENTS, type CanvaExportFormat } from '@/core/types';
import { ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { formatRelative } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

function Disconnect({ note, onConfirm, label = 'Disconnect' }: { note: string; onConfirm: () => Promise<void>; label?: string }) {
  const [confirm, setConfirm] = useState(false);
  if (!confirm) return <button className="btn sm ghost" onClick={() => setConfirm(true)}><Unplug size={14} /> {label}</button>;
  return (
    <>
      <span className="small">{note}</span>
      <button className="btn sm danger" onClick={() => void onConfirm().then(() => setConfirm(false))}>{label}</button>
      <button className="btn sm ghost" onClick={() => setConfirm(false)}>Cancel</button>
    </>
  );
}

export function ConnectionCards() {
  const { data, error, reload, setData } = useApi(() => AdminApi.integrations.get(), []);
  if (error) return <div className="card card-pad"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return <div className="card card-pad"><Loading /></div>;
  const patch = (p: Partial<ConnectionsStatus>) => setData({ ...data, ...p });
  return (
    <>
      <ZoomCard status={data.zoom} onChange={(zoom) => patch({ zoom })} />
      <GcsCard status={data.gcs} onChange={(gcs) => patch({ gcs })} />
      <CanvaCard status={data.canva} onChange={(canva) => patch({ canva })} />
      <ObsCard />
    </>
  );
}

// ---------------------------------------------------------------- Zoom

function ZoomCard({ status: z, onChange }: { status: ZoomStatus; onChange: (s: ZoomStatus) => void }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <section className="card card-pad stack">
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="int-logo zoom"><Video size={22} /></div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>Zoom</h3>
            {z.connected ? <span className="badge ok">Connected</span> : <span className="badge">Not connected</span>}
          </div>
          <p className="muted small" style={{ margin: '4px 0 0' }}>Create a Zoom meeting for any service, prayer meeting or group from the event itself. Members get a “Join online” button; the start link and passcode stay in the office.</p>
        </div>
      </div>
      {!z.connected ? (
        <div><button className="btn primary" onClick={() => setOpen(true)}><Plus size={15} /> Connect Zoom</button></div>
      ) : (
        <>
          <dl className="int-facts">
            <div><dt>Zoom user</dt><dd>{z.userName ? `${z.userName} <${z.userEmail}>` : z.userEmail}</dd></div>
            <div><dt>Account ID</dt><dd className="mono small">{z.accountId}</dd></div>
            <div><dt>Connected</dt><dd>{z.connectedAt ? formatRelative(z.connectedAt) : '—'}</dd></div>
            <div><dt>Meetings made</dt><dd>{z.meetings}</dd></div>
          </dl>
          {z.lastError && <div className="alert warn">Zoom’s last answer was an error: {z.lastError}</div>}
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn sm ghost" onClick={() => setOpen(true)}>Change</button>
            <span className="grow" />
            <Disconnect note="Existing meeting links keep working." onConfirm={async () => { onChange(await AdminApi.integrations.disconnectZoom()); toast('Zoom disconnected'); }} />
          </div>
        </>
      )}
      {open && <ConnectZoom onClose={() => setOpen(false)} onDone={(s) => { onChange(s); setOpen(false); toast('Zoom connected'); }} />}
    </section>
  );
}

function ConnectZoom({ onClose, onDone }: { onClose: () => void; onDone: (s: ZoomStatus) => void }) {
  const [f, setF] = useState({ accountId: '', clientId: '', clientSecret: '' });
  const save = useAction(() => AdminApi.integrations.connectZoom(f));
  return (
    <Modal title="Connect Zoom" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !f.accountId || !f.clientId || !f.clientSecret} onClick={async () => { const s = await save.run(); if (s) onDone(s); }}>{save.busy ? 'Checking…' : 'Connect'}</button></>}
    >
      <div className="stack">
        <ol className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>Sign in to <a href="https://marketplace.zoom.us/develop/create" target="_blank" rel="noreferrer">marketplace.zoom.us</a> with the church’s Zoom account and create a <b>Server-to-Server OAuth</b> app (name it Flockwise).</li>
          <li>Under Scopes add <span className="mono">meeting:write:meeting:admin</span> and <span className="mono">user:read:user:admin</span>, then activate the app.</li>
          <li>Copy the Account ID, Client ID and Client Secret from the App Credentials page.</li>
        </ol>
        <FormError error={save.error} />
        <Field label="Account ID"><input className="input mono" value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })} autoFocus /></Field>
        <Field label="Client ID"><input className="input mono" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })} /></Field>
        <Field label="Client Secret" hint="Stored encrypted; never shown again"><input className="input mono" type="password" value={f.clientSecret} onChange={(e) => setF({ ...f, clientSecret: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Google Cloud Storage

function GcsCard({ status: g, onChange }: { status: GcsStatus; onChange: (s: GcsStatus) => void }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const mb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`);
  return (
    <section className="card card-pad stack">
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="int-logo gcs"><Cloud size={22} /></div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>Google Cloud Storage for photos and videos</h3>
            {g.connected ? <span className="badge ok">Connected</span> : <span className="badge">Not connected</span>}
          </div>
          <p className="muted small" style={{ margin: '4px 0 0' }}>Keep the church’s media in its own Google Cloud bucket: sermon recordings, event albums, kids’ photos, logos. Uploads go straight from the browser to the bucket; the <Link to="/admin/media">Media library</Link> shows everything.</p>
        </div>
      </div>
      {!g.available ? (
        <div className="alert">This server cannot sign Google requests yet.</div>
      ) : !g.connected ? (
        <div><button className="btn primary" onClick={() => setOpen(true)}><Plus size={15} /> Connect a bucket</button></div>
      ) : (
        <>
          <dl className="int-facts">
            <div><dt>Bucket</dt><dd className="mono small">gs://{g.bucket}</dd></div>
            <div><dt>Service account</dt><dd className="mono small ellipsis">{g.clientEmail}</dd></div>
            <div><dt>Files</dt><dd>{g.files} · {mb(g.bytes)}</dd></div>
            <div><dt>Links</dt><dd>{g.publicRead ? 'Public' : 'Private, signed for a week'}</dd></div>
          </dl>
          {!g.publicRead && <div className="alert">The bucket is private, so every link is signed and lasts a week. To make links permanent, grant <span className="mono">allUsers</span> the <b>Storage Object Viewer</b> role on the bucket in Google Cloud and connect again.</div>}
          {g.lastError && <div className="alert warn">Google’s last answer was an error: {g.lastError}</div>}
          <div className="row wrap" style={{ gap: 8 }}>
            <Link className="btn sm" to="/admin/media">Open the media library</Link>
            <button className="btn sm ghost" onClick={() => setOpen(true)}>Change</button>
            <span className="grow" />
            <Disconnect note="Files stay in the bucket; the library will not show them." onConfirm={async () => { onChange(await AdminApi.integrations.disconnectGcs()); toast('Bucket disconnected'); }} />
          </div>
        </>
      )}
      {open && <ConnectGcs onClose={() => setOpen(false)} onDone={(s) => { onChange(s); setOpen(false); toast(`Connected gs://${s.bucket}`); }} />}
    </section>
  );
}

function ConnectGcs({ onClose, onDone }: { onClose: () => void; onDone: (s: GcsStatus) => void }) {
  const [bucket, setBucket] = useState('');
  const [sa, setSa] = useState('');
  const save = useAction(() => AdminApi.integrations.connectGcs({ bucket, serviceAccount: sa }));
  const fe = save.error?.fields ?? {};
  return (
    <Modal title="Connect Google Cloud Storage" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={save.busy || !bucket || !sa} onClick={async () => { const s = await save.run(); if (s) onDone(s); }}>{save.busy ? 'Checking…' : 'Connect'}</button></>}
    >
      <div className="stack">
        <ol className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>In <a href="https://console.cloud.google.com/storage" target="_blank" rel="noreferrer">Google Cloud Console</a>, create a bucket (for example <span className="mono">gracechurch-media</span>, region asia-south1).</li>
          <li>Create a service account (IAM › Service accounts), give it the <b>Storage Object Admin</b> role on that bucket, and download a JSON key.</li>
          <li>Paste the bucket name and the whole key file here. The key is stored encrypted.</li>
        </ol>
        <FormError error={save.error?.fields ? null : save.error} />
        <Field label="Bucket name" error={fe.bucket}><input className="input mono" value={bucket} onChange={(e) => setBucket(e.target.value)} placeholder="gracechurch-media" autoFocus /></Field>
        <Field label="Service-account key (JSON)" error={fe.serviceAccount}>
          <textarea className="textarea mono small" rows={7} value={sa} onChange={(e) => setSa(e.target.value)} placeholder='{ "type": "service_account", "project_id": "...", "client_email": "...", "private_key": "-----BEGIN PRIVATE KEY-----..." }' />
        </Field>
        <input type="file" accept="application/json,.json" className="small" onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(setSa); }} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Canva

function CanvaCard({ status: c, onChange }: { status: CanvaStatus; onChange: (s: CanvaStatus) => void }) {
  const toast = useToast();
  const { search } = useLocation();
  const go = useAction(async () => {
    const { url, state } = await AdminApi.integrations.canvaConnect();
    if (url.startsWith('https://')) { window.location.href = url; return; }
    // Demo: no Canva to visit, so finish the sign-in here.
    await AdminApi.integrations.canvaCallback({ code: 'demo', state });
    onChange(await AdminApi.integrations.get().then((s) => s.canva));
    toast('Canva connected (demo)');
  });
  useEffect(() => {
    const q = new URLSearchParams(search);
    if (q.get('canva') === 'connected') toast('Canva connected');
    if (q.get('canva') === 'error') toast(`Canva: ${q.get('reason') ?? 'could not connect'}`);
  }, [search, toast]);
  return (
    <section className="card card-pad stack">
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="int-logo canva"><Palette size={22} /></div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>Canva</h3>
            {c.connected ? <span className="badge ok">Connected</span> : <span className="badge">Not connected</span>}
          </div>
          <p className="muted small" style={{ margin: '4px 0 0' }}>Open invitations and social posts in the church’s Canva with the brand kit already applied: Events › Invitation › “Open in Canva”. The design starts from the card Flockwise drew, ready to tweak; when it is done, “Save to Flockwise” brings it back as a picture or PDF.</p>
        </div>
      </div>
      {!c.available ? (
        <div className="alert">Canva is not switched on for this server yet (it needs Flockwise’s Canva app keys).</div>
      ) : !c.connected ? (
        <div><button className="btn primary" disabled={go.busy} onClick={() => go.run()}><ExternalLink size={15} /> Connect Canva</button><FormError error={go.error} /></div>
      ) : (
        <>
          <dl className="int-facts">
            <div><dt>Canva user</dt><dd>{c.userName}{c.teamName ? ` · ${c.teamName}` : ''}</dd></div>
            <div><dt>Connected</dt><dd>{c.connectedAt ? formatRelative(c.connectedAt) : '—'}</dd></div>
            <div><dt>Designs opened</dt><dd>{c.designs}</dd></div>
          </dl>
          {c.lastError && <div className="alert warn">Canva’s last answer was an error: {c.lastError}</div>}
          <CanvaDesigns />
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="grow" />
            <Disconnect note="Designs stay in Canva." onConfirm={async () => { onChange(await AdminApi.integrations.disconnectCanva()); toast('Canva disconnected'); }} />
          </div>
        </>
      )}
    </section>
  );
}

/** Designs opened from Flockwise: open again in Canva, or save the finished one back to the media library. */
function CanvaDesigns() {
  const { data, setData } = useApi(() => AdminApi.canva.designs(), []);
  const toast = useToast();
  const [format, setFormat] = useState<CanvaExportFormat>('png');
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string[]>>({});
  const save = useAction(async (id: string) => {
    setBusy(id);
    try {
      const r = await AdminApi.canva.save(id, format);
      setData((data ?? []).map((d) => (d.id === id ? r.design : d)));
      if (r.media.length) toast(`Saved to the media library (${r.media.length} file${r.media.length === 1 ? '' : 's'})`);
      else { setSaved((s) => ({ ...s, [id]: r.urls })); toast('Ready to download'); }
    } finally { setBusy(null); }
  });
  if (!data?.length) return null;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row between wrap" style={{ gap: 8 }}>
        <b className="small">Designs</b>
        <label className="small row" style={{ gap: 6 }}>Save as <select value={format} onChange={(e) => setFormat(e.target.value as CanvaExportFormat)}><option value="png">PNG picture</option><option value="jpg">JPG picture</option><option value="pdf">PDF for printing</option></select></label>
      </div>
      <ul className="canva-designs">
        {data.slice(0, 8).map((d) => (
          <li key={d.id}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="ellipsis">{d.title}</div>
              <div className="small muted">{d.lastExport ? `Saved ${formatRelative(d.lastExport.createdAt)} as ${d.lastExport.format.toUpperCase()}` : `Opened ${formatRelative(d.createdAt)}`}</div>
              {saved[d.id] && <div className="small row wrap" style={{ gap: 8 }}>{saved[d.id].map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer">Download{saved[d.id].length > 1 ? ` page ${i + 1}` : ''}</a>)}<span className="muted">links work for 24 hours</span></div>}
            </div>
            <a className="btn sm ghost" href={d.editUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Edit</a>
            <button className="btn sm" disabled={!!busy} onClick={() => void save.run(d.id)}>{busy === d.id ? 'Saving…' : 'Save to Flockwise'}</button>
          </li>
        ))}
      </ul>
      <p className="small muted" style={{ margin: 0 }}>Saved designs go to Communication › Media library when Cloud Storage is connected; otherwise you get a download link.</p>
      <FormError error={save.error} />
    </div>
  );
}

// ---------------------------------------------------------------- OBS Studio

/** OBS runs on the church's own streaming computer; the presenter's browser talks to it. The scene plan is shared here. */
function ObsCard() {
  const { data, error, reload, setData } = useApi(() => AdminApi.presentation.obs(), []);
  const toast = useToast();
  const save = useAction(async () => { if (!data) return; setData(await AdminApi.presentation.saveObs(data)); toast('OBS scene plan saved'); });
  const mapped = data ? Object.values(data.scenes).filter(Boolean).length : 0;
  return (
    <section className="card card-pad stack int-wide">
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="int-logo obs"><Clapperboard size={22} /></div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between wrap" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>OBS Studio</h3>
            {mapped ? <span className="badge ok">{mapped} scene{mapped === 1 ? '' : 's'} planned</span> : <span className="badge">Overlay only</span>}
          </div>
          <p className="muted small" style={{ margin: '4px 0 0' }}>Stream with the free OBS Studio: a transparent lyrics bar and name straps over your camera, and scenes that change as the presenter moves through the plan. Nothing passes through Flockwise’s servers; the presenter’s browser talks to OBS on the streaming computer.</p>
        </div>
      </div>
      <ol className="small obs-steps">
        <li><b>Lyrics and names on the stream.</b> In OBS add a <i>Browser Source</i>, 1920 × 1080, and paste the “OBS overlay” link from the presenter’s <i>Links</i> button for that service. Turn the lyrics bar on from the presenter’s Media panel.</li>
        <li><b>Scenes from the presenter.</b> In OBS open <i>Tools › WebSocket Server Settings</i>, turn the server on and set a password. In the presenter’s OBS panel connect to <code>ws://localhost:4455</code> with that password (OBS and the presenter browser on the same computer).</li>
        <li><b>Scene plan.</b> Type the scene names below exactly as they appear in OBS. Leave a row blank to keep whatever scene is showing.</li>
      </ol>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : (
        <>
          <div className="obs-scenes">
            {OBS_MOMENTS.map((m) => (
              <Field key={m.id} label={m.label}>
                <input className="input" value={data.scenes[m.id] ?? ''} placeholder={m.hint || 'Scene name in OBS'} maxLength={100}
                  onChange={(e) => setData({ ...data, scenes: { ...data.scenes, [m.id]: e.target.value } })} />
              </Field>
            ))}
          </div>
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={data.autoSwitch} onChange={(e) => setData({ ...data, autoSwitch: e.target.checked })} /> Switch scenes automatically as the plan moves (the media desk can pause this during a service)</label>
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={data.lyricsOnSongs} onChange={(e) => setData({ ...data, lyricsOnSongs: e.target.checked })} /> Put the lyrics bar on the stream during songs and take it off after</label>
          <div className="row wrap" style={{ gap: 8 }}>
            <FormError error={save.error} />
            <span className="grow" />
            <button className="btn primary" disabled={save.busy} onClick={() => save.run()}>Save scene plan</button>
          </div>
        </>
      )}
    </section>
  );
}
