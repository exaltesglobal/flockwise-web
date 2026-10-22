import { ArrowLeft, CalendarDays, Clock, ExternalLink, Link2, MapPin, Pin, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { memberSession } from '@/api/client';
import { MemberApi } from '@/api/endpoints';
import { Avatar, ErrorState, Loading, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDay, formatRelative, formatTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

/** A group's own space: discussion, shared files and links, members and the next meeting. */
export function MemberGroupPage() {
  const { id = '' } = useParams();
  const { t, locale } = useT();
  const toast = useToast();
  const session = useSession(memberSession);
  const { data, error, reload } = useApi(() => MemberApi.group.get(id), [id]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);

  const attempt = async (fn: () => Promise<unknown>) => {
    try { await fn(); reload(); } catch (e) { toast((e as Error).message, 'error'); }
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const { group, isLeader, members, resources } = data;
  const posts = [...data.posts].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at.localeCompare(a.at));
  const myId = session?.member.id;

  return (
    <>
      <Link to="/app/groups" className="small row" style={{ gap: 4 }}><ArrowLeft size={15} /> {t('tabGroups')}</Link>
      <div className="card card-pad stack" style={{ gap: 10 }}>
        <h1>{group.name}</h1>
        {group.description && <p className="muted">{group.description}</p>}
        <div className="row wrap small" style={{ gap: 14 }}>
          {group.meetingSchedule && <span className="row" style={{ gap: 5 }}><Clock size={14} className="muted" /> {group.meetingSchedule}</span>}
          {group.location && <span className="row" style={{ gap: 5 }}><MapPin size={14} className="muted" /> {group.location}</span>}
        </div>
        {data.nextMeeting && (
          <div className="alert info"><CalendarDays size={16} /> {t('nextMeeting')}: {formatDay(data.nextMeeting, locale)}, {formatTime(data.nextMeeting, locale)}</div>
        )}
      </div>

      <section className="stack">
        <h2>{t('discussion')}</h2>
        <form className="card card-pad stack" style={{ gap: 8 }} onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          setBusy(true);
          await attempt(async () => { await MemberApi.group.post(id, text.trim()); setText(''); });
          setBusy(false);
        }}>
          <textarea className="input" rows={2} placeholder={t('writePost')} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
          <button className="btn primary sm" style={{ alignSelf: 'flex-end' }} disabled={busy || !text.trim()}>{t('post')}</button>
        </form>
        {posts.length === 0 ? <p className="muted">{t('noPosts')}</p> : posts.map((p) => (
          <div key={p.id} className="card card-pad stack" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 10 }}>
              <Avatar name={p.authorName} />
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{p.authorName}</div>
                <div className="small muted">{formatRelative(p.at, locale)}{p.pinned && <> · <Pin size={12} /> {t('pinned')}</>}</div>
              </div>
              {isLeader && <button className="btn ghost sm" onClick={() => attempt(() => MemberApi.group.pin(id, p.id, !p.pinned))}>{p.pinned ? t('unpin') : t('pin')}</button>}
              {(isLeader || p.authorId === myId) && (
                <button className="btn ghost icon sm danger" aria-label={t('remove')} onClick={() => confirm(`${t('remove')}?`) && attempt(() => MemberApi.group.removePost(id, p.id))}><Trash2 size={15} /></button>
              )}
            </div>
            <p style={{ whiteSpace: 'pre-wrap' }}>{p.text}</p>
          </div>
        ))}
      </section>

      <section className="stack">
        <div className="section-head">
          <h2>{t('filesLinks')}</h2>
          {isLeader && !link && <button className="btn sm" onClick={() => setLink({ name: '', url: '' })}><Plus size={14} /> {t('addLink')}</button>}
        </div>
        {link && (
          <form className="card card-pad stack" style={{ gap: 8 }} onSubmit={async (e) => {
            e.preventDefault();
            await attempt(async () => { await MemberApi.group.addResource(id, link); setLink(null); });
          }}>
            <input className="input" placeholder={t('linkName')} value={link.name} onChange={(e) => setLink({ ...link, name: e.target.value })} />
            <input className="input" placeholder="https://" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} />
            <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn sm" onClick={() => setLink(null)}>{t('cancel')}</button>
              <button className="btn primary sm" disabled={!link.name.trim() || !link.url.trim()}>{t('save')}</button>
            </div>
          </form>
        )}
        {resources.length > 0 && (
          <div className="card">
            {resources.map((r) => (
              <div key={r.id} className="list-row">
                <Link2 size={17} className="muted" />
                <a className="grow" href={r.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{r.name} <ExternalLink size={12} /></a>
                <span className="small muted">{r.addedByName}</span>
                {isLeader && <button className="btn ghost icon sm danger" aria-label={t('remove')} onClick={() => attempt(() => MemberApi.group.removeResource(id, r.id))}><Trash2 size={15} /></button>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="stack">
        <h2>{t('members', { count: members.length })}</h2>
        <div className="card card-pad row wrap" style={{ gap: 12 }}>
          {members.map((m) => <span key={m.id} className="row small" style={{ gap: 6 }}><Avatar name={m.name} /> {m.name}</span>)}
        </div>
      </section>
    </>
  );
}
