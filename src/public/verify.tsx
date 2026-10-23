// Certificate check: the QR on a baptism, confirmation, marriage or burial certificate (or a
// transfer letter) opens this page, which says whether the church issued it and whether it still
// stands. Shows only what confirms it; the register itself stays in the office.
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { PublicApi } from '@/api/endpoints';
import { ErrorState, Loading } from '@/components/ui';
import { useApi } from '@/lib/use-api';

import { Shell } from './public';

export function VerifyCertificatePage() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const [typed, setTyped] = useState('');
  const { data, error, reload } = useApi(() => (code ? PublicApi.verifyCertificate(code) : Promise.resolve(null)), [code]);
  useEffect(() => { document.title = data ? `${data.title} · ${data.church.name}` : 'Verify a certificate'; }, [data]);
  if (!code) {
    return (
      <Shell>
        <article className="card card-pad stack lg pub-form" style={{ alignItems: 'stretch' }}>
          <div className="row" style={{ gap: 10 }}><ShieldCheck size={26} /><h1>Verify a certificate</h1></div>
          <p className="muted">Type the code printed under the QR on a church certificate or transfer letter.</p>
          <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (typed.trim()) nav(`/verify/${typed.trim().toUpperCase()}`); }}>
            <input className="input" style={{ flex: 1, letterSpacing: '0.08em', textTransform: 'uppercase' }} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="e.g. 7KQ2MZ8H4T" autoFocus />
            <button className="btn primary" type="submit">Check</button>
          </form>
        </article>
      </Shell>
    );
  }
  if (error) return <Shell><article className="card card-pad stack lg pub-form" style={{ alignItems: 'flex-start' }}><div className="row" style={{ gap: 10 }}><XCircle size={28} color="var(--danger)" /><h1>Not found</h1></div><ErrorState error={error} onRetry={reload} /><button className="btn" onClick={() => nav('/verify')}>Try another code</button></article></Shell>;
  if (!data) return <Shell><Loading /></Shell>;
  return (
    <Shell churchName={data.church.name} logoUrl={data.church.logoUrl}>
      <article className="card card-pad stack lg pub-form" style={{ alignItems: 'stretch' }}>
        <div className="row" style={{ gap: 10 }}>
          {data.ok ? <CheckCircle2 size={30} color="var(--ok)" /> : <XCircle size={30} color="var(--danger)" />}
          <div>
            <h1 style={{ fontSize: 22 }}>{data.ok ? 'Genuine certificate' : 'This certificate has been cancelled'}</h1>
            <span className="muted">{data.title} · {data.number}</span>
          </div>
        </div>
        {!data.ok && <p className="small" style={{ color: 'var(--danger)' }}>The church marked this register entry void{data.voidReason ? `: ${data.voidReason}` : ''}. Please contact the church office.</p>}
        <dl className="kv">
          <dt>Issued by</dt><dd>{data.church.name}{data.church.city ? `, ${data.church.city}` : ''}</dd>
          <dt>Name</dt><dd>{data.name}</dd>
          <dt>Date</dt><dd>{data.date}</dd>
          {data.place && <><dt>Place</dt><dd>{data.place}</dd></>}
          {data.officiant && <><dt>Officiant</dt><dd>{data.officiant}</dd></>}
          <dt>Recorded</dt><dd>{data.recordedAt} · {data.copies} cop{data.copies === 1 ? 'y' : 'ies'} issued</dd>
        </dl>
        <p className="small muted">This page confirms the entry in the church's register. It shows only what is on the certificate. For anything more, write to the church office.</p>
      </article>
    </Shell>
  );
}
