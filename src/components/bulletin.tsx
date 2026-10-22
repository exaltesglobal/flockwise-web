// The Sunday bulletin as people read it: in the member app, from the share link, and as the office's preview.
import type { BulletinView, Currency, PlanItemKind } from '@/api/admin-types';
import { formatDay, formatMoney, formatTime } from '@/lib/format';

const KIND: Partial<Record<PlanItemKind, string>> = { song: 'Song', reading: 'Reading', sermon: 'Message', prayer: 'Prayer', offering: 'Offering', announcement: 'Notices', video: 'Video' };

function dateLong(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function BulletinDoc({ b, currency = 'INR' }: { b: BulletinView; currency?: Currency }) {
  return (
    <article className="bulletin">
      <header className="bulletin-head">
        {b.church.logoUrl && <img src={b.church.logoUrl} alt="" className="bulletin-logo" />}
        <div className="bulletin-church">{b.church.name}</div>
        <h1>{b.service?.title ?? b.title}</h1>
        <div className="bulletin-date">{dateLong(b.date)}{b.service ? ` · ${formatTime(b.service.startsAt)}` : ''}{b.service?.location ? ` · ${b.service.location}` : ''}</div>
        {b.service?.theme && <div className="bulletin-theme">{b.service.theme}</div>}
      </header>

      {b.verse && <blockquote className="bulletin-verse">{b.verse}</blockquote>}
      {b.intro && <p className="bulletin-intro">{b.intro}</p>}

      {b.order.length > 0 && (
        <section>
          <h2>Order of service</h2>
          <ol className="bulletin-order">
            {b.order.map((o, i) => (
              <li key={i}>
                <span className="bulletin-kind">{KIND[o.kind] ?? ''}</span>
                <span className="bulletin-item">{o.title}{o.person && <span className="bulletin-person"> · {o.person}</span>}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {b.announcements.length > 0 && (
        <section>
          <h2>Notices</h2>
          {b.announcements.map((a) => (
            <div key={a.id} className="bulletin-notice">
              <h3>{a.title}</h3>
              <p>{a.body}</p>
            </div>
          ))}
        </section>
      )}

      {b.events.length > 0 && (
        <section>
          <h2>This week</h2>
          <ul className="bulletin-list">
            {b.events.map((e) => <li key={e.id}><b>{formatDay(e.startsAt)} {formatTime(e.startsAt)}</b> · {e.title}{e.location ? ` · ${e.location}` : ''}</li>)}
          </ul>
        </section>
      )}

      {b.celebrations.length > 0 && (
        <section>
          <h2>Birthdays and anniversaries</h2>
          <ul className="bulletin-list">
            {b.celebrations.map((c, i) => <li key={i}>{c.kind === 'birthday' ? '🎂' : '💍'} <b>{c.name}</b> · {new Date(`${c.date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}{c.years ? ` · ${c.years} years` : ''}</li>)}
          </ul>
        </section>
      )}

      {b.serving.length > 0 && (
        <section>
          <h2>Serving today</h2>
          <ul className="bulletin-list">
            {b.serving.map((s) => <li key={s.team}><b>{s.team}:</b> {s.names.join(', ')}</li>)}
          </ul>
        </section>
      )}

      {b.sections.includes('giving') && (
        <section>
          <h2>Giving</h2>
          <p>Give by UPI, card or netbanking at <a href={b.giving.url}>{b.giving.url.replace(/^https?:\/\//, '')}</a>. 80G receipts are in the app.</p>
          {b.giving.campaigns.map((c) => (
            <div key={c.id} className="bulletin-campaign">
              <b>{c.name}</b>
              {c.goal ? <div className="progress"><i style={{ width: `${Math.min(100, c.percent ?? 0)}%` }} /></div> : null}
              <span>{formatMoney(c.raised, currency)}{c.goal ? ` of ${formatMoney(c.goal, currency)}` : ' given'}</span>
            </div>
          ))}
        </section>
      )}

      <footer className="bulletin-foot">
        {[b.church.address, b.church.phone, b.church.website].filter(Boolean).join(' · ')}
      </footer>
    </article>
  );
}
