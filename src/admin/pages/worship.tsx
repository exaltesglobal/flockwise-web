import { BarChart3, Pause, Play, Repeat } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import { Empty, ErrorState, Loading } from '@/components/ui';
import { formatRelative } from '@/lib/format';
import { useApi } from '@/lib/use-api';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Practice player for a song's audio link: slow it down and loop the hard section. */
export function RehearsalPlayer({ name, url }: { name: string; url: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });

  useEffect(() => { if (ref.current) ref.current.playbackRate = rate; }, [rate]);

  const onTime = () => {
    const el = ref.current;
    if (!el) return;
    if (loop.a !== null && loop.b !== null && el.currentTime >= loop.b) el.currentTime = loop.a;
    setTime(el.currentTime);
  };
  const toggle = async () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) { await el.play().catch(() => undefined); setPlaying(!el.paused); } else { el.pause(); setPlaying(false); }
  };
  const loopLabel = loop.a === null ? 'Set loop start' : loop.b === null ? 'Set loop end' : `Loop ${mmss(loop.a)}–${mmss(loop.b)} (clear)`;
  const nextLoop = () => {
    const t = ref.current?.currentTime ?? 0;
    if (loop.a === null) setLoop({ a: t, b: null });
    else if (loop.b === null) setLoop(t > loop.a ? { a: loop.a, b: t } : { a: t, b: loop.a });
    else setLoop({ a: null, b: null });
  };

  return (
    <div className="rehearsal">
      <audio ref={ref} src={url} preload="metadata" onTimeUpdate={onTime} onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)} onEnded={() => setPlaying(false)} />
      <button className="btn sm icon" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="small ellipsis"><b>{name || 'Rehearsal track'}</b> <span className="muted">{mmss(time)}{duration ? ` / ${mmss(duration)}` : ''}</span></div>
        <input type="range" min={0} max={duration || 0} step={0.1} value={time} onChange={(e) => { if (ref.current) ref.current.currentTime = Number(e.target.value); }} style={{ width: '100%' }} aria-label="Position" />
      </div>
      <select className="select" style={{ width: 82 }} value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="Speed">
        {[0.5, 0.75, 0.9, 1, 1.1, 1.25].map((r) => <option key={r} value={r}>{r}×</option>)}
      </select>
      <button className={`btn sm ${loop.a !== null ? 'on' : ''}`} onClick={nextLoop} title="Loop a section"><Repeat size={14} /> {loopLabel}</button>
    </div>
  );
}

/** Which songs the church sings, which have been resting, and each leader's habits. */
export function SongStatsView() {
  const { data, error, reload } = useApi(() => AdminApi.songStats());
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  if (!data.top.length) return <div className="card"><Empty icon={<BarChart3 size={28} />} title="No songs used yet" body="Song stats fill in once past services have plans with songs." /></div>;
  const max = Math.max(...data.top.map((t) => t.uses));
  return (
    <div className="grid cols-2" style={{ alignItems: 'start' }}>
      <div className="card">
        <div className="card-head"><h2>Most sung (last 12 months)</h2></div>
        {data.top.map((t) => (
          <div key={t.songId} className="list-row">
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="ellipsis" style={{ fontWeight: 600 }}>{t.title}</div>
              <div className="usage-bar"><span style={{ width: `${(t.uses / max) * 100}%` }} /></div>
            </div>
            <span className="num" style={{ fontWeight: 600 }}>{t.uses}×</span>
          </div>
        ))}
      </div>
      <div className="stack">
        <div className="card">
          <div className="card-head"><h2>Resting songs</h2></div>
          <p className="small muted" style={{ padding: '0 16px' }}>Not sung in the last 3 months. Bring one back, or retire it.</p>
          {data.resting.slice(0, 12).map((r) => (
            <div key={r.songId} className="list-row small"><span className="grow">{r.title}</span><span className="muted">{r.lastUsedAt ? formatRelative(r.lastUsedAt) : 'Never sung'}</span></div>
          ))}
          {data.resting.length === 0 && <p className="small muted" style={{ padding: '0 16px 16px' }}>Every song has been sung recently.</p>}
        </div>
        <div className="card">
          <div className="card-head"><h2>By worship leader</h2></div>
          {data.byLeader.map((l) => (
            <div key={l.person} className="list-row small">
              <div className="grow"><b>{l.person}</b><div className="muted">{l.distinct} different songs{l.favourite ? ` · most often ${l.favourite}` : ''}</div></div>
              <span className="num">{l.songs}</span>
            </div>
          ))}
        </div>
        {data.keys.length > 0 && (
          <div className="card card-pad">
            <h2 style={{ marginBottom: 8 }}>Keys used</h2>
            <div className="row wrap" style={{ gap: 6 }}>{data.keys.map((k) => <span key={k.key} className="badge gray">{k.key} · {k.uses}</span>)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
