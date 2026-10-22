// Settings › Notifications: which channels each automatic notification uses, and how many
// phones are registered for push from the member and team apps.
import { Bell, Mail, MessageCircle, Smartphone } from 'lucide-react';
import { Link } from 'react-router';

import type { NotificationCatalogEntry, NotificationRule } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { ErrorState, Loading, useToast } from '@/components/ui';
import { toApiError, useApi } from '@/lib/use-api';

export function NotificationsSettings() {
  const view = useApi(AdminApi.notifications.get);
  const toast = useToast();
  if (view.error) return <ErrorState error={view.error} onRetry={view.reload} />;
  if (!view.data) return <Loading />;
  const d = view.data;
  async function set(e: NotificationCatalogEntry, patch: Partial<NotificationRule>) {
    try {
      view.setData(await AdminApi.notifications.update(e.kind, { ...e.rule, ...patch }));
    } catch (err) {
      toast(toApiError(err).message);
    }
  }
  return (
    <div className="stack">
      <div className="grid cols-3">
        <div className="card card-pad"><div className="row" style={{ gap: 8 }}><Mail size={18} /><b>Email from</b></div><div className="small muted" style={{ marginTop: 4 }}>{d.emailFrom ?? 'Flockwise’s shared sender'} · <Link to="/admin/settings#integrations">change</Link></div></div>
        <div className="card card-pad"><div className="row" style={{ gap: 8 }}><Smartphone size={18} /><b>{d.devices.member} member phones</b></div><div className="small muted" style={{ marginTop: 4 }}>Registered for push by the Flockwise member app.</div></div>
        <div className="card card-pad"><div className="row" style={{ gap: 8 }}><Bell size={18} /><b>{d.devices.team} team phones</b></div><div className="small muted" style={{ marginTop: 4 }}>Registered for push by the team app.</div></div>
      </div>
      <div className="card">
        <div className="card-head"><h2>Automatic notifications</h2><span className="small muted">Flockwise sends these on its own. Pick the channels; the person who caused it is never told twice.</span></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Who hears</th><th title="Email"><Mail size={14} /> Email</th><th title="Push to the apps"><Smartphone size={14} /> Push</th><th title="WhatsApp through Chitthi"><MessageCircle size={14} /> WhatsApp</th><th>Sent</th></tr></thead>
            <tbody>
              {d.rules.map((e) => (
                <tr key={e.kind}>
                  <td><b>{e.label}</b><div className="small muted">{e.description}</div></td>
                  <td className="small">{e.audience}</td>
                  {(['email', 'push', 'whatsapp'] as const).map((ch) => (
                    <td key={ch}><label className="switch"><input type="checkbox" checked={e.rule[ch]} onChange={(ev) => set(e, { [ch]: ev.target.checked })} aria-label={`${e.label} by ${ch}`} /><span /></label></td>
                  ))}
                  <td className="small muted">{e.sentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="card-body small muted" style={{ margin: 0 }}>WhatsApp needs Chitthi connected in Integrations and uses your template credits. Push reaches phones that have the apps installed and signed in.</p>
      </div>
    </div>
  );
}
