import { Baby, BellRing, Camera, CheckCircle2, CloudOff, DoorOpen, LogOut, Maximize2, Minimize2, Printer, QrCode, RefreshCw, RotateCcw, ScanLine, Search, ShieldCheck, Undo2, Users, Wifi } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import type { AdminEvent, Checkin, CheckinFamily, CheckinLabel, CheckinResult, DoorQr as DoorQrView, PageReason } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { QrCode as QrCodeSvg } from '@/components/qr';
import { churchUrl } from '@/lib/church';
import { Empty, ErrorState, Field, FormError, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { formatDay, formatTime } from '@/lib/format';
import { type OfflineDesk, useOfflineDesk } from '@/lib/offline-checkin';
import { printHtml } from '@/lib/print';
import { toApiError, useAction, useApi } from '@/lib/use-api';

import { PageHeader } from '../layout';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Prints name labels sized for 62 x 29 mm label rolls (Brother QL, DYMO). Kids and the parent share the code. */
export function printLabels(labels: CheckinLabel[]) {
  if (!labels.length) return;
  const body = labels
    .map((l) => `<div class="label ${l.kind}">
      <div class="top"><span class="name">${esc(l.name)}</span>${l.securityCode ? `<span class="code">${esc(l.securityCode)}</span>` : ''}</div>
      <div class="meta">${l.kind === 'child' ? esc(l.room ?? 'Kids') : l.kind === 'volunteer' ? `Serving · ${esc(l.room ?? '')}` : 'Parent / guardian pickup tag'} · ${esc(l.event)} · ${esc(l.date)}</div>
      ${l.allergies ? `<div class="alert">⚠ ${esc(l.allergies)}</div>` : ''}
    </div>`)
    .join('');
  printHtml('Check-in labels', body, `
    @page { size: 62mm 29mm; margin: 0 }
    body { margin: 0 }
    .label { width: 62mm; height: 29mm; box-sizing: border-box; padding: 2.5mm 3mm; page-break-after: always; display: flex; flex-direction: column; gap: 1mm; overflow: hidden }
    .top { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm }
    .name { font-size: 15pt; font-weight: 800; line-height: 1.05 }
    .code { font-family: ui-monospace, Menlo, monospace; font-size: 15pt; font-weight: 800; border: 1.5px solid #000; padding: 0 1.5mm; border-radius: 1.5mm }
    .meta { font-size: 7.5pt; color: #333 }
    .alert { font-size: 9pt; font-weight: 800; background: #000; color: #fff; padding: 0.5mm 1.5mm; align-self: flex-start; border-radius: 1mm }
    .guardian .name { font-size: 12pt }
  `);
}

// Camera scanning uses the browser's built-in barcode reader (Chrome on Android, Edge, recent Safari).
type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window { BarcodeDetector?: new (opts: { formats: string[] }) => Detector }
}

function CameraScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(window.BarcodeDetector ? null : 'This browser cannot read QR codes from the camera. Use a USB scanner or type the code instead.');
  useEffect(() => {
    if (!window.BarcodeDetector) return;
    let stream: MediaStream | null = null;
    let stop = false;
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (s) => {
        stream = s;
        if (!video.current) return;
        video.current.srcObject = s;
        await video.current.play();
        const tick = async () => {
          if (stop || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            if (found[0]?.rawValue) {
              onCode(found[0].rawValue);
              return;
            }
          } catch {
            /* keep scanning */
          }
          setTimeout(tick, 250);
        };
        void tick();
      })
      .catch(() => setError('Camera permission was refused.'));
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);
  return (
    <Modal title="Scan a member QR code" onClose={onClose}>
      {error ? <div className="alert warn">{error}</div> : <video ref={video} playsInline muted style={{ width: '100%', borderRadius: 12, background: '#000' }} />}
      <p className="small muted" style={{ marginTop: 10 }}>Members find their code under Me in the app. It starts with FW1.</p>
    </Modal>
  );
}

export function CheckinPage() {
  const [params, setParams] = useSearchParams();
  const events = useApi(AdminApi.checkin.events);
  // Remember this week's events so a desk that loses the internet can still switch between them.
  const cached = useMemo<AdminEvent[] | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(EVENTS_KEY) ?? 'null');
    } catch {
      return null;
    }
  }, []);
  useEffect(() => {
    try {
      if (events.data) localStorage.setItem(EVENTS_KEY, JSON.stringify(events.data));
    } catch {
      /* storage blocked */
    }
  }, [events.data]);
  const list = events.data ?? (events.error?.status === 0 ? cached : null);
  const eventId = params.get('event') ?? list?.find((e) => new Date(e.endsAt) > new Date())?.id ?? list?.[0]?.id ?? '';
  const desk = useOfflineDesk(eventId);
  const [kiosk, setKiosk] = useState(false);
  const [door, setDoor] = useState(false);

  if (events.error && !list) return <ErrorState error={events.error} onRetry={events.reload} />;
  if (!list) return <Loading />;
  const ev = list.find((e) => e.id === eventId);

  const picker = (
    <select className="select" style={{ maxWidth: 360 }} value={eventId} onChange={(e) => setParams({ event: e.target.value }, { replace: true })}>
      {list.map((e) => <option key={e.id} value={e.id}>{formatDay(e.startsAt)} {formatTime(e.startsAt)} · {e.title}</option>)}
    </select>
  );

  if (!ev)
    return (
      <>
        <PageHeader title="Check-in" />
        <div className="card"><Empty icon={<ScanLine size={32} />} title="No check-in events this week" body="Turn on Check-in for a service or event in Services & events. It appears here from the day before until it ends." /></div>
      </>
    );

  if (kiosk) return <Kiosk event={ev} desk={desk} onExit={() => setKiosk(false)} />;
  if (door) return <DoorQr event={ev} onExit={() => setDoor(false)} />;

  return (
    <>
      <PageHeader
        title="Check-in"
        subtitle="Search a family, scan a member's QR code, print labels. Children get a security code their parent must show at pickup."
        actions={<>{picker}<PhoneCheckinToggle /><button className="btn" title="Show a QR at the entrance that members scan to be marked present" onClick={() => setDoor(true)}><DoorOpen size={16} /> Door QR</button><button className="btn" onClick={() => setKiosk(true)}><Maximize2 size={16} /> Kiosk mode</button></>}
      />
      <OfflineBanner desk={desk} />
      <Desk event={ev} desk={desk} />
    </>
  );
}

const EVENTS_KEY = 'fw.checkin.events';

/** Whether parents may check their family in from the member app. */
function PhoneCheckinToggle() {
  const s = useApi(AdminApi.checkin.settings);
  const toast = useToast();
  if (!s.data) return null;
  return (
    <label className="btn ghost" title="Parents check their family in from the member app and show the pickup code here to print labels">
      <input type="checkbox" checked={s.data.phoneCheckin} onChange={async (e) => { s.setData(await AdminApi.checkin.saveSettings({ phoneCheckin: e.target.checked })); toast(e.target.checked ? 'Families can check in from their phones' : 'Phone check-in is off'); }} />
      Phone check-in
    </label>
  );
}

/** Shows whether the desk can keep going without internet, and what it still has to send. */
function OfflineBanner({ desk }: { desk: OfflineDesk }) {
  const conflicts = desk.conflicts.length > 0 && (
    <div className="alert warn stack" style={{ gap: 6 }}>
      <b>Check these at the kids' rooms</b>
      {desk.conflicts.map((c, i) => <span key={i} className="small">{c.name} {c.note}.</span>)}
      <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={desk.dismissConflicts}>Done</button>
    </div>
  );
  if (desk.online)
    return (
      <>
        {conflicts}
        {(desk.queued > 0 || desk.syncing) && <div className="alert info offline-bar"><RefreshCw size={15} className="spin" /> Sending {desk.queued} check-ins made offline…</div>}
        {desk.ready && desk.queued === 0 && !desk.syncing && <p className="small muted offline-ready"><Wifi size={13} /> Ready for offline: {desk.people} people saved on this device{desk.packAt ? ` at ${formatTime(desk.packAt)}` : ''}. If the internet drops, keep this tab open and carry on.</p>}
      </>
    );
  return (
    <>
      {conflicts}
      <div className="alert warn offline-bar" role="status">
        <CloudOff size={17} />
        <div className="grow" style={{ minWidth: 0 }}>
          <b>No internet. Checking in from this device.</b>
          <div className="small">
            {desk.ready ? `${desk.queued} check-in${desk.queued === 1 ? '' : 's'} waiting to send. Labels still print. Pickups need the internet, so check the code on the tag by eye.` : 'This desk has no offline list. Connect once before the service to download it.'}
          </div>
        </div>
        <button className="btn sm" disabled={desk.syncing} onClick={async () => { if (await desk.refresh()) void desk.syncNow(); }}><RefreshCw size={14} /> Try now</button>
      </div>
    </>
  );
}

function useSummary(eventId: string) {
  const summary = useApi(() => AdminApi.checkin.summary(eventId), [eventId]);
  // Refresh every 15 seconds so several desks stay in step.
  useEffect(() => {
    const t = setInterval(() => void summary.reload(), 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);
  return summary;
}

function Desk({ event, desk }: { event: AdminEvent; desk: OfflineDesk }) {
  const summary = useSummary(event.id);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [filter, setFilter] = useState<'all' | 'kids' | 'in'>('all');
  const [checkingOut, setCheckingOut] = useState<Checkin | null>(null);
  const [paging, setPaging] = useState<Checkin | null>(null);
  const [reprint, setReprint] = useState(false);
  const pages = useApi(() => AdminApi.checkin.pages(event.id), [event.id]);
  const toast = useToast();
  const activePages = (pages.data ?? []).filter((p) => !p.resolvedAt);

  // Check-ins made offline show first until the server has them.
  const known = new Set((summary.data?.checkins ?? []).map((c) => c.clientId).filter(Boolean));
  const rows = [...desk.local.filter((c) => !known.has(c.clientId)).reverse(), ...(summary.data?.checkins ?? [])].filter((c) => filter === 'all' || (filter === 'kids' ? c.isChild : c.isChild && !c.checkedOutAt));
  const isLocal = (c: Checkin) => desk.local.some((l) => l.id === c.id);
  // Back online, or the queue was sent: pick up what the server now has.
  useEffect(() => {
    if (desk.online) void summary.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desk.online, desk.local.length]);

  return (
    <>
      {summary.data && (
        <div className="stat-row">
          <div className="card mini-stat"><b>{summary.data.total}</b><span><Users size={13} /> Checked in</span></div>
          <div className="card mini-stat"><b>{summary.data.children}</b><span><Baby size={13} /> Children</span></div>
          <div className="card mini-stat"><b>{summary.data.stillIn}</b><span><ShieldCheck size={13} /> Kids still in rooms</span></div>
          {summary.data.rooms.map((r) => (
            <div key={r.room.id} className="card mini-stat">
              <b>{r.count}{r.room.capacity ? <span className="muted" style={{ fontSize: 15 }}> / {r.room.capacity}</span> : null}</b>
              <span>{r.room.name}{r.room.capacity && r.count >= r.room.capacity ? <span className="badge danger" style={{ marginLeft: 6 }}>Full</span> : null}</span>
            </div>
          ))}
        </div>
      )}
      {activePages.length > 0 && (
        <div className="card card-pad stack page-list">
          <h3 className="row" style={{ gap: 8 }}><BellRing size={17} /> Parents paged</h3>
          {activePages.map((p) => (
            <div key={p.id} className="row wrap" style={{ gap: 8 }}>
              <span className="kbd">{p.securityCode}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <b>{p.childName}</b>{p.roomName ? ` · ${p.roomName}` : ''}
                <div className="small muted">{formatTime(p.at)} · {p.sentTo.map((x) => `${x.name}${x.ok ? '' : ' (not sent)'}`).join(', ')}</div>
              </div>
              <button className="btn sm" onClick={async () => { await AdminApi.checkin.resolvePage(p.id); pages.reload(); }}><CheckCircle2 size={14} /> Parent came</button>
            </div>
          ))}
        </div>
      )}
      {summary.data && <CountsAndVolunteers eventId={event.id} data={summary.data} onChanged={summary.reload} />}
      <div className="split">
        <div className="card card-pad stack">
          <h3>Check someone in</h3>
          <FamilySearch eventId={event.id} desk={desk} method="staff" onDone={(r) => { setResult(r); if (desk.online) void summary.reload(); }} />
          <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} disabled={!desk.online} onClick={() => setReprint(true)}><Printer size={14} /> Reprint labels by code</button>
        </div>
        <div className="card">
          <div className="toolbar">
            <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Everyone' }, { value: 'kids', label: 'Children' }, { value: 'in', label: 'Kids still in' }]} />
            <div className="grow" />
            <span className="small muted">{rows.length} shown</span>
          </div>
          {summary.error && !summary.data && !desk.local.length ? <ErrorState error={summary.error} onRetry={summary.reload} /> : !summary.data && !desk.local.length ? <Loading /> : rows.length === 0 ? <Empty icon={<ScanLine size={28} />} title="No one checked in yet" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>Room</th><th>Code</th><th>Time</th><th /></tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} style={{ opacity: c.checkedOutAt ? 0.55 : 1 }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.personName}</div>
                        <div className="small muted">{c.householdName ?? ''}{isLocal(c) && <span className="badge warn" style={{ marginLeft: 6 }}>Not sent yet</span>}{c.allergies && <span className="badge danger" style={{ marginLeft: 6 }}>{c.allergies}</span>}{c.volunteer && <span className="badge accent" style={{ marginLeft: 6 }}>Serving: {c.volunteer.teamName}</span>}</div>
                      </td>
                      <td className="small">{c.isChild ? c.roomName ?? 'No room' : <span className="muted">Adult</span>}</td>
                      <td>{c.securityCode ? <span className="kbd">{c.securityCode}</span> : <span className="muted small">{c.method === 'app' ? 'phone' : c.method === 'phone' ? 'missed call' : c.method}</span>}{c.method === 'app' && c.isChild && <div className="small muted">from phone</div>}</td>
                      <td className="small muted">{formatTime(c.at)}{c.checkedOutAt ? ` → ${formatTime(c.checkedOutAt)}` : ''}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {c.method === 'app' && c.isChild && c.securityCode && !c.checkedOutAt && <button className="btn sm ghost" title="Print name labels" disabled={!desk.online} onClick={async () => printLabels((await AdminApi.checkin.reprint(event.id, c.securityCode!)).labels)}><Printer size={14} /></button>}
                        {c.isChild && !c.checkedOutAt && <button className="btn sm ghost" title="Page parent" disabled={!desk.online || isLocal(c)} onClick={() => setPaging(c)}><BellRing size={14} /> Page</button>}
                        {c.isChild && !c.checkedOutAt && <button className="btn sm" disabled={!desk.online || isLocal(c)} onClick={() => setCheckingOut(c)}><LogOut size={14} /> Pick up</button>}
                        <button className="btn ghost icon sm" title="Undo check-in" disabled={!desk.online || isLocal(c)} onClick={async () => {
                          if (!confirm(`Undo check-in for ${c.personName}?`)) return;
                          await AdminApi.checkin.undo(c.id);
                          summary.reload();
                        }}><Undo2 size={15} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {result && <ResultModal result={result} onClose={() => setResult(null)} />}
      {checkingOut && <CheckoutModal checkin={checkingOut} onClose={() => setCheckingOut(null)} onDone={() => { setCheckingOut(null); summary.reload(); toast('Picked up safely'); }} />}
      {reprint && <ReprintModal eventId={event.id} onClose={() => setReprint(false)} />}
      {paging && <PageModal checkin={paging} onClose={() => setPaging(null)} onDone={(sent) => { setPaging(null); pages.reload(); toast(sent ? 'Parents paged' : 'The message could not be sent. Try calling.'); }} />}
    </>
  );
}

const PAGE_REASONS: { value: PageReason; label: string }[] = [
  { value: 'come', label: 'Come to the room' },
  { value: 'pickup', label: 'Pick up now' },
  { value: 'feeding', label: 'Feed or change' },
  { value: 'custom', label: 'Other' },
];

function PageModal({ checkin, onClose, onDone }: { checkin: Checkin; onClose: () => void; onDone: (sent: boolean) => void }) {
  const parents = useApi(() => AdminApi.checkin.parents(checkin.id), [checkin.id]);
  const [reason, setReason] = useState<PageReason>('come');
  const [note, setNote] = useState('');
  const send = useAction(() => AdminApi.checkin.page(checkin.id, reason, note));
  return (
    <Modal title={`Page ${checkin.personName.split(' ')[0]}'s parents`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={send.busy || !parents.data?.length || (reason === 'custom' && !note.trim())} onClick={async () => { const p = await send.run(); if (p) onDone(p.sentTo.some((x) => x.ok)); }}><BellRing size={15} /> {send.busy ? 'Sending…' : 'Send'}</button></>}>
      <div className="stack">
        {!parents.data ? <Loading /> : parents.data.length === 0 ? <div className="alert warn">No parent with a phone number is in this child’s household. Add the family in People.</div> : (
          <div className="small">Goes to {parents.data.map((p) => `${p.name} (${p.phone})`).join(' and ')} on WhatsApp, or SMS when WhatsApp is not set up.</div>
        )}
        <Segmented value={reason} onChange={setReason} options={PAGE_REASONS} />
        <Field label={reason === 'custom' ? 'Message' : 'Add a note (optional)'}><input className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={reason === 'custom' ? 'e.g. Please bring her water bottle' : ''} /></Field>
        <p className="small muted" style={{ margin: 0 }}>The message says the child is fine, names the room and asks them to show code {checkin.securityCode} at the door.</p>
        <FormError error={send.error} />
      </div>
    </Modal>
  );
}

function FamilySearch({ eventId, desk, method, onDone, big = false }: { eventId: string; desk: OfflineDesk; method: 'staff' | 'kiosk'; onDone: (r: CheckinResult) => void; big?: boolean }) {
  const [q, setQ] = useState('');
  const [families, setFamilies] = useState<CheckinFamily[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Live while the server answers; from this device's copy when it does not.
  const checkIn = useAction(async (ids: string[]) => {
    if (!desk.online && desk.ready) return desk.checkIn(ids, method);
    try {
      return await AdminApi.checkin.checkIn(eventId, ids, method);
    } catch (e) {
      if (desk.lost(e)) return desk.checkIn(ids, method);
      throw e;
    }
  });
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setError(null);
    if (q.trim().length < 2) {
      setFamilies(null);
      return;
    }
    // A USB/Bluetooth QR scanner types FW1:CODE then Enter; that is handled on submit.
    if (/^FW1:/i.test(q.trim())) return;
    let live = true;
    const show = (f: CheckinFamily[]) => {
      setFamilies(f);
      // Pre-select everyone in a single matching family who is not yet in.
      setSelected(new Set(f.length === 1 ? f[0].people.filter((p) => !p.checkedIn).map((p) => p.id) : []));
    };
    if (!desk.online && desk.ready) {
      show(desk.search(q));
      return;
    }
    const t = setTimeout(() => {
      AdminApi.checkin.search(eventId, q).then((f) => live && show(f)).catch((e) => {
        if (!live) return;
        if (desk.lost(e)) show(desk.search(q));
        else setError(toApiError(e).message);
      });
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, eventId, desk.online]);

  async function scan(code: string) {
    setScanning(false);
    try {
      let r: CheckinResult & { alreadyCheckedIn?: boolean };
      if (!desk.online && desk.ready) r = desk.scan(code);
      else
        try {
          r = await AdminApi.checkin.scan(eventId, code);
        } catch (e) {
          if (!desk.lost(e)) throw e;
          r = desk.scan(code);
        }
      setQ('');
      if (r.alreadyCheckedIn) setError(`${r.checkins[0]?.personName} is already checked in.`);
      else onDone(r);
    } catch (e) {
      setError(toApiError(e).message);
    }
    input.current?.focus();
  }

  async function submit() {
    const r = await checkIn.run([...selected]);
    if (!r) return;
    setQ('');
    setFamilies(null);
    setSelected(new Set());
    onDone(r);
    input.current?.focus();
  }

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="stack">
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (/^FW1:/i.test(q.trim())) void scan(q.trim()); }}>
        <div className="search grow">
          <Search size={big ? 20 : 16} />
          <input ref={input} className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={big ? 'Type your name or mobile number' : 'Name, mobile, or scan a QR code'} style={big ? { height: 60, fontSize: 22, paddingLeft: 44 } : undefined} />
        </div>
        <button type="button" className={`btn ${big ? 'lg' : ''}`} onClick={() => setScanning(true)} title="Scan with camera" style={big ? { height: 60 } : undefined}><Camera size={big ? 22 : 16} /></button>
      </form>
      {error && <div className="alert warn">{error}</div>}
      {families && families.length === 0 && <p className="small muted">No one found. Try the mobile number, or add them as a visitor in People.</p>}
      {families?.map((f, i) => (
        <div key={i} className="card">
          <div className="card-head" style={{ padding: '10px 14px' }}><b>{f.householdName ?? 'No household'}</b></div>
          {f.people.map((p) => (
            <label key={p.id} className="list-row check" style={{ cursor: p.checkedIn ? 'default' : 'pointer', padding: big ? '16px 18px' : undefined, fontSize: big ? 18 : undefined }}>
              <input type="checkbox" disabled={p.checkedIn} checked={p.checkedIn || selected.has(p.id)} onChange={() => toggle(p.id)} style={big ? { width: 24, height: 24 } : undefined} />
              <span className="grow">
                <b>{p.name}</b>
                <span className="small muted" style={{ display: 'block' }}>
                  {p.isChild ? `${p.age} yrs · ${p.roomName ?? 'No room for this age'}` : p.age !== null ? 'Adult' : ''}
                  {p.allergies && <span className="badge danger" style={{ marginLeft: 6 }}>{p.allergies}</span>}
                </span>
              </span>
              {p.checkedIn && <span className="badge ok">In</span>}
            </label>
          ))}
        </div>
      ))}
      <FormError error={checkIn.error} />
      {selected.size > 0 && (
        <button className={`btn primary ${big ? 'lg' : ''} block`} style={big ? { height: 64, fontSize: 20 } : undefined} disabled={checkIn.busy} onClick={submit}>
          <CheckCircle2 size={big ? 22 : 16} /> Check in {selected.size} {selected.size === 1 ? 'person' : 'people'}
        </button>
      )}
      {scanning && <CameraScanner onCode={scan} onClose={() => setScanning(false)} />}
    </div>
  );
}

function ResultModal({ result, onClose, autoPrint = false }: { result: CheckinResult; onClose: () => void; autoPrint?: boolean }) {
  useEffect(() => {
    if (autoPrint && result.labels.length) printLabels(result.labels);
  }, [autoPrint, result]);
  const kids = result.checkins.filter((c) => c.isChild);
  return (
    <Modal title="Checked in" onClose={onClose}
      footer={<>{result.labels.length > 0 && <button className="btn" onClick={() => printLabels(result.labels)}><Printer size={15} /> Print {result.labels.length} labels</button>}<button className="btn primary" onClick={onClose}>Done</button></>}
    >
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        <CheckCircle2 size={40} color="var(--ok)" />
        <h2>{result.checkins.map((c) => c.personName.split(' ')[0]).join(', ')}</h2>
        {result.securityCode && (
          <>
            <p className="muted">Pickup code for {kids.length === 1 ? 'this child' : 'these children'}</p>
            <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 44, fontWeight: 800, letterSpacing: '0.15em' }}>{result.securityCode}</div>
            <div className="stack" style={{ gap: 4 }}>
              {kids.map((k) => <span key={k.id} className="small">{k.personName} → <b>{k.roomName ?? 'No room'}</b>{k.allergies ? <span className="badge danger" style={{ marginLeft: 6 }}>{k.allergies}</span> : null}</span>)}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function CheckoutModal({ checkin, onClose, onDone }: { checkin: Checkin; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState('');
  const out = useAction(AdminApi.checkin.checkout);
  return (
    <Modal title={`Pick up ${checkin.personName}`} onClose={onClose}
      footer={<>
        <button className="btn danger" onClick={async () => { if (!confirm('Release without the code? This is recorded in the activity log.')) return; if (await out.run(checkin.id, '', true)) onDone(); }}>Override</button>
        <button className="btn primary" disabled={out.busy || code.length < 4} onClick={async () => { if (await out.run(checkin.id, code)) onDone(); }}>Release child</button>
      </>}
    >
      <div className="stack">
        <p className="muted">Ask the parent for the code on their pickup tag. It must match before the child leaves {checkin.roomName ?? 'the room'}.</p>
        <Field label="Security code"><input className="input mono" autoFocus maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ fontSize: 26, height: 56, letterSpacing: '0.3em', textAlign: 'center' }} /></Field>
        <FormError error={out.error} />
      </div>
    </Modal>
  );
}

function ReprintModal({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const [code, setCode] = useState('');
  const run = useAction(AdminApi.checkin.reprint);
  return (
    <Modal title="Reprint labels" onClose={onClose}
      footer={<button className="btn primary" disabled={run.busy || code.length < 4} onClick={async () => { const r = await run.run(eventId, code); if (r) { printLabels(r.labels); onClose(); } }}><Printer size={15} /> Print</button>}
    >
      <div className="stack">
        <Field label="Security code"><input className="input mono" autoFocus maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></Field>
        <FormError error={run.error} />
      </div>
    </Modal>
  );
}

/** Self-service screen for a tablet at the entrance: big type, auto-resets after each family. */
function Kiosk({ event, desk, onExit }: { event: AdminEvent; desk: OfflineDesk; onExit: () => void }) {
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [key, setKey] = useState(0);
  const now = useMemo(() => new Date(), []);
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => undefined);
    return () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);
  useEffect(() => {
    if (!result) return;
    if (result.labels.length) printLabels(result.labels);
    const t = setTimeout(() => { setResult(null); setKey((k) => k + 1); }, 12000);
    return () => clearTimeout(t);
  }, [result]);

  return (
    <div className="kiosk">
      <div className="row between">
        <div>
          <h1 style={{ fontSize: 30 }}>Welcome!</h1>
          <p className="muted" style={{ fontSize: 17 }}>{event.title} · {formatDay(event.startsAt)} {formatTime(event.startsAt)}</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {!desk.online && <span className="badge warn" title={`${desk.queued} waiting to send`}><CloudOff size={13} /> Offline · {desk.queued}</span>}
          <button className="btn ghost" onClick={() => { if (confirm('Leave kiosk mode?')) onExit(); }}><Minimize2 size={16} /> Exit</button>
        </div>
      </div>
      {result ? (
        <div className="card card-pad stack" style={{ alignItems: 'center', textAlign: 'center', padding: 40 }}>
          <CheckCircle2 size={64} color="var(--ok)" />
          <h1>You're checked in{result.checkins.length > 1 ? ', all of you' : ''}!</h1>
          {result.securityCode && (
            <>
              <p style={{ fontSize: 18 }}>Collect your labels from the printer. Your pickup code is</p>
              <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 72, fontWeight: 800, letterSpacing: '0.15em' }}>{result.securityCode}</div>
              {result.checkins.filter((c) => c.isChild).map((k) => <p key={k.id} style={{ fontSize: 18 }}>{k.personName} → <b>{k.roomName}</b></p>)}
            </>
          )}
          <button className="btn primary lg" onClick={() => { setResult(null); setKey((k) => k + 1); }}><RotateCcw size={18} /> Next family</button>
        </div>
      ) : (
        <div className="card card-pad" style={{ padding: 28 }}>
          <FamilySearch key={key} eventId={event.id} desk={desk} method="kiosk" big onDone={setResult} />
          <p className="muted" style={{ marginTop: 18, fontSize: 15 }}><QrCode size={16} /> Members can scan the QR code under Me in the Flockwise app.</p>
        </div>
      )}
      <p className="small muted" style={{ textAlign: 'center' }}>Flockwise · {now.toLocaleDateString('en-IN')}</p>
    </div>
  );
}

/** The door code on the leader's phone. It changes every minute; the count updates as people scan. */
function DoorQr({ event, onExit }: { event: AdminEvent; onExit: () => void }) {
  const [data, setData] = useState<DoorQrView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let timer = 0;
    const load = async () => {
      try {
        const d = await AdminApi.checkin.door(event.id);
        if (!live) return;
        setData(d);
        setError(null);
        // Refresh a little before the code changes, and every 10 s for the count.
        timer = window.setTimeout(load, Math.max(3000, Math.min(10_000, (d.rotatesInSeconds - 1) * 1000)));
      } catch (e) {
        if (!live) return;
        setError(toApiError(e).message);
        timer = window.setTimeout(load, 5000);
      }
    };
    void load();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [event.id]);
  const url = data ? `${window.location.origin}${churchUrl(data.path)}` : '';
  return (
    <div className="kiosk door">
      <div className="row between">
        <div>
          <h1 style={{ fontSize: 26 }}>{event.title}</h1>
          <p className="muted" style={{ fontSize: 16 }}>{formatDay(event.startsAt)} {formatTime(event.startsAt)}{event.location ? ` · ${event.location}` : ''}</p>
        </div>
        <button className="btn ghost" onClick={onExit}><Minimize2 size={16} /> Exit</button>
      </div>
      <div className="card card-pad stack door-card">
        <h2 style={{ fontSize: 24, margin: 0 }}>Scan to mark yourself present</h2>
        <p className="muted" style={{ margin: 0 }}>Open your phone camera and point it at this code. It opens the Flockwise app.</p>
        {data ? <QrCodeSvg value={url} size={300} label="Door check-in code" /> : error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : <Loading />}
        {data && <p className="small muted" style={{ margin: 0 }}>Code <b className="mono">{data.token}</b> · new code in {data.rotatesInSeconds}s · a photo of it stops working after 3 minutes</p>}
      </div>
      {data && (
        <div className="card card-pad row wrap" style={{ gap: 18, alignItems: 'center' }}>
          <div><div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}>{data.present}</div><div className="small muted">present</div></div>
          <div><div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}>{data.scanned}</div><div className="small muted">scanned here</div></div>
          <div className="grow small muted">{data.recent.length ? <>Just in: {data.recent.map((r) => r.name).join(', ')}</> : 'No scans yet.'}</div>
        </div>
      )}
    </div>
  );
}

const AREAS = ['Main hall', 'Balcony', 'Overflow', 'Kids church', 'Online'];

/** Headcounts by area for services without full check-in, and which scheduled volunteers haven't arrived. */
function CountsAndVolunteers({ eventId, data, onChanged }: { eventId: string; data: import('@/api/admin-types').CheckinSummary; onChanged: () => void }) {
  const [area, setArea] = useState('Main hall');
  const [count, setCount] = useState('');
  const [showMissing, setShowMissing] = useState(false);
  const toast = useToast();
  const record = async () => {
    const n = Number(count);
    if (!area.trim() || !Number.isFinite(n) || count === '') return;
    try { await AdminApi.headcounts.record(eventId, area.trim(), n); setCount(''); toast('Headcount saved'); onChanged(); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const v = data.volunteers;
  return (
    <div className="grid cols-2">
      <div className="card card-pad stack" style={{ gap: 10 }}>
        <div className="row"><h3 className="grow">Headcount</h3><b style={{ fontSize: 22 }}>{data.headcountTotal}</b></div>
        <div className="row wrap" style={{ gap: 6 }}>
          <input className="input" list="hc-areas" style={{ flex: '1 1 140px' }} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area" />
          <datalist id="hc-areas">{AREAS.map((a) => <option key={a} value={a} />)}</datalist>
          <input className="input" type="number" min={0} inputMode="numeric" style={{ width: 100 }} value={count} onChange={(e) => setCount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && record()} placeholder="Count" />
          <button className="btn primary" onClick={record} disabled={count === ''}>Save</button>
        </div>
        {data.headcounts.length > 0 ? (
          <div className="row wrap" style={{ gap: 6 }}>
            {data.headcounts.map((h) => <span key={h.id} className="chip" title={`By ${h.recordedBy} at ${formatTime(h.at)}`}>{h.area}: {h.count}<button onClick={async () => { await AdminApi.headcounts.remove(h.id); onChanged(); }}>×</button></span>)}
          </div>
        ) : <span className="small muted">Ushers can count each area. A recount replaces the earlier number, and the total becomes the service attendance.</span>}
      </div>
      <div className="card card-pad stack" style={{ gap: 10 }}>
        <div className="row"><h3 className="grow">Volunteers</h3><b style={{ fontSize: 22 }}>{v.checkedIn}<span className="muted" style={{ fontSize: 15 }}> / {v.scheduled}</span></b></div>
        {v.scheduled === 0 ? <span className="small muted">Nobody is scheduled to serve at this service.</span> : v.missing.length === 0 ? <span className="small" style={{ color: 'var(--ok)' }}>Everyone scheduled has arrived.</span> : (
          <>
            <span className="small muted">{v.missing.length} scheduled {v.missing.length === 1 ? 'volunteer hasn’t' : 'volunteers haven’t'} checked in yet. They get a name badge with their team when they do.</span>
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowMissing(!showMissing)}>{showMissing ? 'Hide' : 'Show'} who</button>
            {showMissing && v.missing.map((m) => <div key={m.personId + m.positionName} className="small row" style={{ gap: 6 }}><b>{m.name}</b><span className="muted">{m.teamName}{m.positionName ? ` · ${m.positionName}` : ''}</span></div>)}
          </>
        )}
      </div>
    </div>
  );
}
