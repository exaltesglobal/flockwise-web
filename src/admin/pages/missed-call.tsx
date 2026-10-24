// The missed-call line for feature phones. The church takes a virtual number from its telephony
// provider and points the provider's missed-call webhook at Flockwise. A call from a known phone
// during a service marks attendance (and the household's adults); at any other time, or on the
// prayer number, a pastor gets a call-back request. Callers are texted back in their own language.
// The office sets it up here, tries a number, prints the notice-board poster and links unknown callers.
import { Check, Copy, Link2, Phone, PhoneMissed, Printer, RefreshCw, Save } from 'lucide-react';
import { useEffect, useState } from 'react';

import { adminSession } from '@/api/client';
import type { LanguageCode, MissedCall, MissedCallAction, MissedCallSettings } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { ChurchLogo } from '@/components/brand';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatRelative, formatTime } from '@/lib/format';
import { useCan } from '@/lib/perms';
import { useSession } from '@/lib/session';
import { useAction, useApi } from '@/lib/use-api';

import { PersonSearch } from '../components/person-picker';
import { PageHeader } from '../layout';

const ACTION: Record<MissedCallAction, { label: string; badge: string }> = {
  checked_in: { label: 'Marked present', badge: 'ok' },
  already: { label: 'Already present', badge: 'gray' },
  no_service: { label: 'No service on', badge: 'warn' },
  closed: { label: 'Check-in closed', badge: 'warn' },
  prayer: { label: 'Prayer call-back', badge: '' },
  unknown: { label: 'Unknown number', badge: 'warn' },
  duplicate: { label: 'Repeat', badge: 'gray' },
  off: { label: 'Line was off', badge: 'gray' },
};

const PROVIDERS = [
  { name: 'Exotel', how: 'Flow builder › add a Passthru applet on the missed-call number and paste the URL.' },
  { name: 'Knowlarity', how: 'Missed call service › Webhook URL (GET or POST both work).' },
  { name: 'MyOperator', how: 'Integrations › Webhooks › on every missed call, POST to this URL.' },
  { name: 'Ozonetel / Twilio', how: 'Set the number’s voice webhook to this URL; the caller’s number comes as From/CallFrom.' },
];

// The poster lines, in the church's languages.
const POSTER: Partial<Record<LanguageCode, { attendance: string; prayer: string }>> & { en: { attendance: string; prayer: string } } = {
  en: { attendance: 'Give a missed call from your phone to mark your attendance', prayer: 'Give a missed call and a pastor will call you back to pray' },
  hi: { attendance: 'उपस्थिति दर्ज करने के लिए अपने फ़ोन से मिस्ड कॉल दें', prayer: 'मिस्ड कॉल दें, पास्टर प्रार्थना के लिए वापस कॉल करेंगे' },
  ta: { attendance: 'வருகை பதிவுக்கு உங்கள் போனிலிருந்து மிஸ்டு கால் கொடுங்கள்', prayer: 'மிஸ்டு கால் கொடுங்கள்; போதகர் ஜெபிக்க திரும்ப அழைப்பார்' },
  te: { attendance: 'హాజరు నమోదుకు మీ ఫోన్ నుండి మిస్డ్ కాల్ ఇవ్వండి', prayer: 'మిస్డ్ కాల్ ఇవ్వండి; పాస్టర్ ప్రార్థన కోసం తిరిగి కాల్ చేస్తారు' },
  ml: { attendance: 'ഹാജർ രേഖപ്പെടുത്താൻ നിങ്ങളുടെ ഫോണിൽ നിന്ന് മിസ്ഡ് കോൾ നൽകുക', prayer: 'മിസ്ഡ് കോൾ നൽകൂ; പാസ്റ്റർ പ്രാർത്ഥിക്കാൻ തിരികെ വിളിക്കും' },
  kn: { attendance: 'ಹಾಜರಾತಿ ದಾಖಲಿಸಲು ನಿಮ್ಮ ಫೋನ್‌ನಿಂದ ಮಿಸ್ಡ್ ಕಾಲ್ ಕೊಡಿ', prayer: 'ಮಿಸ್ಡ್ ಕಾಲ್ ಕೊಡಿ; ಪಾಸ್ಟರ್ ಪ್ರಾರ್ಥನೆಗೆ ಮರಳಿ ಕರೆ ಮಾಡುತ್ತಾರೆ' },
};

export function MissedCallPage() {
  const session = useSession(adminSession);
  const can = useCan();
  const toast = useToast();
  const { data, error, reload, setData } = useApi(AdminApi.missedCall.hub);
  const church = useApi(AdminApi.settings.get);
  const [draft, setDraft] = useState<MissedCallSettings | null>(null);
  const [linking, setLinking] = useState<MissedCall | null>(null);
  useEffect(() => { if (data) setDraft(data.settings); }, [data]);

  const save = useAction(async (extra: { newKey?: boolean } = {}) => {
    if (!draft) return;
    setData(await AdminApi.missedCall.save({ ...draft, ...extra }));
    toast(extra.newKey ? 'New key made. Update the URL at your provider.' : 'Saved');
  });
  const copy = (v: string) => navigator.clipboard?.writeText(v).then(() => toast('Copied'), () => undefined);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data || !draft) return <Loading />;
  const s = data.settings;
  const dirty = JSON.stringify(draft) !== JSON.stringify(s);
  const oneNumber = !draft.prayerNumber || !draft.attendanceNumber;
  const langs = (church.data?.languages?.length ? church.data.languages : ['en']) as LanguageCode[];

  return (
    <>
      <div className="mc-screen">
        <PageHeader
          title="Missed-call line"
          subtitle="For members with a basic phone: a free missed call from their number marks them present during the service, and at any other time asks a pastor to call back and pray."
          actions={<button className="btn" onClick={() => window.print()} disabled={!s.attendanceNumber && !s.prayerNumber}><Printer size={15} /> Notice-board poster</button>}
        />
        <div className="row wrap" style={{ gap: 10, marginBottom: 14 }}>
          <span className={`badge ${s.enabled ? 'ok' : 'gray'}`}>{s.enabled ? 'On' : 'Off'}</span>
          <span className="small muted">
            {data.serviceNow ? <><strong>{data.serviceNow.title}</strong> is on now: calls to the line mark attendance.</> : 'No service is on right now: calls go to the prayer line.'}
          </span>
        </div>
        <div className="grid cols-4">
          <div className="card card-pad mc-stat"><span className="small muted">Calls last Sunday</span><b>{data.stats.lastSunday}</b></div>
          <div className="card card-pad mc-stat"><span className="small muted">Marked present by phone</span><b>{data.stats.checkedIn}</b></div>
          <div className="card card-pad mc-stat"><span className="small muted">Prayer call-backs</span><b>{data.stats.prayer}</b></div>
          <div className="card card-pad mc-stat"><span className="small muted">Unknown numbers</span><b>{data.stats.unknown}</b></div>
        </div>

        <div className="grid cols-2" style={{ marginTop: 16, alignItems: 'start' }}>
          <div className="card card-pad stack" style={{ gap: 12 }}>
            <div className="row between"><h3>Set-up</h3>{can('settings') && <button className="btn primary sm" onClick={() => void save.run({})} disabled={save.busy || !dirty}><Save size={14} /> {save.busy ? 'Saving…' : 'Save'}</button>}</div>
            <FormError error={save.error} />
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={draft.enabled} disabled={!can('settings')} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /> Line on</label>
            <div className="grid cols-2">
              <Field label="Attendance number" hint="The virtual number from your provider">
                <input value={draft.attendanceNumber} disabled={!can('settings')} placeholder="080 4567 8900" onChange={(e) => setDraft({ ...draft, attendanceNumber: e.target.value })} />
              </Field>
              <Field label="Prayer number" hint={oneNumber ? 'Blank: the one number does both. During a service it marks attendance; at any other time it is the prayer line.' : 'A second number that is always the prayer line'}>
                <input value={draft.prayerNumber} disabled={!can('settings')} placeholder="Same number" onChange={(e) => setDraft({ ...draft, prayerNumber: e.target.value })} />
              </Field>
            </div>
            <Field label="Provider" hint="For your own notes">
              <input value={draft.provider} disabled={!can('settings')} placeholder="Exotel, Knowlarity, MyOperator…" onChange={(e) => setDraft({ ...draft, provider: e.target.value })} />
            </Field>
            <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}><input type="checkbox" checked={draft.household} disabled={!can('settings')} onChange={(e) => setDraft({ ...draft, household: e.target.checked })} style={{ marginTop: 3 }} /><span>Mark the adults of the caller’s household present too<br /><span className="small muted">One phone per family is common. Children are not marked, so the kids’ rooms stay exact.</span></span></label>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={draft.reply} disabled={!can('settings')} onChange={(e) => setDraft({ ...draft, reply: e.target.checked })} /> Text the caller back in their own language</label>
            {draft.reply && (
              <div className="row wrap" style={{ gap: 10 }}>
                <Segmented value={draft.channel} options={[{ value: 'sms', label: 'SMS' }, { value: 'whatsapp', label: 'WhatsApp' }]} onChange={(channel) => setDraft({ ...draft, channel })} />
                {!data.channelReady && <span className="small danger-text">{draft.channel === 'sms' ? 'No SMS provider is set up on the server yet.' : 'Connect Chitthi in Settings › Integrations first.'}</span>}
              </div>
            )}
          </div>

          <div className="stack" style={{ gap: 16 }}>
            <div className="card card-pad stack" style={{ gap: 10 }}>
              <h3>Point your provider here</h3>
              {data.webhookUrl ? (
                <>
                  <div className="mc-url">{data.webhookUrl}</div>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <button className="btn sm" onClick={() => copy(data.webhookUrl!)}><Copy size={13} /> Copy</button>
                    {can('settings') && <button className="btn sm ghost" onClick={() => void save.run({ newKey: true })} disabled={save.busy}><RefreshCw size={13} /> New key</button>}
                  </div>
                </>
              ) : s.key ? (
                <p className="small muted">This server has no public address for webhooks yet (API_PUBLIC_URL). Once it has one, the URL appears here.</p>
              ) : (
                <p className="small muted">Save the set-up once and the URL appears here.</p>
              )}
              <ul className="setup-steps">
                {PROVIDERS.map((p) => <li key={p.name}><strong>{p.name}:</strong> {p.how}</li>)}
              </ul>
              <p className="small muted">GET or POST both work, and the caller’s number is read whatever the provider calls it (CallFrom, From, caller_id…). A repeat within two minutes is ignored.</p>
            </div>
            <TryIt onDone={reload} />
          </div>
        </div>

        {data.unknown.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-pad row between"><h3>Numbers we do not know</h3><span className="small muted">Last 30 days</span></div>
            <table className="table compact">
              <thead><tr><th>Number</th><th>Called</th><th>Line</th><th /></tr></thead>
              <tbody>
                {data.unknown.map((c) => (
                  <tr key={c.id}>
                    <td><Phone size={13} /> {fmtPhone(c.from)}</td>
                    <td className="small muted">{formatRelative(c.at)}</td>
                    <td className="small">{c.line === 'attendance' ? 'Attendance' : 'Prayer'}</td>
                    <td style={{ textAlign: 'right' }}>{(can('people.edit') || can('checkin')) && <button className="btn sm" onClick={() => setLinking(c)}><Link2 size={13} /> This is…</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-pad row between"><h3>Recent calls</h3><span className="small muted">{data.stats.total} so far</span></div>
          {data.recent.length === 0 ? (
            <Empty icon={<PhoneMissed size={26} />} title="No calls yet" body="Switch the line on, point your provider at the URL and put the poster up. Try a number on the right to see what a caller gets." />
          ) : (
            <table className="table compact">
              <thead><tr><th>When</th><th>Who</th><th>Line</th><th>Outcome</th><th>Reply</th></tr></thead>
              <tbody>
                {data.recent.map((c) => (
                  <tr key={c.id} style={c.test ? { opacity: 0.7 } : undefined}>
                    <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{formatRelative(c.at)} · {formatTime(c.at)}</td>
                    <td>{c.personName ? <strong>{c.personName}</strong> : <span className="muted">{fmtPhone(c.from)}</span>}{c.test && <span className="badge gray" style={{ marginLeft: 6 }}>Test</span>}</td>
                    <td className="small">{c.line === 'attendance' ? c.eventTitle ?? 'Attendance' : 'Prayer'}</td>
                    <td><span className={`badge ${ACTION[c.action].badge}`}>{ACTION[c.action].label}</span>{c.others > 0 && <span className="small muted"> +{c.others} at home</span>}</td>
                    <td className="small muted">{c.replied ? <><Check size={13} /> Sent</> : c.reply ? 'Not sent' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* The notice-board poster. */}
      <div className="mc-print">
        <ChurchLogo church={session?.church} size={80} />
        <h1>{church.data?.name ?? session?.church?.name ?? ''}</h1>
        <div className="mc-line">{POSTER.en.attendance}</div>
        <div className="mc-number">{s.attendanceNumber || s.prayerNumber}</div>
        <div className="mc-langs">{langs.filter((l) => l !== 'en').map((l) => <span key={l}>{POSTER[l]?.attendance}</span>)}</div>
        {s.prayerNumber && s.prayerNumber !== s.attendanceNumber ? (
          <>
            <div className="mc-line" style={{ marginTop: 24 }}>{POSTER.en.prayer}</div>
            <div className="mc-number">{s.prayerNumber}</div>
            <div className="mc-langs">{langs.filter((l) => l !== 'en').map((l) => <span key={l}>{POSTER[l]?.prayer}</span>)}</div>
          </>
        ) : (
          <div className="mc-line" style={{ marginTop: 20 }}>{POSTER.en.prayer.replace('Give a missed call', 'On any other day, give a missed call')}</div>
        )}
        <div className="mc-foot">The call is free: it cuts off before anyone answers. Call from the number the church has for you. You will get a text back.</div>
      </div>

      {linking && (
        <Modal title={`Who is ${fmtPhone(linking.from)}?`} onClose={() => setLinking(null)}>
          <p className="small muted">The number goes on their record if they have none, and if the service is still on they are marked present.</p>
          <PersonSearch autoFocus onPick={async (p) => {
            try {
              await AdminApi.missedCall.link(linking.id, p.id);
              toast(`Linked to ${p.name}`);
              setLinking(null);
              void reload();
            } catch (e) {
              toast((e as Error).message);
            }
          }} />
        </Modal>
      )}
    </>
  );
}

function TryIt({ onDone }: { onDone: () => void }) {
  const [from, setFrom] = useState('');
  const [result, setResult] = useState<MissedCall | null>(null);
  const run = useAction(async () => { const r = await AdminApi.missedCall.try(from); setResult(r); onDone(); });
  return (
    <div className="card card-pad stack" style={{ gap: 10 }}>
      <h3>Try a number</h3>
      <p className="small muted">See what a caller gets right now. Nothing is texted to them; a test is kept out of the counts.</p>
      <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void run.run(); }}>
        <input className="grow" value={from} placeholder="98765 43210" onChange={(e) => setFrom(e.target.value)} />
        <button className="btn" type="submit" disabled={run.busy || from.replace(/\D/g, '').length < 10}><PhoneMissed size={14} /> Call</button>
      </form>
      <FormError error={run.error} />
      {result && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <span className={`badge ${ACTION[result.action].badge}`}>{ACTION[result.action].label}</span>
            <span className="small">{result.personName ?? 'Not in the records'}{result.eventTitle ? ` · ${result.eventTitle}` : ''}{result.others ? ` · +${result.others} at home` : ''}</span>
          </div>
          {result.reply && <div className="mc-reply small">{result.reply}</div>}
        </div>
      )}
    </div>
  );
}

const fmtPhone = (d: string) => (d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : d);
