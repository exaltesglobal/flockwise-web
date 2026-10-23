// Giving › Offering QR: one Razorpay UPI code per fund for the offering box, the screen and the
// bulletin. Each scan becomes a gift on the Donations tab by itself (webhook qr_code.credited).
import { ExternalLink, Plus, Printer, QrCode as QrIcon, Smartphone, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { adminSession } from '@/api/client';
import { AdminApi } from '@/api/endpoints';
import type { Currency } from '@/api/types';
import { QrCode } from '@/components/qr';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import type { OfferingQrView } from '@/core/types';
import { formatMoney, formatRelative } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

function QrImage({ code, size }: { code: OfferingQrView; size: number }) {
  if (code.imageUrl) return <img src={code.imageUrl} alt={`QR code for ${code.fundName}`} width={size} height={size} style={{ borderRadius: 12, background: '#fff' }} />;
  if (code.payload) return <QrCode value={code.payload} size={size} label={`QR code for ${code.fundName}`} />;
  return null;
}

export function OfferingQrTab({ currency }: { currency: Currency }) {
  const hub = useApi(AdminApi.giving.qr.hub);
  const can = useCan();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [printing, setPrinting] = useState<OfferingQrView | null>(null);
  const church = adminSession.get()?.church;
  const close = useAction(async (id: string) => {
    await AdminApi.giving.qr.close(id);
    toast('Closed. Scans of that code will no longer go through.');
    hub.reload();
  });
  const testGift = useAction(async (id: string) => {
    const r = await AdminApi.giving.qr.testGift(id, 50000);
    toast(`Test gift of ${formatMoney(50000, currency)} recorded on ${r.code.fundName}.`);
    hub.reload();
  });
  // The poster stays mounted (hidden on screen) so the print dialog always has it, whatever the browser's afterprint timing.
  const print = (c: OfferingQrView) => {
    setPrinting(c);
    setTimeout(() => window.print(), 80);
  };

  if (hub.error) return <ErrorState error={hub.error} onRetry={hub.reload} />;
  if (!hub.data) return <Loading />;
  const d = hub.data;
  const demo = d.codes.some((c) => c.payload && !c.imageUrl);
  const live = d.codes.filter((c) => c.status === 'active');
  const closed = d.codes.filter((c) => c.status === 'closed');

  return (
    <div className="stack oq-screen">
      <div className="card card-pad oq-intro">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>Scan-to-give for the offering box and the screen</h3>
            <p className="muted small" style={{ margin: '4px 0 0' }}>
              One UPI QR per fund, created on the church’s own Razorpay account. Every scan lands on the Donations tab by itself with the fund already filled in; members are matched by their mobile number and get their receipt as usual.
            </p>
          </div>
          {can('giving.edit') && d.ready && <button className="btn primary" onClick={() => setAdding(true)}><Plus size={15} /> New QR code</button>}
        </div>
        {!d.ready && (
          <div className="alert warn" style={{ marginTop: 12 }}>
            {d.reason} Then in Razorpay › Webhooks add the event <span className="mono">{d.webhookEvent}</span> to the church’s webhook (the URL is under Settings › Giving).
          </div>
        )}
        {d.ready && !demo && (
          <p className="muted small" style={{ margin: '10px 0 0' }}>Make sure the church’s Razorpay webhook includes the event <span className="mono">{d.webhookEvent}</span>, or scans will reach the bank but not this page.</p>
        )}
      </div>

      {!live.length && <Empty icon={<QrIcon size={28} />} title="No QR codes yet" body="Make one for Tithes & Offerings first. Print it for the offering box and open it on the screen during the offering." />}

      {live.length > 0 && (
        <div className="oq-grid">
          {live.map((c) => (
            <div key={c.id} className="card card-pad oq-card">
              <div className="oq-qr"><QrImage code={c} size={168} /></div>
              <div className="oq-body">
                <b>{c.name}</b>
                <span className="muted small">{c.fundName}</span>
                <div className="oq-stats">
                  <div><span className="oq-num">{formatMoney(c.totalThisMonth, currency)}</span><span className="muted small">this month · {c.giftsThisMonth} gift{c.giftsThisMonth === 1 ? '' : 's'}</span></div>
                  <div><span className="oq-num">{formatMoney(c.totalAll, currency)}</span><span className="muted small">all time · {c.giftsAll}</span></div>
                </div>
                <span className="muted small">{c.lastGiftAt ? `Last gift ${formatRelative(c.lastGiftAt)}` : 'No gifts yet'}</span>
                <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  <a className="btn sm" href={c.publicUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open on screen</a>
                  <button className="btn sm" onClick={() => print(c)}><Printer size={14} /> Print poster</button>
                  {!c.imageUrl && can('giving.edit') && <button className="btn sm" onClick={() => testGift.run(c.id)} disabled={testGift.busy} title="Demo only"><Smartphone size={14} /> Pretend a scan</button>}
                  {can('giving.edit') && <button className="btn sm ghost" onClick={() => { if (confirm(`Close “${c.name}”? Scans of it will stop going through; old gifts stay.`)) void close.run(c.id); }} disabled={close.busy}><X size={14} /> Close</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {(close.error || testGift.error) && <FormError error={close.error ?? testGift.error} />}

      {closed.length > 0 && (
        <details className="card card-pad">
          <summary>Closed codes ({closed.length})</summary>
          <table className="table" style={{ marginTop: 10 }}>
            <thead><tr><th>Name</th><th>Fund</th><th>Gifts</th><th>Total</th><th>Closed</th></tr></thead>
            <tbody>{closed.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.fundName}</td><td>{c.giftsAll}</td><td>{formatMoney(c.totalAll, currency)}</td><td className="muted">{c.closedAt ? formatRelative(c.closedAt) : ''}</td></tr>)}</tbody>
          </table>
        </details>
      )}

      {adding && <NewQr funds={d.funds} onClose={() => setAdding(false)} onDone={() => { setAdding(false); hub.reload(); }} />}

      {printing && (
        <div className="qr-print">
          <div className="qr-print-church">{church?.logoUrl && <img src={church.logoUrl} alt="" />}<span>{church?.name}</span></div>
          <h1>Scan to give</h1>
          <QrImage code={printing} size={420} />
          <div className="qr-print-fund">{printing.fundName}</div>
          <div className="qr-print-line">Open any UPI app (Google Pay, PhonePe, Paytm, BHIM), scan, and enter the amount. Your gift is counted for you by the mobile number on your UPI account.</div>
          <div className="qr-print-foot">{printing.name} · {printing.publicUrl}</div>
        </div>
      )}
    </div>
  );
}

function NewQr({ funds, onClose, onDone }: { funds: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [fundId, setFundId] = useState(funds[0]?.id ?? '');
  const [name, setName] = useState('Offering box');
  const save = useAction(async (e: FormEvent) => {
    e.preventDefault();
    await AdminApi.giving.qr.create({ fundId, name: name.trim() || undefined });
    onDone();
  });
  return (
    <Modal title="New offering QR code" onClose={onClose}>
      <form className="stack" onSubmit={save.run}>
        <Field label="Fund">
          <select value={fundId} onChange={(e) => setFundId(e.target.value)} required>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label="Where it will be" hint="Shown only to the office, so you can tell codes apart: Offering box, Side door, Building fund stall.">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </Field>
        <FormError error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={save.busy || !fundId}>Create code</button>
        </div>
      </form>
    </Modal>
  );
}
