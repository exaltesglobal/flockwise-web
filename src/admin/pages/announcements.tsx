import { Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { AdminAnnouncement, AnnouncementInput } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { formatRelative } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

export function AnnouncementsPage() {
  const { data, error, reload } = useApi(AdminApi.announcements.list);
  const [editing, setEditing] = useState<AdminAnnouncement | 'new' | null>(null);
  const toast = useToast();

  return (
    <>
      <PageHeader
        title="Announcements"
        subtitle="Published announcements appear on the home screen of the member app and portal."
        actions={<button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> New announcement</button>}
      />
      <div className="card">
        {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.data.length === 0 ? (
          <Empty icon={<Megaphone size={32} />} title="No announcements yet" />
        ) : data.data.map((a) => (
          <div key={a.id} className="list-row" style={{ alignItems: 'flex-start' }}>
            <div className="grow stack" style={{ gap: 4 }}>
              <div className="row" style={{ gap: 8 }}>
                <h3>{a.title}</h3>
                {a.status === 'published' ? <span className="badge ok">Published</span> : <span className="badge gray">Draft</span>}
              </div>
              <p className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{a.body}</p>
              <span className="small muted">{a.status === 'published' ? `Published ${formatRelative(a.publishedAt)}` : 'Not visible to members yet'}</span>
            </div>
            {a.status === 'draft' && (
              <button className="btn sm primary" onClick={async () => { await AdminApi.announcements.update(a.id, { status: 'published' }); toast('Published'); reload(); }}>Publish</button>
            )}
            <button className="btn ghost icon sm" title="Edit" onClick={() => setEditing(a)}><Pencil size={15} /></button>
            <button className="btn ghost icon sm danger" title="Delete" onClick={async () => {
              if (!confirm(`Delete “${a.title}”?`)) return;
              await AdminApi.announcements.remove(a.id);
              toast('Deleted');
              reload();
            }}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      {editing && <AnnouncementForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); toast('Saved'); }} />}
    </>
  );
}

function AnnouncementForm({ item, onClose, onSaved }: { item: AdminAnnouncement | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<AnnouncementInput>({ title: item?.title ?? '', body: item?.body ?? '', status: item?.status ?? 'published' });
  const save = useAction((input: AnnouncementInput) => (item ? AdminApi.announcements.update(item.id, input) : AdminApi.announcements.create(input)));
  const submit = async (status: AnnouncementInput['status']) => {
    if (await save.run({ ...form, status })) onSaved();
  };
  const ready = form.title.trim() && form.body.trim();
  return (
    <Modal title={item ? 'Edit announcement' : 'New announcement'} onClose={onClose}
      footer={<>
        <button className="btn" disabled={save.busy || !ready} onClick={() => submit('draft')}>Save as draft</button>
        <button className="btn primary" disabled={save.busy || !ready} onClick={() => submit('published')}>Publish</button>
      </>}
    >
      <div className="stack">
        <FormError error={save.error} />
        <Field label="Title"><input className="input" autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Message" hint="Keep it short. Members see this on their phone."><textarea className="textarea" rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
