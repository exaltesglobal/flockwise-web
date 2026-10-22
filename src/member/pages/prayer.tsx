import { CheckCircle2, HandHeart, Lock } from 'lucide-react';
import { useState } from 'react';

import { MemberApi } from '@/api/endpoints';
import { ErrorState, FormError, Loading, Segmented, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { formatRelative } from '@/lib/format';
import { useAction, useApi } from '@/lib/use-api';

export function MemberPrayerPage() {
  const { t, locale } = useT();
  const { data, error, reload, setData } = useApi(MemberApi.prayer.list);
  const [text, setText] = useState('');
  const [visibility, setVisibility] = useState<'pastors' | 'church'>('church');
  const toast = useToast();
  const create = useAction(() => MemberApi.prayer.create(text.trim(), visibility));

  const replace = (p: Awaited<ReturnType<typeof MemberApi.prayer.pray>>) =>
    data && setData({ ...data, data: data.data.map((x) => (x.id === p.id ? p : x)) });

  return (
    <>
      <div>
        <h1>{t('prayerTitle')}</h1>
        <p className="muted">{t('prayerBody')}</p>
      </div>
      <div className="card card-pad stack">
        <FormError error={create.error} />
        <textarea className="textarea" rows={3} placeholder={t('prayerPlaceholder')} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <Segmented value={visibility} options={[{ value: 'church', label: t('visibilityChurch') }, { value: 'pastors', label: t('visibilityPastors') }]} onChange={setVisibility} />
          <button className="btn primary" disabled={!text.trim() || create.busy} onClick={async () => {
            if (await create.run()) { setText(''); toast(t('saved')); reload(); }
          }}>{t('shareRequest')}</button>
        </div>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.data.length === 0 ? (
        <p className="muted">{t('noPrayer')}</p>
      ) : (
        <div className="tiles">
          {data.data.map((p) => (
            <div key={p.id} className="card card-pad stack" style={{ gap: 8 }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <strong>{p.name}</strong>
                {p.mine && <span className="badge">{t('yours')}</span>}
                {p.visibility === 'pastors' && <span className="badge gray"><Lock size={11} /> {t('visibilityPastors')}</span>}
                {p.status === 'answered' && <span className="badge ok"><CheckCircle2 size={12} /> {t('answered')}</span>}
                <span className="small muted">{formatRelative(p.createdAt, locale)}</span>
              </div>
              <p style={{ whiteSpace: 'pre-wrap' }}>{p.text}</p>
              {p.answeredNote && <p className="small" style={{ color: 'var(--ok)' }}>{p.answeredNote}</p>}
              <div className="row wrap">
                <button className={`btn sm ${p.iPrayed ? 'primary' : ''}`} disabled={p.iPrayed} onClick={async () => replace(await MemberApi.prayer.pray(p.id))}>
                  <HandHeart size={15} /> {p.iPrayed ? t('prayedCount', { count: p.prayedCount }) : t('iPrayed')}
                </button>
                {!p.iPrayed && p.prayedCount > 0 && <span className="small muted">{t('prayedCount', { count: p.prayedCount })}</span>}
                {p.mine && p.status === 'open' && (
                  <button className="btn sm ghost" onClick={async () => replace(await MemberApi.prayer.update(p.id, { status: 'answered' }))}>
                    <CheckCircle2 size={15} /> {t('markAnswered')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
