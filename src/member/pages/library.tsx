// The church library from the member's side: browse the shelf, ask for a book, and see what I have
// borrowed and when it is due back.
import { BookOpen, Search } from 'lucide-react';
import { useState } from 'react';

import { MemberApi } from '@/api/endpoints';
import type { MyLibrary } from '@/core/types';
import { ErrorState, FormError, Loading, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDay } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

const day = (d: string, locale: string) => formatDay(`${d}T12:00:00`, locale);

export function MemberLibraryPage() {
  const { t, locale } = useT();
  const toast = useToast();
  const { data, error, reload, setData } = useApi(MemberApi.library.get);
  const [search, setSearch] = useState('');
  const act = useAction(async (fn: () => Promise<MyLibrary>, msg: string) => { setData(await fn()); toast(msg); });
  const s = search.trim().toLowerCase();
  const books = (data?.books ?? []).filter((b) => !s || `${b.title} ${b.author} ${b.category} ${b.language}`.toLowerCase().includes(s));
  return (
    <>
      <div>
        <h1>{t('libraryTitle')}</h1>
        <p className="muted">{t('libraryBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : (
        <div className="stack">
          {data.loans.length > 0 && (
            <div className="card card-pad stack" style={{ gap: 8 }}>
              <span className="small muted">{t('libraryMine')}</span>
              {data.loans.map((l) => (
                <div key={l.id} className="row wrap" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <b>{l.title}</b>
                  {l.status === 'requested' ? <span className="badge gray">{t('libraryAsked')}</span>
                    : l.overdue ? <span className="badge warn">{t('libraryOverdue', { date: day(l.dueOn ?? '', locale) })}</span>
                    : <span className="small muted">{t('libraryDue', { date: day(l.dueOn ?? '', locale) })}</span>}
                </div>
              ))}
            </div>
          )}
          <FormError error={act.error} />
          {!data.books.length ? (
            <div className="card card-pad stack" style={{ alignItems: 'center', textAlign: 'center' }}><BookOpen size={28} /><p className="muted" style={{ margin: 0 }}>{t('libraryEmpty')}</p></div>
          ) : (
            <>
              <div className="lib-search"><Search size={16} /><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('librarySearch')} /></div>
              <div className="stack" style={{ gap: 8 }}>
                {books.map((b) => (
                  <div key={b.id} className="card card-pad row" style={{ justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <b>{b.title}</b>
                      <div className="small muted">{[b.author, b.category, b.language].filter(Boolean).join(' · ')}</div>
                    </div>
                    {b.mine === 'out' ? <span className="badge ok">{t('libraryWithYou')}</span>
                      : b.mine === 'requested' ? <button className="btn sm ghost" disabled={act.busy} onClick={() => void act.run(() => MemberApi.library.withdraw(b.id), t('libraryWithdrawn'))}>{t('libraryWithdraw')}</button>
                      : <button className={`btn sm ${b.available ? 'primary' : ''}`} disabled={act.busy} onClick={() => void act.run(() => MemberApi.library.request(b.id), t('libraryRequested'))}>{b.available ? t('libraryRequest') : t('libraryQueue')}</button>}
                  </div>
                ))}
                {!books.length && <p className="muted small">{t('libraryNoMatch')}</p>}
              </div>
              <p className="small muted">{t('libraryLoanDays', { days: String(data.loanDays) })}</p>
            </>
          )}
        </div>
      )}
    </>
  );
}
