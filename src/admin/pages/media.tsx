// Media library: the church's photos, videos and files in its own Google Cloud Storage bucket,
// uploaded straight from the browser with a signed link.
import { Check, Copy, FileText, Film, Images, Music, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';

import type { MediaFolder, MediaItem } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Loading, Segmented, useToast } from '@/components/ui';
import { MEDIA_FOLDERS } from '@/core/types';
import { formatRelative } from '@/lib/format';
import { useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const readDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Could not read the file')); r.readAsDataURL(f); });

/** Uploads one file: ask for a signed link, PUT the bytes, tell the office it is there. */
export async function uploadMedia(file: File, folder: MediaFolder, onProgress?: (pct: number) => void): Promise<MediaItem> {
  const { item, uploadUrl, headers } = await AdminApi.media.start({ name: file.name, contentType: file.type || 'application/octet-stream', size: file.size, folder });
  if (uploadUrl.startsWith('demo:')) {
    // The demo has no bucket: pictures under 2 MB are kept as they are.
    const previewUrl = file.size < 2_000_000 && file.type.startsWith('image/') ? await readDataUrl(file) : undefined;
    onProgress?.(100);
    return AdminApi.media.complete(item.id, { size: file.size, previewUrl });
  }
  await new Promise<void>((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('PUT', uploadUrl);
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    x.onload = () => (x.status < 300 ? res() : rej(new Error(`The bucket refused the upload (${x.status}). Check the service account's role and the bucket's CORS settings.`)));
    x.onerror = () => rej(new Error('The upload did not reach the bucket. Allow this site in the bucket’s CORS settings (PUT from your Flockwise address).'));
    x.send(file);
  });
  return AdminApi.media.complete(item.id, { size: file.size });
}

function Icon({ m }: { m: MediaItem }) {
  if (m.contentType.startsWith('video/')) return <Film size={28} />;
  if (m.contentType.startsWith('audio/')) return <Music size={28} />;
  return <FileText size={28} />;
}

export function MediaPage() {
  const [folder, setFolder] = useState<MediaFolder | 'all'>('all');
  const { data, error, reload, setData } = useApi(() => AdminApi.media.list(folder === 'all' ? undefined : folder), [folder]);
  const [uploads, setUploads] = useState<{ name: string; pct: number; error?: string }[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();

  async function pick(files: FileList) {
    const target: MediaFolder = folder === 'all' ? 'general' : folder;
    const list = Array.from(files);
    setUploads(list.map((f) => ({ name: f.name, pct: 0 })));
    for (const [i, f] of list.entries()) {
      try {
        const item = await uploadMedia(f, target, (pct) => setUploads((u) => u.map((x, j) => (j === i ? { ...x, pct } : x))));
        setData((d) => (d ? { ...d, data: [item, ...d.data], gcs: { ...d.gcs, files: d.gcs.files + 1, bytes: d.gcs.bytes + item.size } } : d));
      } catch (e) {
        setUploads((u) => u.map((x, j) => (j === i ? { ...x, error: (e as Error).message } : x)));
      }
    }
    setTimeout(() => setUploads((u) => u.filter((x) => x.error)), 1500);
  }

  const copy = (m: MediaItem) => navigator.clipboard?.writeText(m.url).then(() => { setCopied(m.id); setTimeout(() => setCopied(null), 1500); }).catch(() => toast('Could not copy. Open the file and copy its address.'));

  return (
    <>
      <PageHeader title="Media library" subtitle="Photos, videos and files in the church's own Google Cloud Storage bucket. Copy a link to use it on an event, an announcement or the public page."
        actions={data?.gcs.connected && <button className="btn primary" onClick={() => input.current?.click()}><Upload size={16} /> Upload</button>} />
      <input ref={input} type="file" multiple hidden accept="image/*,video/*,audio/*,application/pdf" onChange={(e) => { if (e.target.files?.length) void pick(e.target.files); e.target.value = ''; }} />
      {error ? <div className="card card-pad"><ErrorState error={error} onRetry={reload} /></div> : !data ? <Loading /> : !data.gcs.connected ? (
        <div className="card">
          <Empty icon={<Images size={32} />} title="No bucket connected yet" body="Connect the church’s own Google Cloud Storage bucket in Settings › Integrations and upload sermon videos, event photos and logos here." action={<Link className="btn primary" to="/admin/settings#integrations">Connect Google Cloud Storage</Link>} />
        </div>
      ) : (
        <div className="card">
          <div className="toolbar row between wrap">
            <Segmented value={folder} onChange={setFolder} options={[{ value: 'all' as const, label: 'All' }, ...MEDIA_FOLDERS.map((f) => ({ value: f.id, label: f.label }))]} />
            <span className="small muted">{data.gcs.files} files · gs://{data.gcs.bucket}{data.gcs.publicRead ? '' : ' · links last a week'}</span>
          </div>
          {uploads.length > 0 && (
            <div className="stack" style={{ padding: '0 16px 12px', gap: 6 }}>
              {uploads.map((u, i) => (
                <div key={i} className="row small" style={{ gap: 10 }}>
                  <span className="ellipsis" style={{ minWidth: 0, flex: 1 }}>{u.name}</span>
                  {u.error ? <span className="danger-text">{u.error}</span> : <progress max={100} value={u.pct} style={{ width: 160 }} />}
                </div>
              ))}
            </div>
          )}
          {data.data.length === 0 ? (
            <Empty icon={<Images size={32} />} title="Nothing here yet" action={<button className="btn primary" onClick={() => input.current?.click()}><Upload size={16} /> Upload</button>} />
          ) : (
            <div className="media-grid">
              {data.data.map((m) => (
                <div key={m.id} className="media-tile">
                  <a href={m.url} target="_blank" rel="noreferrer" className="media-thumb">
                    {m.contentType.startsWith('image/') ? <img src={m.url} alt={m.name} loading="lazy" /> : <Icon m={m} />}
                  </a>
                  <div className="media-meta">
                    <div className="ellipsis small" title={m.name}>{m.name}</div>
                    <div className="small muted">{MEDIA_FOLDERS.find((f) => f.id === m.folder)?.label} · {formatRelative(m.createdAt)}</div>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="btn ghost icon sm" title="Copy link" onClick={() => void copy(m)}>{copied === m.id ? <Check size={14} /> : <Copy size={14} />}</button>
                    <button className="btn ghost icon sm danger" title="Delete" onClick={async () => {
                      if (!confirm(`Delete “${m.name}” from the bucket?`)) return;
                      await AdminApi.media.remove(m.id);
                      setData((d) => (d ? { ...d, data: d.data.filter((x) => x.id !== m.id) } : d));
                      toast('Deleted');
                    }}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
