// Settings › Networks: join a diocese, denomination or church network with the code its office
// gives, and choose whether to share giving totals. The network sees totals only, never people.
import { Network as NetworkIcon, LogOut } from 'lucide-react';
import { useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { NetworkKind } from '@/core/types';
import { Empty, ErrorState, FormError, Loading, Modal, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

const KIND: Record<NetworkKind, string> = { network: 'Church network', diocese: 'Diocese', denomination: 'Denomination', association: 'Association' };
type Preview = { id: string; name: string; kind: NetworkKind; churches: number };

export function NetworkSettings() {
  const list = useApi(AdminApi.networks.list);
  const toast = useToast();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [share, setShare] = useState(false);
  const [leaving, setLeaving] = useState<{ id: string; name: string } | null>(null);
  const find = useAction(AdminApi.networks.preview);
  const join = useAction(AdminApi.networks.join);
  const update = useAction(AdminApi.networks.update);
  const leave = useAction(async (id: string) => { await AdminApi.networks.leave(id); return true; });

  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  if (!list.data.available) return <div className="card"><Empty icon={<NetworkIcon size={28} />} title="Not available on this server" body="Church networks need the Flockwise directory. They work on flockwise.church." /></div>;

  return (
    <>
      <div className="card">
        <div className="card-head"><h2>Your networks</h2></div>
        {list.data.networks.length === 0 ? (
          <Empty icon={<NetworkIcon size={28} />} title="Not in a network" body="If your church belongs to a diocese, denomination or network that uses Flockwise, ask its office for the join code." />
        ) : list.data.networks.map((n) => (
          <div key={n.id} className="list-row wrap">
            <NetworkIcon size={18} className="muted" />
            <div className="grow" style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{n.name}</div>
              <div className="small muted">{KIND[n.kind]} · {n.churches} {n.churches === 1 ? 'church' : 'churches'} · joined {formatDate(n.joinedAt)}</div>
            </div>
            <label className="row small" style={{ gap: 6 }}>
              <input type="checkbox" checked={n.shareGiving} disabled={update.busy} onChange={async (e) => { if (await update.run(n.id, e.target.checked)) { toast(e.target.checked ? 'Sharing giving totals' : 'Stopped sharing giving'); list.reload(); } }} />
              Share giving totals
            </label>
            <button className="btn ghost sm" onClick={() => setLeaving({ id: n.id, name: n.name })}><LogOut size={14} /> Leave</button>
          </div>
        ))}
        <FormError error={update.error} />
      </div>

      <div className="card card-pad stack">
        <div>
          <h2 style={{ margin: 0 }}>Join a network</h2>
          <p className="small muted" style={{ margin: '4px 0 0' }}>The network sees your totals: people, members, Sunday attendance, new people, groups, serving and baptisms. It never sees names, phone numbers or anyone’s gifts.</p>
        </div>
        {!preview ? (
          <form className="row wrap" style={{ gap: 8 }} onSubmit={async (e) => { e.preventDefault(); const p = await find.run(code.trim()); if (p) setPreview(p); }}>
            <input className="input mono" style={{ maxWidth: 240, textTransform: 'uppercase' }} placeholder="Join code" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn" disabled={code.trim().length < 4 || find.busy}>Find network</button>
          </form>
        ) : (
          <div className="stack">
            <div className="callout"><b>{preview.name}</b><div className="small muted">{KIND[preview.kind]} · {preview.churches} {preview.churches === 1 ? 'church' : 'churches'} so far</div></div>
            <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} style={{ marginTop: 3 }} />
              <span>Also share our giving totals by month<span className="small muted" style={{ display: 'block' }}>Totals only, never who gave. You can turn this off at any time.</span></span>
            </label>
            <FormError error={join.error} />
            <div className="row" style={{ gap: 8 }}>
              <button className="btn ghost" onClick={() => { setPreview(null); join.setError(null); }}>Back</button>
              <button className="btn primary" disabled={join.busy} onClick={async () => { const r = await join.run(code.trim(), share); if (r) { toast(`Joined ${r.name}`); setPreview(null); setCode(''); setShare(false); list.reload(); } }}>Join {preview.name}</button>
            </div>
          </div>
        )}
        {!preview && <FormError error={find.error} />}
      </div>

      {leaving && (
        <Modal title={`Leave ${leaving.name}?`} onClose={() => setLeaving(null)} footer={<><button className="btn ghost" onClick={() => setLeaving(null)}>Cancel</button><button className="btn danger" disabled={leave.busy} onClick={async () => { if (await leave.run(leaving.id)) { toast('Left the network'); setLeaving(null); list.reload(); } }}>Leave</button></>}>
          <p>The network office stops seeing your church’s numbers. You can join again later with their code.</p>
          <FormError error={leave.error} />
        </Modal>
      )}
    </>
  );
}
