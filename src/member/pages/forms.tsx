import { ArrowLeft, CalendarDays, ChevronRight, ClipboardList, MapPin } from 'lucide-react';
import { Link, useParams } from 'react-router';

import type { FormResponse } from '@/api/admin-types';
import { MemberApi } from '@/api/endpoints';
import { RegistrationForm } from '@/components/registration';
import { ErrorState, Loading, useToast } from '@/components/ui';
import { type StringKey, useT } from '@/i18n';
import { formatDay, formatMoney, formatTime } from '@/lib/format';
import { useApi } from '@/lib/use-api';

export const STATUS_KEY: Record<FormResponse['status'], StringKey> = {
  confirmed: 'registered',
  waitlisted: 'waitlisted',
  pending_payment: 'pendingPayment',
  cancelled: 'cancelled',
};
const STATUS_BADGE: Record<FormResponse['status'], string> = { confirmed: 'ok', waitlisted: 'warn', pending_payment: 'warn', cancelled: 'gray' };

export function MemberFormsPage() {
  const { t, locale } = useT();
  const { data, error, reload } = useApi(MemberApi.forms.list);
  return (
    <>
      <div>
        <h1>{t('tabForms')}</h1>
        <p className="muted">{t('formsBody')}</p>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Loading /> : data.length === 0 ? (
        <p className="muted">{t('noForms')}</p>
      ) : (
        <div className="stack">
          {data.map((f) => (
            <Link key={f.id} to={`/app/forms/${f.id}`} className="card card-pad row" style={{ gap: 12, color: 'inherit' }}>
              <ClipboardList size={22} className="muted" />
              <div className="grow" style={{ minWidth: 0 }}>
                <h3>{f.title}</h3>
                <div className="small muted">
                  {f.event ? `${formatDay(f.event.startsAt, locale)} · ${formatTime(f.event.startsAt, locale)}` : f.description.slice(0, 90)}
                </div>
              </div>
              {f.myStatus ? <span className={`badge ${STATUS_BADGE[f.myStatus]}`}>{t(STATUS_KEY[f.myStatus])}</span>
                : !f.isOpen ? <span className="badge gray">{t('registrationClosed')}</span> : null}
              <ChevronRight size={18} className="muted" />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export function MemberFormPage() {
  const { id = '' } = useParams();
  const { t, locale } = useT();
  const toast = useToast();
  const { data: form, error, reload } = useApi(() => MemberApi.forms.get(id), [id]);
  const paid = new URLSearchParams(window.location.search).get('payment') === 'success';

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!form) return <Loading />;
  const mine = form.myResponses.filter((r) => r.status !== 'cancelled');

  return (
    <>
      <Link to={form.event ? `/app/events/${form.event.id}` : '/app/forms'} className="small row" style={{ gap: 4 }}><ArrowLeft size={15} /> {form.event ? t('backToEvents') : t('tabForms')}</Link>
      <div className="card card-pad stack lg">
        <div className="stack" style={{ gap: 8 }}>
          <h1>{form.title}</h1>
          {form.event && (
            <>
              <span className="row" style={{ gap: 8 }}><CalendarDays size={17} className="muted" /> {formatDay(form.event.startsAt, locale)}, {formatTime(form.event.startsAt, locale)}</span>
              {form.event.location && <span className="row" style={{ gap: 8 }}><MapPin size={17} className="muted" /> {form.event.location}</span>}
            </>
          )}
          {form.description && <p style={{ whiteSpace: 'pre-wrap' }}>{form.description}</p>}
        </div>
        {paid && <div className="alert info">{t('paymentReceived')}</div>}

        {mine.length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            <strong>{t('yourRegistrations')}</strong>
            {mine.map((r) => (
              <div key={r.id} className="ticket-row">
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div className="small muted">{r.amount ? formatMoney(r.amount, form.currency, locale) : t('free')}</div>
                </div>
                <span className={`badge ${STATUS_BADGE[r.status]}`}>{t(STATUS_KEY[r.status])}</span>
                {r.status !== 'confirmed' || r.amount === 0 ? (
                  <button className="btn sm ghost" onClick={async () => {
                    if (!confirm(`${t('cancelRegistration')}?`)) return;
                    try { await MemberApi.forms.cancel(form.id, r.id); toast(t('cancelled')); reload(); } catch (e) { toast((e as Error).message, 'error'); }
                  }}>{t('cancelRegistration')}</button>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <RegistrationForm form={form} askContact={false} submit={(input) => MemberApi.forms.submit(form.id, input)} onDone={() => reload()} />
      </div>
    </>
  );
}
