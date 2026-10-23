// Choir practice from the singer's side: the next rehearsal and its songs, the part recordings to
// listen to (their own part first), their attendance, and, for the team leader, a tick list to
// mark who came.
import { Check, ExternalLink, MicVocal, Music2, Play } from 'lucide-react';
import { useState } from 'react';

import type { MyPractice, PracticeSong } from '@/api/admin-types';
import { MemberApi } from '@/api/endpoints';
import { ErrorState, FormError, Loading, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDate, formatDay, formatTime } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

type T = ReturnType<typeof useT>['t'];
const LABEL: Record<string, string> = { soprano: 'Soprano', alto: 'Alto', tenor: 'Tenor', bass: 'Bass', melody: 'Melody', harmony: 'Harmony', instrumental: 'Instrumental', full: 'Whole song' };
const isAudio = (url: string) => /\.(mp3|m4a|aac|ogg|wav|opus)(\?|$)/i.test(url) || url.startsWith('data:audio/');

export function MemberPracticePage() {
  const { t, locale } = useT();
  const { data, error, reload, setData } = useApi(MemberApi.practice.get);
  return (
    <>
      <div>
        <h1>{t('practiceTitle')}</h1>
        <p className="muted">{t('practiceBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.teams.length === 0 ? (
        <div className="card card-pad stack" style={{ alignItems: 'center', textAlign: 'center' }}><MicVocal size={28} /><p className="muted" style={{ margin: 0 }}>{t('practiceNoTeam')}</p></div>
      ) : <Body data={data} t={t} locale={locale} onData={setData} />}
    </>
  );
}

function Body({ data, t, locale, onData }: { data: MyPractice; t: T; locale: string; onData: (d: MyPractice) => void }) {
  const myParts = data.teams.flatMap((x) => x.myParts);
  const mine = (s: PracticeSong) => [...s.parts].sort((a, b) => Number(myParts.some((p) => new RegExp(b.part, 'i').test(p))) - Number(myParts.some((p) => new RegExp(a.part, 'i').test(p))));
  const next = data.nextRehearsal;
  const leader = data.teams.find((x) => x.isLeader);
  return (
    <div className="stack">
      {myParts.length > 0 && <span className="small muted">{t('practiceYourParts', { parts: myParts.join(', ') })}</span>}
      {next && (
        <div className="card card-pad stack" style={{ gap: 6 }}>
          <span className="eyebrow">{t('practiceNext')}</span>
          <b style={{ fontSize: 18 }}>{formatDay(next.at, locale)}, {formatTime(next.at, locale)}</b>
          <span className="small muted">{next.eventTitle}</span>
          {next.notes && <p className="small" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{next.notes}</p>}
          {next.songs.length > 0 && <div className="row wrap small" style={{ gap: 6 }}>{next.songs.map((s) => <span key={s.id} className="badge gray"><Music2 size={12} /> {s.title}{s.key ? ` · ${s.key}` : ''}</span>)}</div>}
        </div>
      )}
      <div className="stack" style={{ gap: 8 }}>
        <h2 style={{ fontSize: 17 }}>{t('practiceSongs')}</h2>
        {data.songs.length === 0 ? <p className="muted small">{t('practiceNoSongs')}</p> : data.songs.map((s) => (
          <div key={s.id} className="card card-pad stack" style={{ gap: 8 }}>
            <div><b>{s.title}</b>{s.key && <span className="small muted"> · {s.key}</span>}{next?.songs.some((n) => n.id === s.id) && <span className="badge ok" style={{ marginLeft: 8 }}>{t('practiceNext')}</span>}</div>
            <div className="stack" style={{ gap: 6 }}>
              {mine(s).map((p) => (
                <div key={p.id} className="row wrap" style={{ gap: 8 }}>
                  <span className="small" style={{ minWidth: 90, fontWeight: 600 }}>{p.name || LABEL[p.part]}</span>
                  {isAudio(p.url) ? <audio controls preload="none" src={p.url} style={{ flex: 1, minWidth: 0, maxWidth: '100%', height: 36 }} /> : <a className="btn sm" href={p.url} target="_blank" rel="noreferrer">{/youtu|drive\.google/.test(p.url) ? <Play size={14} /> : <ExternalLink size={14} />} {t('practiceListen')}</a>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {leader && <MarkAttendance team={leader} next={next} t={t} onSaved={onData} />}
      <div className="card card-pad stack" style={{ gap: 8 }}>
        <div className="row between"><b>{t('practiceAttendance')}</b><span>{t('practiceOf', { present: data.attendance.present, total: data.attendance.total })}</span></div>
        {data.recent.length > 0 && (
          <div className="stack small" style={{ gap: 4 }}>
            <span className="muted">{t('practiceRecent')}</span>
            {data.recent.map((r) => (
              <div key={r.id} className="row between" style={{ gap: 8 }}>
                <span style={{ minWidth: 0 }}>{formatDate(r.at, locale)} · {r.teamName}{r.songs.length ? <span className="muted"> · {r.songs.slice(0, 3).join(', ')}</span> : null}</span>
                <span className={`badge ${r.wasPresent ? 'ok' : 'gray'}`}>{r.wasPresent ? t('practiceWasThere') : t('practiceMissed')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MarkAttendance({ team, next, t, onSaved }: { team: MyPractice['teams'][number]; next: MyPractice['nextRehearsal']; t: T; onSaved: (d: MyPractice) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState<Set<string>>(new Set());
  const save = useAction(async () => {
    await MemberApi.practice.record({ teamId: team.id, at: new Date().toISOString(), eventId: next?.eventId ?? null, presentIds: [...present] });
    return MemberApi.practice.get();
  });
  if (!open) return <button className="btn" onClick={() => setOpen(true)}><Check size={16} /> {t('practiceMark')}</button>;
  return (
    <div className="card card-pad stack" style={{ gap: 8 }}>
      <div className="row between"><b>{t('practiceMark')}</b><span className="small muted">{t('practicePresent', { n: present.size })}</span></div>
      <FormError error={save.error} />
      <div className="stack" style={{ gap: 4 }}>
        {team.roster.map((m) => (
          <label key={m.personId} className="row" style={{ gap: 10, padding: '6px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={present.has(m.personId)} onChange={() => setPresent((p) => { const n = new Set(p); if (n.has(m.personId)) n.delete(m.personId); else n.add(m.personId); return n; })} />
            <span>{m.name}</span>
          </label>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={save.busy} onClick={async () => { const d = await save.run(); if (d) { onSaved(d); toast(t('practiceSaved')); setOpen(false); setPresent(new Set()); } }}>{t('save')}</button>
        <button className="btn" onClick={() => setOpen(false)}>{t('cancel')}</button>
      </div>
    </div>
  );
}
