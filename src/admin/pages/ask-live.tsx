// Sunday › Ask the pastor: open a session, put its QR code on the projector, and watch questions
// and poll answers arrive from phones. Approve or hide questions, mark them answered, let AI sort
// them into themes, and run quick polls. The pastor sees it all grouped on the stage display.
import { Check, Copy, EyeOff, MessageCircleQuestion, MonitorPlay, MonitorSpeaker, Plus, Sparkles, Trash2, Vote } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { AdminApi } from '@/api/endpoints';
import type { AskAdmin, AskQuestionView, AskSession } from '@/core/types';
import { QrCode } from '@/components/qr';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useToast, useUndoableDelete, useHiddenRows } from '@/components/ui';
import { churchUrl } from '@/lib/church';
import { formatDate, formatTime } from '@/lib/format';
import { useNewParam, useOpenParam } from '@/lib/use-new-param';
import { useAction, useApi } from '@/lib/use-api';

import { useAi } from '../ai';
import { PageHeader } from '../layout';

export function AskLivePage() {
  const list = useApi(AdminApi.ask.list);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const rows = useHiddenRows();
  const undoable = useUndoableDelete();
  useNewParam(() => setCreating(true));
  useOpenParam('open', (id) => { setOpen(id); return true; });

  if (open) return <AskSessionView id={open} onBack={() => { setOpen(null); void list.reload(); }} />;
  const shown = (list.data ?? []).filter((s) => !rows.hidden.has(s.id));
  return (
    <>
      <PageHeader title="Ask the pastor" subtitle="Put a QR code on the screen. People send questions or answer a poll from their phones, with their name or without, and the pastor sees them grouped on the stage display."
        actions={<button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> New session</button>} />
      <div className="card">
        {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : !shown.length ? (
          <Empty icon={<MessageCircleQuestion size={28} />} title="No sessions yet" body="Start one for Sunday's sermon, a youth night or a Q&A evening. It takes a few seconds." action={<button className="btn primary" onClick={() => setCreating(true)}>Start a session</button>} />
        ) : shown.map((s) => (
          <div key={s.id} className="list-row">
            <button className="grow ak-link" onClick={() => setOpen(s.id)}>
              <b>{s.title}</b> {s.open ? <span className="badge ok">Open</span> : <span className="badge gray">Closed</span>}
              <span className="small muted" style={{ display: 'block' }}>{[formatDate(s.createdAt), s.eventTitle, `code ${s.code}`, `${s.questions} question${s.questions === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span>
            </button>
            {s.waiting > 0 && <span className="badge warn">{s.waiting} waiting</span>}
            <button className="btn ghost icon sm danger" aria-label="Delete" onClick={() => undoable({ text: 'Session deleted.', hide: () => rows.hide(s.id), show: () => rows.show(s.id), run: () => AdminApi.ask.remove(s.id), done: list.reload })}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      {creating && <NewSession onClose={() => setCreating(false)} onMade={(id) => { setCreating(false); setOpen(id); }} />}
    </>
  );
}

function NewSession({ onClose, onMade }: { onClose: () => void; onMade: (id: string) => void }) {
  const [f, setF] = useState({ title: 'Questions for the pastor', anonymous: true, moderate: false });
  const save = useAction(async () => onMade((await AdminApi.ask.create(f)).session.id));
  return (
    <Modal title="New session" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => void save.run()} disabled={save.busy || !f.title.trim()}>Start</button></>}>
      <div className="stack">
        <Field label="Title" hint="Shown on the phones and the screen."><input className="input" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={120} /></Field>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={f.anonymous} onChange={(e) => setF({ ...f, anonymous: e.target.checked })} /> People may ask without their name</label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={f.moderate} onChange={(e) => setF({ ...f, moderate: e.target.checked })} /> Check questions before others see them</label>
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}

function AskSessionView({ id, onBack }: { id: string; onBack: () => void }) {
  const q = useApi(() => AdminApi.ask.get(id), [id]);
  const ai = useAi();
  const toast = useToast();
  const [poll, setPoll] = useState(false);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') void q.reload(); }, 4000);
    return () => clearInterval(t);
  }, [q.reload]);
  const act = useAction(async (fn: () => Promise<AskAdmin>) => q.setData(await fn()));
  if (q.error && !q.data) return <><PageHeader title="Ask the pastor" /><ErrorState error={q.error} onRetry={q.reload} /></>;
  if (!q.data) return <><PageHeader title="Ask the pastor" /><Loading /></>;
  const { session: s, questions, polls, screenKey } = q.data;
  const phone = churchUrl(`/ask/${s.code}`);
  const screen = churchUrl(`/ask/${s.id}/screen${screenKey ? `?key=${screenKey}` : ''}`);
  const stage = churchUrl(`/ask/${s.id}/stage${screenKey ? `?key=${screenKey}` : ''}`);
  const set = (patch: Partial<AskSession>) => void act.run(() => AdminApi.ask.update(s.id, patch));
  const status = (x: AskQuestionView, st: AskQuestionView['status']) => void act.run(() => AdminApi.ask.setQuestion(s.id, x.id, { status: st }));
  const copy = (text: string) => { void navigator.clipboard?.writeText(text).then(() => toast('Link copied.'), () => toast(text)); };
  const waiting = questions.filter((x) => x.status === 'new');
  const live = questions.filter((x) => x.status === 'approved' || (x.status === 'new' && !s.moderate));
  const done = questions.filter((x) => x.status === 'answered' || x.status === 'hidden');

  return (
    <>
      <PageHeader title={s.title} subtitle={`Code ${s.code}. Open the screen page on the projector and the stage page on the pastor's monitor.`}
        actions={<button className="btn ghost" onClick={onBack}>All sessions</button>} />
      <div className="ak-grid">
        <aside className="card card-pad stack ak-side">
          <div className="ak-qr"><QrCode value={phone} size={180} label="QR code for phones" /><div className="ak-code">{s.code}</div></div>
          <div className="stack" style={{ gap: 6 }}>
            <a className="btn" href={screen} target="_blank" rel="noreferrer"><MonitorPlay size={15} /> Projector screen</a>
            <a className="btn" href={stage} target="_blank" rel="noreferrer"><MonitorSpeaker size={15} /> Stage display</a>
            <button className="btn ghost" onClick={() => copy(phone)}><Copy size={15} /> Copy the phone link</button>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="small muted">On the screen</span>
            <div className="segmented" role="tablist">
              {(['questions', 'poll', 'off'] as const).map((v) => <button key={v} role="tab" aria-selected={s.stage === v} className={s.stage === v ? 'on' : ''} onClick={() => set({ stage: v })} disabled={v === 'poll' && !s.pollId}>{v === 'questions' ? 'QR & questions' : v === 'poll' ? 'Poll' : 'Off'}</button>)}
            </div>
          </div>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={s.open} onChange={(e) => set({ open: e.target.checked })} /> Taking questions</label>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={s.anonymous} onChange={(e) => set({ anonymous: e.target.checked })} /> Allow without a name</label>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={s.moderate} onChange={(e) => set({ moderate: e.target.checked })} /> Check questions first</label>
          <FormError error={act.error} />
        </aside>

        <div className="stack">
          {s.moderate && waiting.length > 0 && (
            <section className="card">
              <div className="card-head"><h2>Waiting for you ({waiting.length})</h2><button className="btn sm" onClick={() => void act.run(() => AdminApi.ask.approveAll(s.id))}><Check size={14} /> Approve all</button></div>
              {waiting.map((x) => (
                <QuestionRow key={x.id} x={x}>
                  <button className="btn sm primary" onClick={() => status(x, 'approved')}><Check size={14} /> Approve</button>
                  <button className="btn sm ghost icon" onClick={() => status(x, 'hidden')} aria-label="Hide"><EyeOff size={14} /></button>
                </QuestionRow>
              ))}
            </section>
          )}

          <section className="card">
            <div className="card-head">
              <h2>Questions ({live.length})</h2>
              {ai && questions.length >= 3 && <button className="btn sm" onClick={() => void act.run(() => AdminApi.ask.group(s.id))} disabled={act.busy}><Sparkles size={14} /> Group by theme</button>}
            </div>
            {!live.length ? <p className="card-pad muted small" style={{ margin: 0 }}>Questions appear here as people send them. Phones open <b>{phone.replace(/^https?:\/\//, '')}</b>.</p> : live.map((x) => (
              <QuestionRow key={x.id} x={x}>
                <button className="btn sm" onClick={() => status(x, 'answered')}><Check size={14} /> Answered</button>
                <button className="btn sm ghost icon" onClick={() => status(x, 'hidden')} aria-label="Hide"><EyeOff size={14} /></button>
              </QuestionRow>
            ))}
          </section>

          <section className="card">
            <div className="card-head"><h2>Polls</h2><button className="btn sm" onClick={() => setPoll(true)}><Vote size={14} /> New poll</button></div>
            {!polls.length && <p className="card-pad muted small" style={{ margin: 0 }}>Ask the room a quick question with two to six answers. Results show live on the screen.</p>}
            {polls.map((p) => (
              <div key={p.id} className="card-pad ak-poll">
                <div className="row between wrap" style={{ gap: 8 }}>
                  <b>{p.question}</b>
                  <div className="row" style={{ gap: 6 }}>
                    {p.open ? <button className="btn sm" onClick={() => void act.run(() => AdminApi.ask.setPoll(s.id, p.id, { open: false }))}>Close voting</button>
                      : <button className="btn sm" onClick={() => void act.run(() => AdminApi.ask.setPoll(s.id, p.id, { open: true }))}>Open again</button>}
                    {(s.pollId !== p.id || s.stage !== 'poll') && <button className="btn sm ghost" onClick={() => void act.run(() => AdminApi.ask.setPoll(s.id, p.id, { open: p.open, show: true }))}>Show on screen</button>}
                    <button className="btn sm ghost icon danger" onClick={() => void act.run(() => AdminApi.ask.removePoll(s.id, p.id))} aria-label="Delete poll"><Trash2 size={14} /></button>
                  </div>
                </div>
                {p.options.map((o, i) => {
                  const pct = p.total ? Math.round((o.count / p.total) * 100) : 0;
                  return <div key={i} className="ak-bar"><span className="ak-bar-fill" style={{ width: `${pct}%` }} /><span>{o.label}</span><b>{o.count} · {pct}%</b></div>;
                })}
                <span className="small muted">{p.total} vote{p.total === 1 ? '' : 's'}{p.open ? ' · open' : ' · closed'}</span>
              </div>
            ))}
          </section>

          {done.length > 0 && (
            <details className="card">
              <summary className="card-pad">Answered and hidden ({done.length})</summary>
              {done.map((x) => (
                <QuestionRow key={x.id} x={x}>
                  <button className="btn sm ghost" onClick={() => status(x, 'approved')}>Back to the list</button>
                </QuestionRow>
              ))}
            </details>
          )}
        </div>
      </div>
      {poll && <NewPoll id={s.id} onClose={() => setPoll(false)} onMade={(d) => { setPoll(false); q.setData(d); toast('The poll is open and on the screen.'); }} />}
    </>
  );
}

function QuestionRow({ x, children }: { x: AskQuestionView; children: ReactNode }) {
  return (
    <div className={`list-row ak-q ${x.status}`}>
      <span className="ak-votes" title="Me too votes">{x.votes ? `▲ ${x.votes}` : ''}</span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div>{x.text}</div>
        <div className="small muted">{[x.name ?? 'No name', formatTime(x.createdAt), x.theme, x.status === 'hidden' && 'hidden', x.status === 'answered' && 'answered'].filter(Boolean).join(' · ')}</div>
      </div>
      <div className="row" style={{ gap: 6 }}>{children}</div>
    </div>
  );
}

function NewPoll({ id, onClose, onMade }: { id: string; onClose: () => void; onMade: (d: AskAdmin) => void }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const save = useAction(async () => onMade(await AdminApi.ask.createPoll(id, { question, options })));
  const ready = question.trim() && options.filter((o) => o.trim()).length >= 2;
  return (
    <Modal title="New poll" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => void save.run()} disabled={save.busy || !ready}>Open the poll</button></>}>
      <div className="stack">
        <Field label="Question"><input className="input" autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Which topic should we take next month?" maxLength={200} /></Field>
        {options.map((o, i) => (
          <Field key={i} label={`Answer ${i + 1}`}><input className="input" value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} maxLength={80} /></Field>
        ))}
        {options.length < 6 && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOptions([...options, ''])}><Plus size={14} /> Add an answer</button>}
        <FormError error={save.error} />
      </div>
    </Modal>
  );
}
