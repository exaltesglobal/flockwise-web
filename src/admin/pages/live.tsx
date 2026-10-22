import { ArrowLeft, ChevronLeft, ChevronRight, Maximize, Play, RotateCcw, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { AdminApi } from '@/api/endpoints';
import { ErrorState, Loading, useToast } from '@/components/ui';
import { formatTime } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useApi } from '@/lib/use-api';

const mmss = (ms: number) => {
  const neg = ms < 0;
  const s = Math.floor(Math.abs(ms) / 1000);
  return `${neg ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Service running order with a countdown for each item, for the producer, worship leader and stage screen. */
export function LiveServicePage() {
  const { eventId = '' } = useParams();
  const { data, error, reload, setData } = useApi(() => AdminApi.live.get(eventId), [eventId]);
  const [now, setNow] = useState(Date.now());
  const can = useCan();
  const toast = useToast();
  const control = can('services');

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    // Other screens follow the producer: refresh every few seconds.
    const p = setInterval(() => { void reload(); }, 5000);
    return () => { clearInterval(t); clearInterval(p); };
  }, [reload]);

  const act = async (action: 'start' | 'next' | 'prev' | 'goto' | 'stop' | 'reset', index?: number) => {
    try { setData(await AdminApi.live.act(eventId, action, index)); } catch (e) { toast((e as Error).message, 'error'); }
  };

  useEffect(() => {
    if (!control) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); void act('next'); }
      if (e.key === 'ArrowLeft') void act('prev');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const { plan, live, event } = data;
  const started = !!live.startedAt && !live.endedAt;
  const item = plan.items[live.itemIndex];
  const left = data.itemEndsAt ? new Date(data.itemEndsAt).getTime() - now : null;
  const next = plan.items[live.itemIndex + 1];
  const scheduledEnd = new Date(event.endsAt).getTime();
  const projected = data.serviceEndsAt ? new Date(data.serviceEndsAt).getTime() : null;
  const drift = projected ? Math.round((projected - scheduledEnd) / 60000) : 0;

  return (
    <div className="stack lg">
      <div className="row wrap" style={{ gap: 8 }}>
        <Link to="/admin/services" className="small row" style={{ gap: 4 }}><ArrowLeft size={15} /> Service planning</Link>
        <span className="grow" />
        <button className="btn sm ghost" onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)}><Maximize size={14} /> Full screen</button>
      </div>
      <div className="live">
        <div className="stack">
          <div className="live-now">
            <span className="small" style={{ opacity: 0.8 }}>{event.title} · {formatTime(event.startsAt)}</span>
            {!live.startedAt ? (
              <>
                <h1 style={{ color: '#fff' }}>Not started</h1>
                <span style={{ opacity: 0.8 }}>{plan.items.length} items · {plan.items.reduce((s, i) => s + i.minutes, 0)} minutes planned</span>
              </>
            ) : live.endedAt ? (
              <h1 style={{ color: '#fff' }}>Service finished at {formatTime(live.endedAt)}</h1>
            ) : (
              <>
                <span style={{ opacity: 0.85 }}>Now · {live.itemIndex + 1} of {plan.items.length}</span>
                <h1 style={{ color: '#fff', fontSize: 'clamp(24px, 4vw, 40px)' }}>{item?.title}</h1>
                {item?.person && <span style={{ opacity: 0.85 }}>{item.person}{item.key ? ` · Key ${item.key}` : ''}</span>}
                <div className={`clock ${left !== null && left < 0 ? 'over' : ''}`}>{left !== null ? mmss(left) : '--:--'}</div>
                {item?.notes && <p style={{ opacity: 0.9 }}>{item.notes}</p>}
                {next && <span style={{ opacity: 0.75 }}>Next: {next.title}{next.person ? ` (${next.person})` : ''}</span>}
              </>
            )}
          </div>
          {control && (
            <div className="row wrap" style={{ gap: 8 }}>
              {!started ? (
                <button className="btn lg primary" onClick={() => act('start')}><Play size={18} /> {live.endedAt ? 'Start again' : 'Start service'}</button>
              ) : (
                <>
                  <button className="btn lg" onClick={() => act('prev')} disabled={live.itemIndex === 0}><ChevronLeft size={18} /> Back</button>
                  <button className="btn lg primary" onClick={() => act('next')}>{next ? 'Next item' : 'Finish'} <ChevronRight size={18} /></button>
                  <button className="btn lg ghost" onClick={() => act('stop')}><Square size={16} /> Stop</button>
                </>
              )}
              {live.startedAt && <button className="btn lg ghost" onClick={() => confirm('Reset the timer?') && act('reset')}><RotateCcw size={16} /> Reset</button>}
              <span className="small muted">Tip: press → or space for the next item.</span>
            </div>
          )}
          {started && projected && (
            <div className={`alert ${drift > 2 ? 'warn' : 'info'}`}>
              Projected finish {formatTime(new Date(projected).toISOString())}, {drift === 0 ? 'right on time' : drift > 0 ? `${drift} min over` : `${-drift} min early`} (planned {formatTime(event.endsAt)}).
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h3>Running order</h3></div>
          {plan.items.map((it, i) => (
            <div key={it.id} className={`live-item ${started && i === live.itemIndex ? 'on' : ''} ${live.startedAt && (i < live.itemIndex || live.endedAt) ? 'done' : ''}`} onClick={() => control && live.startedAt && act('goto', i)}>
              <span className="small muted" style={{ width: 20 }}>{i + 1}</span>
              <span className="grow">{it.title}{it.key ? <span className="small muted"> · {it.key}</span> : null}<div className="small muted">{it.person}</div></span>
              <span className="small muted">{it.minutes}′</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
