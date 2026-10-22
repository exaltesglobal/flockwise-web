import { ArrowLeft } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import type { SessionStore } from '@/api/client';
import type { OtpRequest, Session } from '@/api/types';
import { isUsingMocks } from '@/lib/config';
import { useAction } from '@/lib/use-api';

import { Field, FormError } from './ui';

type Labels = {
  identifier: string;
  sendCode: string;
  enterCode: string;
  codeSentTo: (target: string) => string;
  verify: string;
  changeNumber: string;
  demoHint: string;
};

type AuthFns = {
  requestOtp: (email: string) => Promise<OtpRequest>;
  verifyOtp: (requestId: string, code: string) => Promise<Session>;
};

/** Passwordless sign-in shared by the admin and member sides: email, then the 6-digit code we emailed. */
export function OtpSignIn({ auth, store, labels, validate }: { auth: AuthFns; store: SessionStore; labels: Labels; validate?: (s: Session) => string | null }) {
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState<OtpRequest | null>(null);
  const [code, setCode] = useState('');
  const request = useAction(auth.requestOtp);
  const verify = useAction(auth.verifyOtp);
  const [denied, setDenied] = useState<string | null>(null);

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    const res = await request.run(identifier.trim());
    if (res) setOtp(res);
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (!otp) return;
    const session = await verify.run(otp.requestId, code.trim());
    if (!session) return;
    const problem = validate?.(session) ?? null;
    if (problem) setDenied(problem);
    else store.set(session);
  }

  if (!otp) {
    return (
      <form className="stack" onSubmit={onRequest}>
        <Field label={labels.identifier} error={request.error?.fields?.email ?? request.error?.fields?.identifier}>
          <input className="input" type="email" inputMode="email" autoFocus autoComplete="email" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@example.com" />
        </Field>
        <FormError error={request.error?.fields ? null : request.error} />
        <button className="btn primary lg block" disabled={request.busy || !identifier.trim()}>
          {request.busy ? '…' : labels.sendCode}
        </button>
        {isUsingMocks() && <p className="small muted">{labels.demoHint}</p>}
      </form>
    );
  }

  return (
    <form className="stack" onSubmit={onVerify}>
      <p className="muted">{labels.codeSentTo(identifier)}</p>
      <Field label={labels.enterCode}>
        <input
          className="input"
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          style={{ letterSpacing: '0.4em', fontSize: 20, height: 48, textAlign: 'center' }}
        />
      </Field>
      <FormError error={verify.error} />
      {denied && <div className="alert error">{denied}</div>}
      <button className="btn primary lg block" disabled={verify.busy || code.length !== 6}>
        {verify.busy ? '…' : labels.verify}
      </button>
      <button
        type="button"
        className="btn ghost"
        onClick={() => {
          setOtp(null);
          setCode('');
          setDenied(null);
        }}
      >
        <ArrowLeft size={16} /> {labels.changeNumber}
      </button>
      {isUsingMocks() && <p className="small muted">{labels.demoHint}</p>}
    </form>
  );
}
