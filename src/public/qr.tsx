// Full-screen offering QR for the projector or a phone held up at the door. No sign-in; the page
// shows only the church's name, the fund and the code.
import { useEffect } from 'react';
import { useParams } from 'react-router';

import { PublicApi } from '@/api/endpoints';
import { QrCode } from '@/components/qr';
import { ErrorState, Loading } from '@/components/ui';
import { useApi } from '@/lib/use-api';

export function PublicQrPage() {
  const { id = '' } = useParams();
  const { data, error, reload } = useApi(() => PublicApi.qr(id), [id]);
  useEffect(() => { document.title = data ? `Give · ${data.churchName}` : 'Scan to give'; }, [data]);
  if (error) return <div className="pqr"><div className="pqr-card"><ErrorState error={error} onRetry={reload} /></div></div>;
  if (!data) return <div className="pqr"><Loading /></div>;
  const size = 480;
  return (
    <div className="pqr">
      <div className="pqr-card">
        <div className="pqr-church">{data.logoUrl && <img src={data.logoUrl} alt="" />}<span>{data.churchName}</span></div>
        <h1>Scan to give</h1>
        <div className="pqr-fund">{data.fundName}</div>
        {data.status === 'closed' ? (
          <p className="pqr-closed">This code has been closed. Please ask at the office for the current one.</p>
        ) : data.imageUrl ? (
          <img className="pqr-img" src={data.imageUrl} alt={`UPI QR code for ${data.fundName}`} width={size} height={size} />
        ) : data.payload ? (
          <QrCode value={data.payload} size={size} label={`UPI QR code for ${data.fundName}`} />
        ) : null}
        <p className="pqr-line">Any UPI app · enter the amount you wish</p>
      </div>
    </div>
  );
}
