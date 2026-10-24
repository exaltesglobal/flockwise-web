// Family altar: this week's ten minutes together at home. A story for the children, a song, a
// question and a prayer; the family ticks it done and builds a streak. Parents also see what each
// child is learning in Sunday school, to talk about at home.
import { Check, Flame, Music2, School } from 'lucide-react';

import { MemberApi } from '@/api/endpoints';
import { ErrorState, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { useAction, useApi } from '@/lib/use-api';

export function MemberAltarPage() {
  const { t } = useT();
  const q = useApi(MemberApi.altar.get);
  const tick = useAction(async (done: boolean) => q.setData(await (done ? MemberApi.altar.done() : MemberApi.altar.undo())));
  return (
    <div className="stack">
      <div>
        <h1>{t('altarTitle')}</h1>
        <p className="muted">{t('altarIntro')}</p>
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <Loading /> : (() => {
        const d = q.data;
        const w = d.week;
        return (
          <>
            <div className="card card-pad row" style={{ gap: 12 }}>
              <Flame size={28} style={{ color: d.streak ? 'var(--primary)' : 'var(--muted)', flex: 'none' }} />
              <div className="grow">
                <b>{d.streak > 1 ? t('altarStreak', { n: d.streak }) : d.streak === 1 ? t('altarStreakOne') : t('altarStartStreak')}</b>
                {d.best > 1 && <div className="small muted">{t('altarBest', { n: d.best })}</div>}
              </div>
            </div>
            <article className="card card-pad stack" style={{ gap: 12 }}>
              <div>
                <h2 style={{ margin: 0 }}>{w.title}</h2>
                {w.passage && <div className="small muted">{w.passage}</div>}
              </div>
              <p className="small muted" style={{ margin: 0 }}>{t('altarHow')}</p>
              <section>
                <span className="eyebrow">{t('altarStory')}</span>
                <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', fontSize: '1.05rem', lineHeight: 1.6 }}>{w.story}</p>
              </section>
              {w.songTitle && (
                <section>
                  <span className="eyebrow">{t('altarSong')}</span>
                  <div className="row" style={{ gap: 6, marginTop: 4 }}><Music2 size={16} />{w.songUrl ? <a href={w.songUrl} target="_blank" rel="noreferrer">{w.songTitle}</a> : w.songTitle}</div>
                </section>
              )}
              <section>
                <span className="eyebrow">{t('altarTalk')}</span>
                <p style={{ margin: '4px 0 0' }}><b>{w.question}</b></p>
              </section>
              <section>
                <span className="eyebrow">{t('altarPray')}</span>
                <p style={{ margin: '4px 0 0', fontStyle: 'italic' }}>{w.prayer}</p>
              </section>
              {d.done ? (
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className="badge green row" style={{ gap: 4 }}><Check size={14} /> {t('altarDoneYes')}</span>
                  <button className="btn sm ghost" disabled={tick.busy} onClick={() => void tick.run(false)}>{t('altarUndo')}</button>
                </div>
              ) : <button className="btn primary lg" disabled={tick.busy} onClick={() => void tick.run(true)}><Check size={18} /> {t('altarDoneBtn')}</button>}
            </article>
            {d.kids.length > 0 && (
              <section className="card card-pad stack" style={{ gap: 10 }}>
                <h3 className="row" style={{ margin: 0, gap: 8 }}><School size={18} /> {t('altarKids')}</h3>
                {d.kids.map((k) => (
                  <div key={k.name} className="stack" style={{ gap: 2 }}>
                    <b>{k.name} <span className="small muted" style={{ fontWeight: 400 }}>· {k.className}</span></b>
                    {k.lesson ? (
                      <>
                        <span>{k.lesson.title}{k.lesson.scripture && <span className="muted"> · {k.lesson.scripture}</span>}</span>
                        {k.lesson.memoryVerse && <span className="small"><span className="muted">{t('altarVerse')}:</span> {k.lesson.memoryVerse}</span>}
                      </>
                    ) : <span className="small muted">{t('altarNoLesson')}</span>}
                  </div>
                ))}
              </section>
            )}
          </>
        );
      })()}
    </div>
  );
}
