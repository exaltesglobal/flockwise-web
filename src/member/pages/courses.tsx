// Classes and courses, from the member's side: classes taking sign-ups, the ones I'm in, the
// sessions with their dates, and how many I've come to.
import { Check, GraduationCap, MapPin } from 'lucide-react';

import { MemberApi } from '@/api/endpoints';
import type { MyCourse } from '@/core/types';
import { ErrorState, FormError, Loading, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDay, formatTime } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

export function MemberCoursesPage() {
  const { t } = useT();
  const { data, error, reload, setData } = useApi(MemberApi.courses.get);
  return (
    <>
      <div>
        <h1>{t('courseTitle')}</h1>
        <p className="muted">{t('courseBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.courses.length === 0 ? (
        <div className="card card-pad stack" style={{ alignItems: 'center', textAlign: 'center' }}><GraduationCap size={28} /><p className="muted" style={{ margin: 0 }}>{t('courseNone')}</p></div>
      ) : (
        <div className="stack">{data.courses.map((c) => <CourseCard key={c.id} c={c} onData={setData} />)}</div>
      )}
    </>
  );
}

function CourseCard({ c, onData }: { c: MyCourse; onData: (d: { courses: MyCourse[] }) => void }) {
  const { t, locale } = useT();
  const toast = useToast();
  const join = useAction(async () => { onData(await MemberApi.courses.enroll(c.id)); toast(t('courseJoined')); });
  const leave = useAction(async () => { onData(await MemberApi.courses.leave(c.id)); toast(t('courseLeft')); });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="card card-pad stack">
      <div className="row wrap" style={{ gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
        <b style={{ fontSize: 18 }}>{c.name}</b>
        {c.mine?.status === 'completed' ? <span className="badge ok"><Check size={13} /> {t('courseCompleted')}</span> : c.mine ? <span className="badge accent">{t('courseEnrolled')}</span> : c.full ? <span className="badge gray">{t('courseFull')}</span> : null}
      </div>
      {c.description && <p className="muted small" style={{ margin: 0 }}>{c.description}</p>}
      <div className="row wrap small muted" style={{ gap: 12 }}>
        <span>{t('courseSessions', { n: c.sessions.length })}</span>
        {c.leaderName && <span>{t('courseLed', { name: c.leaderName })}</span>}
        {c.location && <span><MapPin size={12} /> {c.location}</span>}
      </div>
      <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
        {c.sessions.map((s) => (
          <li key={s.id} style={{ opacity: s.date && s.date.slice(0, 10) < today ? 0.6 : 1 }}>
            {s.title} <span className="muted">· {s.date ? `${formatDay(s.date, locale)}${s.date.length > 10 ? `, ${formatTime(s.date, locale)}` : ''}` : t('courseTbc')}</span>
          </li>
        ))}
      </ol>
      {c.mine && c.mine.status !== 'completed' && <span className="small">{t('courseProgress', { done: c.mine.attended, min: c.minAttendance })}</span>}
      <FormError error={join.error ?? leave.error} />
      {!c.mine && !c.full && <div><button className="btn primary" disabled={join.busy} onClick={() => void join.run()}>{t('courseJoin')}</button></div>}
      {c.mine?.status === 'enrolled' && <div><button className="btn ghost sm" disabled={leave.busy} onClick={() => void leave.run()}>{t('courseLeave')}</button></div>}
    </div>
  );
}
