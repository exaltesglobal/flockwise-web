// Grief calendar. The church remembers the day someone lost a loved one. Each year, a few days
// before, the pastor is reminded to call or visit, and on the day the family gets a short message
// in their own language (sent by itself, or after the pastor reads it). Forty days after a death,
// when many Indian families hold a memorial prayer, the pastor is reminded too. A burial recorded in
// the register adds the date for the household. Only office staff with care access see this list.
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import { featureOn } from '../features.js';
import type { Channel, Collections, GriefDate, GriefDateView, GriefHub, GriefNext, GriefSettings, LanguageCode, RegisterEntry } from '../types.js';
import { find, fullName, localDate, settings } from '../util.js';
import { sendDirect } from './comms.js';
import { notify, pastorIds } from './notify.js';

const DAY = 86_400_000;
const DEFAULT: GriefSettings = { nudgeDaysBefore: 3, autoSend: false, channel: 'whatsapp', day40: true };
const CHANNELS: Channel[] = ['whatsapp', 'sms', 'email'];
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const between = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** The family message in each language. {name} is the family member, {lovedOne} the one who died. */
const MESSAGES: Partial<Record<LanguageCode, string>> & { en: string } = {
  en: 'Dear {name}, today we remember {lovedOne} with you. We know the missing does not go away, and we are praying for your family today. If you would like a visit or a call, just reply. With love, {church}',
  hi: 'प्रिय {name}, आज हम आपके साथ {lovedOne} को याद कर रहे हैं। हम जानते हैं कि उनकी कमी कभी पूरी नहीं होती। आज हम आपके परिवार के लिए प्रार्थना कर रहे हैं। अगर आप चाहें कि हम मिलने आएँ या फ़ोन करें, तो बस जवाब दें। प्रेम सहित, {church}',
  te: 'ప్రియమైన {name}, ఈ రోజు మీతో పాటు {lovedOne}ని గుర్తు చేసుకుంటున్నాం. వారి లోటు ఎప్పటికీ తీరదని మాకు తెలుసు. ఈ రోజు మీ కుటుంబం కోసం ప్రార్థిస్తున్నాం. మేము వచ్చి కలవాలన్నా, ఫోన్ చేయాలన్నా జవాబు పంపండి. ప్రేమతో, {church}',
  ta: 'அன்புள்ள {name}, இன்று உங்களுடன் சேர்ந்து {lovedOne} அவர்களை நினைவுகூருகிறோம். அவர்களின் இழப்பு எளிதில் மறையாது என்று எங்களுக்குத் தெரியும். இன்று உங்கள் குடும்பத்துக்காக ஜெபிக்கிறோம். நாங்கள் வந்து சந்திக்கவோ அழைக்கவோ விரும்பினால் பதில் அனுப்புங்கள். அன்புடன், {church}',
  ml: 'പ്രിയ {name}, ഇന്ന് നിങ്ങളോടൊപ്പം ഞങ്ങൾ {lovedOne}നെ ഓർക്കുന്നു. ആ വേർപാടിന്റെ വേദന മാറില്ലെന്ന് ഞങ്ങൾക്കറിയാം. ഇന്ന് നിങ്ങളുടെ കുടുംബത്തിനായി ഞങ്ങൾ പ്രാർത്ഥിക്കുന്നു. ഒരു സന്ദർശനമോ ഫോൺ വിളിയോ വേണമെങ്കിൽ മറുപടി അയച്ചാൽ മതി. സ്നേഹത്തോടെ, {church}',
  kn: 'ಪ್ರಿಯ {name}, ಇಂದು ನಿಮ್ಮೊಂದಿಗೆ {lovedOne} ಅವರನ್ನು ನೆನಪಿಸಿಕೊಳ್ಳುತ್ತಿದ್ದೇವೆ. ಅವರ ಅಗಲಿಕೆಯ ನೋವು ಸುಲಭವಾಗಿ ಹೋಗುವುದಿಲ್ಲ ಎಂದು ನಮಗೆ ಗೊತ್ತು. ಇಂದು ನಿಮ್ಮ ಕುಟುಂಬಕ್ಕಾಗಿ ಪ್ರಾರ್ಥಿಸುತ್ತಿದ್ದೇವೆ. ನಾವು ಭೇಟಿ ಮಾಡಬೇಕೆಂದರೆ ಅಥವಾ ಕರೆ ಮಾಡಬೇಕೆಂದರೆ ಉತ್ತರಿಸಿ. ಪ್ರೀತಿಯಿಂದ, {church}',
};

export const griefSettings = (ctx: Ctx): GriefSettings => ({ ...DEFAULT, ...(settings(ctx).griefCare ?? {}) });
const on = (ctx: Ctx) => featureOn(settings(ctx).features, 'grief-calendar');

function guard(ctx: Ctx) {
  if (!on(ctx)) throw new ApiError(404, 'not_found', 'The grief calendar is switched off for this church.');
}

/** The anniversary in a given year; 29 February falls on the 28th in other years. */
function anniversary(date: string, year: number) {
  const md = date.slice(5);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return `${year}-${md === '02-29' && !leap ? '02-28' : md}`;
}

/** The next day to remember: the 40th day while it is still ahead, then each anniversary. */
export function nextDay(ctx: Ctx, g: GriefDate): GriefNext {
  const today = localDate(ctx, ctx.now);
  const day40 = addDays(g.date, 40);
  if (griefSettings(ctx).day40 && day40 >= today) return { on: day40, kind: 'day40', years: 0, daysAway: between(today, day40), key: 'day40' };
  const died = Number(g.date.slice(0, 4));
  let year = Number(today.slice(0, 4));
  if (anniversary(g.date, year) < today) year++;
  if (year - died < 1) year = died + 1;
  const date = anniversary(g.date, year);
  return { on: date, kind: 'year', years: year - died, daysAway: between(today, date), key: String(year) };
}

function family(ctx: Ctx, g: GriefDate) {
  return g.familyIds.map((id) => ctx.db.get('people', id)).filter((p): p is Collections['people'] => !!p && p.status !== 'inactive');
}

function fill(ctx: Ctx, template: string, g: GriefDate, name: string) {
  return template.replace(/\{name\}/g, name).replace(/\{lovedOne\}/g, g.lovedOne).replace(/\{church\}/g, settings(ctx).name);
}

const templateFor = (g: GriefDate, lang: LanguageCode) => g.message ?? MESSAGES[lang] ?? MESSAGES.en;

function view(ctx: Ctx, g: GriefDate): GriefDateView {
  const fam = family(ctx, g);
  const next = nextDay(ctx, g);
  const first = fam[0];
  return {
    ...g,
    family: fam.map((p) => ({ id: p.id, name: fullName(p), phone: p.phone, language: p.language })),
    next,
    // Shown to the office in English (or the pastor's own words); each person still gets their own language.
    draft: fill(ctx, templateFor(g, 'en'), g, first?.firstName ?? '{name}'),
    sentThisTime: g.sent[next.key] ?? null,
  };
}

export function griefHub(ctx: Ctx): GriefHub {
  const dates = ctx.db.all('griefDates').map((g) => view(ctx, g)).sort((a, b) => a.next.on.localeCompare(b.next.on) || a.lovedOne.localeCompare(b.lovedOne));
  return { dates, settings: griefSettings(ctx) };
}

/** Sends the family message, one message per language so each person reads it in their own. */
async function sendToFamily(ctx: Ctx, g: GriefDate, key: string, custom?: string) {
  const fam = family(ctx, g);
  if (!fam.length) throw new ApiError(422, 'invalid', 'Add someone from the family first.');
  const s = griefSettings(ctx);
  const byLang = new Map<string, string[]>();
  for (const p of fam) {
    const t = custom || templateFor(g, p.language);
    byLang.set(t, [...(byLang.get(t) ?? []), p.id]);
  }
  for (const [t, ids] of byLang) {
    // {{firstName}} is filled per person when the message goes out.
    await sendDirect(ctx, s.channel, ids, `Remembering ${g.lovedOne}`, fill(ctx, t, g, '{{firstName}}'), 'automation');
  }
  return ctx.db.put('griefDates', { ...g, sent: { ...g.sent, [key]: ctx.now.toISOString() }, updatedAt: ctx.now.toISOString() });
}

/** Daily: remind the pastor a few days before, and send the family message on the day if the church chose that. */
export async function griefDue(ctx: Ctx) {
  if (!on(ctx)) return;
  const s = griefSettings(ctx);
  const pastors = pastorIds(ctx);
  for (let g of ctx.db.all('griefDates')) {
    const n = nextDay(ctx, g);
    if (n.daysAway <= s.nudgeDaysBefore && !g.nudged[n.key]) {
      const names = family(ctx, g).map((p) => p.firstName);
      const when = n.daysAway === 0 ? 'today' : n.daysAway === 1 ? 'tomorrow' : `in ${n.daysAway} days`;
      const what = n.kind === 'day40' ? `40 days since ${g.lovedOne} died` : `${n.years === 1 ? 'one year' : `${n.years} years`} since ${g.lovedOne} died`;
      const tail = !g.sendMessage || !names.length ? 'A call or a visit would mean a lot.' : n.kind === 'year' && s.autoSend ? 'A short message goes to the family on the day; a call means even more.' : 'A message is ready for you to read and send.';
      if (pastors.length) await notify(ctx, 'grief.nudge', { personIds: pastors, title: `${what[0].toUpperCase()}${what.slice(1)}, ${when}`, body: `${names.length ? `Remember ${names.join(', ')}. ` : ''}${tail}`, link: '/admin/grief' });
      g = ctx.db.put('griefDates', { ...g, nudged: { ...g.nudged, [n.key]: ctx.now.toISOString() } });
    }
    if (n.kind === 'year' && n.daysAway === 0 && s.autoSend && g.sendMessage && !g.sent[n.key] && family(ctx, g).length) await sendToFamily(ctx, g, n.key);
  }
}

/** A burial in the register adds the date for the rest of the household. */
export function griefFromBurial(ctx: Ctx, e: RegisterEntry) {
  if (!on(ctx) || e.kind !== 'burial' || ctx.db.all('griefDates').some((g) => g.registerId === e.id)) return;
  const person = e.personId ? ctx.db.get('people', e.personId) : undefined;
  const date = isDate(e.details.deathDate) ? e.details.deathDate : e.date;
  const familyIds = person?.householdName ? ctx.db.all('people').filter((p) => p.id !== person.id && p.householdName === person.householdName && p.status !== 'inactive').map((p) => p.id) : [];
  const now = ctx.now.toISOString();
  ctx.db.put('griefDates', { id: ctx.id('gr'), lovedOne: person ? fullName(person) : e.name, relation: null, date, personId: person?.id ?? null, familyIds, note: null, sendMessage: true, message: null, registerId: e.id, nudged: {}, sent: {}, createdAt: now, updatedAt: now });
}

function input(ctx: Ctx, b: Record<string, unknown>, cur?: GriefDate): Partial<GriefDate> {
  const out: Partial<GriefDate> = {};
  if (b.lovedOne !== undefined || !cur) {
    const v = clean(b.lovedOne, 80);
    if (!v) throw new ApiError(422, 'invalid', 'Write the name of the one who died.', { lovedOne: 'Required' });
    out.lovedOne = v;
  }
  if (b.date !== undefined || !cur) {
    if (!isDate(b.date)) throw new ApiError(422, 'invalid', 'Choose the date they died.', { date: 'Required' });
    if (b.date > localDate(ctx, ctx.now)) throw new ApiError(422, 'invalid', 'That date is in the future.', { date: 'In the future' });
    out.date = b.date;
  }
  if (b.relation !== undefined) out.relation = clean(b.relation, 40) || null;
  if (b.note !== undefined) out.note = clean(b.note, 500) || null;
  if (b.message !== undefined) out.message = clean(b.message, 700) || null;
  if (b.sendMessage !== undefined) out.sendMessage = b.sendMessage === true;
  if (b.personId !== undefined) out.personId = b.personId ? find(ctx, 'people', String(b.personId), 'Person').id : null;
  if (b.familyIds !== undefined) {
    if (!Array.isArray(b.familyIds)) throw new ApiError(422, 'invalid', 'Choose the family.');
    out.familyIds = [...new Set(b.familyIds.map(String))].slice(0, 20).map((id) => find(ctx, 'people', id, 'Person').id);
  }
  return out;
}

export function registerGrief(r: Router) {
  r.get('/admin/grief', { perm: 'care' }, (ctx): GriefHub => {
    guard(ctx);
    return griefHub(ctx);
  });

  r.post('/admin/grief', { perm: 'care' }, (ctx): GriefHub => {
    guard(ctx);
    const now = ctx.now.toISOString();
    const v = input(ctx, ctx.body);
    const g = ctx.db.put('griefDates', { id: ctx.id('gr'), lovedOne: v.lovedOne!, date: v.date!, relation: v.relation ?? null, personId: v.personId ?? null, familyIds: v.familyIds ?? [], note: v.note ?? null, sendMessage: v.sendMessage ?? true, message: v.message ?? null, registerId: null, nudged: {}, sent: {}, createdAt: now, updatedAt: now });
    // Names stay out of the audit log: grief is private to the family and the care team.
    ctx.audit('created', 'griefDates', g.id, 'Added a date to the grief calendar');
    return griefHub(ctx);
  });

  r.patch('/admin/grief/:id', { perm: 'care' }, (ctx): GriefHub => {
    guard(ctx);
    const g = find(ctx, 'griefDates', ctx.params[0], 'Date');
    ctx.db.put('griefDates', { ...g, ...input(ctx, ctx.body, g), updatedAt: ctx.now.toISOString() });
    ctx.audit('updated', 'griefDates', g.id, 'Updated a date on the grief calendar');
    return griefHub(ctx);
  });

  r.del('/admin/grief/:id', { perm: 'care' }, (ctx): GriefHub => {
    guard(ctx);
    const g = find(ctx, 'griefDates', ctx.params[0], 'Date');
    ctx.db.del('griefDates', g.id);
    ctx.audit('deleted', 'griefDates', g.id, 'Removed a date from the grief calendar');
    return griefHub(ctx);
  });

  /** Sends the message for the coming day now, in the pastor's words if they changed it. */
  r.post('/admin/grief/:id/send', { perm: 'care' }, async (ctx): Promise<GriefHub> => {
    guard(ctx);
    const g = find(ctx, 'griefDates', ctx.params[0], 'Date');
    const n = nextDay(ctx, g);
    if (g.sent[n.key]) throw new ApiError(409, 'conflict', 'The message for this day has already gone.');
    await sendToFamily(ctx, g, n.key, clean(ctx.body.text, 700) || undefined);
    ctx.audit('updated', 'griefDates', g.id, 'Sent a remembrance message');
    return griefHub(ctx);
  });

  r.put('/admin/grief/settings', { perm: 'care' }, (ctx): GriefHub => {
    guard(ctx);
    const b = ctx.body;
    const cur = griefSettings(ctx);
    const days = b.nudgeDaysBefore === undefined ? cur.nudgeDaysBefore : Math.round(Number(b.nudgeDaysBefore));
    if (!Number.isFinite(days) || days < 0 || days > 14) throw new ApiError(422, 'invalid', 'Choose 0 to 14 days.', { nudgeDaysBefore: '0 to 14' });
    const channel = (b.channel ?? cur.channel) as Channel;
    if (!CHANNELS.includes(channel)) throw new ApiError(422, 'invalid', 'Choose WhatsApp, SMS or email.');
    const next: GriefSettings = { nudgeDaysBefore: days, autoSend: b.autoSend === undefined ? cur.autoSend : b.autoSend === true, channel, day40: b.day40 === undefined ? cur.day40 : b.day40 === true };
    ctx.db.put('settings', { ...settings(ctx), griefCare: next });
    ctx.audit('updated', 'settings', 'church', 'Updated grief calendar settings');
    return griefHub(ctx);
  });
}
