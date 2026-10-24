// Ask the pastor, live. /ask/:code is the page a phone opens from the QR code on the screen: send
// a question (with a name or without), add "me too" to others, and answer the poll. No sign-in;
// the phone keeps a random id. /ask/:id/screen is the projector (QR, code and poll results) and
// /ask/:id/stage the pastor's stage display (questions grouped by theme, with votes).
import { Check, ThumbsUp } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import { memberSession } from '@/api/client';
import { AdminApi, PublicApi } from '@/api/endpoints';
import type { AskPollView } from '@/core/types';
import { QrCode } from '@/components/qr';
import { ErrorState, FormError, Loading } from '@/components/ui';
import { useStrings } from '@/i18n';
import { churchUrl } from '@/lib/church';
import { useSession } from '@/lib/session';
import { useAction, useApi } from '@/lib/use-api';

import './ask.css';

const LANGS = [['en', 'English'], ['hi', 'हिन्दी'], ['te', 'తెలుగు'], ['ta', 'தமிழ்'], ['ml', 'മലയാളം'], ['kn', 'ಕನ್ನಡ']] as const;

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } },
};
function deviceId() {
  let d = store.get('fw.ask.device');
  if (!d) { d = `d-${crypto.randomUUID()}`; store.set('fw.ask.device', d); }
  return d;
}
/** Refresh while the page is visible. */
function useEvery(ms: number, fn: () => void) {
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') fn(); }, ms);
    return () => clearInterval(id);
  }, [ms, fn]);
}

export function AskCodePage() {
  const [code, setCode] = useState('');
  const nav = useNavigate();
  const { t } = useStrings(store.get('fw.ask.lang') ?? 'en');
  return (
    <div className="ask">
      <form className="ask-card stack" onSubmit={(e) => { e.preventDefault(); if (code.trim()) nav(`/ask/${code.trim().toUpperCase()}`); }}>
        <h1>{t('askTitle')}</h1>
        <p className="muted">{t('askCodeHelp')}</p>
        <input className="input ask-code-in" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={5} placeholder="ABC12" autoFocus aria-label="Code" />
        <button className="btn primary" disabled={!code.trim()}>{t('askJoin')}</button>
      </form>
    </div>
  );
}

export function AskPhonePage() {
  const { code = '' } = useParams();
  const session = useSession(memberSession);
  const [lang, setLang] = useState(() => store.get('fw.ask.lang') ?? session?.member.language ?? (navigator.language.slice(0, 2) || 'en'));
  const { t } = useStrings(lang);
  const device = useState(deviceId)[0];
  const q = useApi(() => PublicApi.ask.get(code, device), [code]);
  useEvery(5000, q.reload);
  const [text, setText] = useState('');
  const [name, setName] = useState(() => store.get('fw.ask.name') ?? (session ? `${session.member.firstName ?? ''}`.trim() : ''));
  const [sent, setSent] = useState(false);
  const send = useAction(async (e: FormEvent) => {
    e.preventDefault();
    await PublicApi.ask.send(code, { text, name: name.trim() || undefined, device });
    store.set('fw.ask.name', name.trim());
    setText(''); setSent(true); setTimeout(() => setSent(false), 4000);
    void q.reload();
  });
  const vote = useAction(async (id: string) => { await PublicApi.ask.vote(code, id, device); void q.reload(); });
  useEffect(() => { document.title = q.data ? `${q.data.title} · ${q.data.churchName}` : 'Ask'; }, [q.data]);
  const pickLang = (l: string) => { setLang(l); store.set('fw.ask.lang', l); };

  if (q.error && !q.data) return <div className="ask"><div className="ask-card"><ErrorState error={q.error} onRetry={q.reload} /></div></div>;
  if (!q.data) return <div className="ask"><Loading /></div>;
  const d = q.data;
  return (
    <div className="ask">
      <div className="ask-card stack">
        <header className="ask-head">
          <span className="ask-church">{d.logoUrl && <img src={d.logoUrl} alt="" />}{d.churchName}</span>
          <select value={lang} onChange={(e) => pickLang(e.target.value)} aria-label={t('askLanguage')} className="ask-lang">
            {LANGS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
          </select>
        </header>
        <h1>{d.title}</h1>

        {d.poll && <PollCard code={code} device={device} poll={d.poll} onVoted={(p) => q.setData({ ...d, poll: p })} t={t} />}

        {d.open ? (
          <form className="stack ask-form" onSubmit={(e) => void send.run(e)}>
            <label className="small" htmlFor="ask-text"><b>{t('askYourQuestion')}</b></label>
            <textarea id="ask-text" className="textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} required />
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={d.anonymous ? t('askNameOptional') : t('askName')} maxLength={60} required={!d.anonymous} aria-label={t('askName')} />
            {d.anonymous && <span className="small muted">{t('askAnonymous')}</span>}
            <FormError error={send.error} />
            <button className="btn primary" disabled={send.busy || text.trim().length < 3}>{sent ? <><Check size={16} /> {t('askSent')}</> : t('askSend')}</button>
          </form>
        ) : <p className="muted">{t('askClosed')}</p>}

        <section className="stack" style={{ gap: 8 }}>
          <h2 className="ask-h">{t('askFromRoom')}</h2>
          {!d.questions.length && <p className="muted small">{t('askNone')}</p>}
          <FormError error={vote.error} />
          {d.questions.map((x) => (
            <div key={x.id} className={`ask-q ${x.status === 'answered' ? 'done' : ''}`}>
              <div className="grow">
                <div>{x.text}</div>
                <div className="small muted">
                  {[x.name, x.mine && t('askYours'), x.mine && x.status === 'new' && t('askWaiting'), x.status === 'answered' && t('askAnswered')].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button className={`ask-vote ${x.voted ? 'on' : ''}`} onClick={() => void vote.run(x.id)} disabled={vote.busy || x.mine} aria-pressed={!!x.voted} title={t('askMeToo')}>
                <ThumbsUp size={15} /> {x.votes || ''}
              </button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function PollCard({ code, device, poll, onVoted, t }: { code: string; device: string; poll: AskPollView; onVoted: (p: AskPollView) => void; t: ReturnType<typeof useStrings>['t'] }) {
  const vote = useAction(async (i: number) => onVoted(await PublicApi.ask.poll(code, i, device)));
  const showResults = poll.myVote !== null || !poll.open;
  return (
    <section className="ask-poll stack">
      <span className="ask-h">{t('askPoll')}</span>
      <b>{poll.question}</b>
      {poll.options.map((o, i) => {
        const pct = poll.total ? Math.round((o.count / poll.total) * 100) : 0;
        return (
          <button key={i} className={`ask-opt ${poll.myVote === i ? 'on' : ''}`} onClick={() => void vote.run(i)} disabled={!poll.open || vote.busy}>
            {showResults && <span className="ask-bar" style={{ width: `${pct}%` }} />}
            <span className="ask-opt-l">{poll.myVote === i && <Check size={14} />} {o.label}</span>
            {showResults && <span className="small">{pct}%</span>}
          </button>
        );
      })}
      <FormError error={vote.error} />
      <span className="small muted">{poll.total === 1 ? t('askVoteOne') : t('askVotes', { n: poll.total })}{poll.myVote !== null && poll.open ? ` · ${t('askThanksVote')}` : ''}</span>
    </section>
  );
}

/** Projector (`screen`) or the pastor's stage display (`stage`). Opens with the screen key, or as signed-in staff. */
export function AskScreenPage({ mode }: { mode: 'screen' | 'stage' }) {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const key = params.get('key');
  const q = useApi(() => (key ? PublicApi.ask.screen(id, key) : AdminApi.ask.stage(id)), [id, key]);
  useEvery(3000, q.reload);
  useEffect(() => { document.title = q.data ? `${q.data.title} · ${mode === 'stage' ? 'Stage' : 'Screen'}` : 'Ask'; }, [q.data, mode]);
  if (q.error && !q.data) return <div className="ask-screen"><ErrorState error={q.error} onRetry={q.reload} /></div>;
  if (!q.data) return <div className="ask-screen"><Loading /></div>;
  const d = q.data;
  const link = churchUrl(`/ask/${d.code}`);
  const showPoll = d.stage === 'poll' && d.poll;

  if (mode === 'screen') {
    return (
      <div className="ask-screen projector">
        {showPoll ? <PollBars poll={d.poll!} /> : (
          <div className="ask-join">
            <QrCode value={link} size={360} label="Scan to ask" />
            <div className="stack" style={{ gap: 10 }}>
              <h1>{d.title}</h1>
              <p className="ask-big">Scan the code, or open <b>{link.replace(/^https?:\/\//, '').replace(/\/ask\/.*/, '/ask')}</b> and enter</p>
              <div className="ask-code">{d.code}</div>
            </div>
          </div>
        )}
        {showPoll && <div className="ask-corner"><QrCode value={link} size={120} label="Scan to vote" /><b>{d.code}</b></div>}
      </div>
    );
  }
  const count = d.groups.reduce((n, g) => n + g.questions.length, 0);
  return (
    <div className="ask-screen stage">
      <header className="row between"><h1>{d.title}</h1><span className="ask-count">{count} question{count === 1 ? '' : 's'}{d.open ? '' : ' · closed'}</span></header>
      {showPoll && <PollBars poll={d.poll!} compact />}
      {!count && <p className="ask-big muted">Questions will appear here as people send them.</p>}
      <div className={`ask-groups ${d.groups.length < 2 ? 'one' : ''}`}>
        {d.groups.map((g) => (
          <section key={g.theme ?? '-'}>
            {g.theme && <h2>{g.theme}</h2>}
            {g.questions.map((x) => (
              <div key={x.id} className={`ask-sq ${x.status === 'answered' ? 'done' : ''}`}>
                <span className="ask-sv">{x.votes ? `▲ ${x.votes}` : ''}</span>
                <span className="grow">{x.text}{x.name && <em> · {x.name}</em>}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function PollBars({ poll, compact = false }: { poll: AskPollView; compact?: boolean }) {
  const top = Math.max(1, ...poll.options.map((o) => o.count));
  return (
    <div className={`ask-bars ${compact ? 'compact' : ''}`}>
      <h1>{poll.question}</h1>
      {poll.options.map((o, i) => (
        <div key={i} className="ask-barrow">
          <span className="ask-barl">{o.label}</span>
          <span className="ask-bart"><span style={{ width: `${(o.count / top) * 100}%` }} /></span>
          <b>{poll.total ? Math.round((o.count / poll.total) * 100) : 0}%</b>
        </div>
      ))}
      <span className="ask-count">{poll.total} vote{poll.total === 1 ? '' : 's'}{poll.open ? '' : ' · closed'}</span>
    </div>
  );
}

