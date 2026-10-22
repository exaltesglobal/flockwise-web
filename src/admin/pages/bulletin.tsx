// The Sunday bulletin: built from the service plan, notices, this week's events and birthdays. The office
// adds a verse and a welcome, publishes it to the member app, and shares one link on WhatsApp.
import { ArrowLeft, Copy, ExternalLink, Newspaper, Plus, Send, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import type { BulletinSection, BulletinView, Currency } from '@/api/admin-types';
import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import { BulletinDoc } from '@/components/bulletin';
import { Empty, ErrorState, Field, FormError, Loading, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const SECTIONS: { value: BulletinSection; label: string; hint: string }[] = [
  { value: 'order', label: 'Order of service', hint: 'From the service plan' },
  { value: 'announcements', label: 'Notices', hint: 'Announcements from the last two weeks' },
  { value: 'events', label: 'This week', hint: 'Events in the coming eight days' },
  { value: 'celebrations', label: 'Birthdays and anniversaries', hint: 'Members only, never on the shared link' },
  { value: 'serving', label: 'Serving today', hint: 'Who is on each team' },
  { value: 'giving', label: 'Giving', hint: 'Give link and live special offerings' },
];

export function BulletinPage() {
  const { id } = useParams();
  return id ? <BulletinEditor id={id} /> : <BulletinList />;
}

function BulletinList() {
  const { data, error, reload } = useApi(() => AdminApi.bulletins.list(), []);
  const navigate = useNavigate();
  const create = useAction(() => AdminApi.bulletins.create());
  const start = async () => {
    const b = await create.run();
    if (b) navigate(`/admin/bulletin/${b.id}`);
  };
  const newButton = <button className="btn primary" onClick={start} disabled={create.busy}><Plus size={16} /> This Sunday's bulletin</button>;
  return (
    <>
      <PageHeader title="Bulletin" subtitle="A digital bulletin every Sunday, made from your service plan. Members see it in the app; anyone can open the WhatsApp link." actions={newButton} />
      <FormError error={create.error} />
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? (
        <div className="card"><Empty icon={<Newspaper size={28} />} title="No bulletins yet" body="Start one and Flockwise fills in the order of service, notices, events and birthdays for you." action={newButton} /></div>
      ) : (
        <div className="card">
          <table className="table">
            <thead><tr><th>Sunday</th><th>Title</th><th>Status</th></tr></thead>
            <tbody>
              {data.map((b) => (
                <tr key={b.id} className="clickable" onClick={() => navigate(`/admin/bulletin/${b.id}`)}>
                  <td>{formatDate(`${b.date}T00:00:00Z`)}</td>
                  <td><Link to={`/admin/bulletin/${b.id}`}>{b.title}</Link></td>
                  <td><span className={`badge ${b.status === 'published' ? 'ok' : 'gray'}`}>{b.status === 'published' ? 'Published' : 'Draft'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function BulletinEditor({ id }: { id: string }) {
  const currency = (useSession(adminSession)?.church.currency ?? 'INR') as Currency;
  const { data, error, reload, setData } = useApi(() => AdminApi.bulletins.get(id), [id]);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return <Editor key={data.id} b={data} currency={currency} onSaved={setData} />;
}

function Editor({ b, currency, onSaved }: { b: BulletinView; currency: Currency; onSaved: (b: BulletinView) => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [title, setTitle] = useState(b.title);
  const [verse, setVerse] = useState(b.verse);
  const [intro, setIntro] = useState(b.intro);
  const [sections, setSections] = useState<BulletinSection[]>(b.sections);
  const save = useAction(AdminApi.bulletins.update);
  const dirty = title !== b.title || verse !== b.verse || intro !== b.intro || sections.join() !== b.sections.join();

  // Section toggles save straight away so the preview follows.
  useEffect(() => {
    if (sections.join() === b.sections.join()) return;
    void save.run(b.id, { sections }).then((x) => x && onSaved(x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  const submit = async (status?: 'published' | 'draft') => {
    const x = await save.run(b.id, { title, verse, intro, ...(status ? { status } : {}) });
    if (!x) return;
    onSaved(x);
    toast(status === 'published' ? 'Published to the member app' : status === 'draft' ? 'Moved back to draft' : 'Saved');
  };
  const copy = async () => {
    const text = `${b.church.name}: ${b.title}\n${b.shareUrl}`;
    try {
      await navigator.clipboard.writeText(text);
      toast('Link copied. Paste it in your WhatsApp group.');
    } catch {
      window.prompt('Copy this link', b.shareUrl);
    }
  };
  const remove = async () => {
    if (!confirm('Delete this bulletin?')) return;
    await AdminApi.bulletins.remove(b.id);
    navigate('/admin/bulletin');
  };
  const published = b.status === 'published';
  const toggle = (s: BulletinSection) => setSections((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : SECTIONS.map((x) => x.value).filter((x) => x === s || cur.includes(x))));

  return (
    <>
      <div style={{ marginBottom: 8 }}><Link to="/admin/bulletin" className="small row" style={{ gap: 4 }}><ArrowLeft size={14} /> All bulletins</Link></div>
      <PageHeader
        title={b.title}
        subtitle={published ? `Published ${b.publishedAt ? formatDate(b.publishedAt) : ''}. Members see it in the app.` : 'Draft. Only the church office can see it.'}
        actions={
          <>
            {published && <button className="btn" onClick={copy}><Copy size={16} /> Copy WhatsApp link</button>}
            {published && <a className="btn ghost" href={b.shareUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open</a>}
            {published
              ? <button className="btn ghost" onClick={() => submit('draft')} disabled={save.busy}>Unpublish</button>
              : <button className="btn primary" onClick={() => submit('published')} disabled={save.busy}><Send size={16} /> Publish</button>}
          </>
        }
      />
      <div className="bulletin-editor">
        <div className="stack">
          <div className="card card-pad stack">
            <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Verse for the week" hint="Shown at the top in large type."><textarea className="textarea" rows={2} value={verse} onChange={(e) => setVerse(e.target.value)} placeholder="This is the day the Lord has made; let us rejoice and be glad in it. Psalm 118:24" /></Field>
            <Field label="A word of welcome"><textarea className="textarea" rows={4} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="A short note from the pastor." /></Field>
            <FormError error={save.error} />
            <div className="row between wrap" style={{ gap: 8 }}>
              <button className="btn ghost danger" onClick={remove}><Trash2 size={16} /> Delete</button>
              <button className="btn" onClick={() => submit()} disabled={!dirty || save.busy}>Save</button>
            </div>
          </div>
          <div className="card card-pad stack">
            <h3>What goes in</h3>
            {SECTIONS.map((s) => (
              <label key={s.value} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                <input type="checkbox" checked={sections.includes(s.value)} onChange={() => toggle(s.value)} />
                <span><b>{s.label}</b><span className="small muted"> · {s.hint}</span></span>
              </label>
            ))}
            {!b.service && <p className="small muted">No upcoming service found, so the order of service is empty. Plan the service under Service planning first.</p>}
          </div>
        </div>
        <div className="bulletin-preview">
          <BulletinDoc b={{ ...b, title, verse, intro }} currency={currency} />
        </div>
      </div>
    </>
  );
}
