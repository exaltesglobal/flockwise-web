// Voice office assistant. The secretary speaks in Telugu, Hindi, Tamil or any language the browser
// can hear ("Add Ravi's family, his wife Sunita, two children", "How much came for the building
// fund this month?"). The browser turns speech into text; nothing is recorded or uploaded. The
// assistant answers from church data in the same language, and for changes it prepares a card
// (a family, a gift, a care follow-up) that the secretary checks and confirms. Nothing changes
// until they tap Confirm, and then it goes through the normal office endpoints with their own
// permissions.
import type { AiBlock, AiMessage, Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import { TOOLS, trim } from '../mcp.js';
import type { AiVoiceReply, GivingTotals, PaymentMethod, VoiceAction, VoiceDone, VoiceMember } from '../types.js';
import { giftDate, localDate, settings } from '../util.js';
import { aiHandle, churchContext, LANGS, run, textOf } from './ai.js';

const READ_TOOLS = TOOLS.filter((t) => !t.write);
const METHODS: PaymentMethod[] = ['cash', 'cheque', 'bank_transfer', 'upi', 'card', 'netbanking'];
const RELATIONS: VoiceMember['relation'][] = ['head', 'spouse', 'child', 'parent', 'other'];
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
type Json = Record<string, unknown>;

const PROPOSE = [
  {
    name: 'propose_add_family',
    description: 'Prepare a new family (or one person) to add to People. Every member needs a first name; ask for any name that was not said. Nothing is saved until the user confirms.',
    input_schema: {
      type: 'object',
      properties: {
        householdName: { type: 'string', description: 'e.g. "Kumar family"; the surname plus "family"' },
        area: { type: 'string', description: 'Area or address, if said' },
        status: { type: 'string', enum: ['visitor', 'regular', 'member'], description: 'visitor unless they said member or regular' },
        members: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              firstName: { type: 'string' }, lastName: { type: 'string' },
              relation: { type: 'string', enum: RELATIONS },
              gender: { type: 'string', enum: ['male', 'female'] },
              birthDate: { type: 'string', description: 'YYYY-MM-DD, only if said' },
              phone: { type: 'string', description: 'Mobile number, only if said' },
            },
            required: ['firstName', 'relation'],
          },
        },
      },
      required: ['members'],
    },
  },
  {
    name: 'propose_gift',
    description: 'Prepare a gift to record (cash or cheque handed in, a bank transfer). Look up the fund id with list_funds and the donor with search_people. Nothing is saved until the user confirms.',
    input_schema: {
      type: 'object',
      properties: {
        donorName: { type: 'string' }, donorId: { type: 'string', description: 'Person id from search_people, if found' },
        fundId: { type: 'string' }, amount: { type: 'number', description: 'In rupees' },
        method: { type: 'string', enum: METHODS }, date: { type: 'string', description: 'YYYY-MM-DD; today if not said' },
      },
      required: ['donorName', 'fundId', 'amount', 'method'],
    },
  },
  {
    name: 'propose_care',
    description: 'Prepare a pastoral care follow-up (a visit, a call, someone in hospital). Find the person with search_people. Nothing is saved until the user confirms.',
    input_schema: {
      type: 'object',
      properties: { title: { type: 'string', description: 'What needs follow-up, in English' }, personId: { type: 'string' }, personName: { type: 'string' }, note: { type: 'string' } },
      required: ['title'],
    },
  },
];

/** Turns a proposal from the model into a checked action, or a reason it cannot be one. */
function toAction(ctx: Ctx, name: string, a: Json): VoiceAction | string {
  if (name === 'propose_add_family') {
    const raw = Array.isArray(a.members) ? (a.members as Json[]) : [];
    const members: VoiceMember[] = raw.slice(0, 12).map((m) => ({
      firstName: clean(m.firstName, 60), lastName: clean(m.lastName, 60),
      relation: RELATIONS.includes(m.relation as VoiceMember['relation']) ? (m.relation as VoiceMember['relation']) : 'other',
      gender: m.gender === 'male' || m.gender === 'female' ? m.gender : null,
      birthDate: isDate(m.birthDate) ? m.birthDate : null,
      phone: clean(m.phone, 20) || null,
    }));
    if (!members.length) return 'Add at least one person.';
    const missing = members.filter((m) => !m.firstName).length;
    if (missing) return `${missing} ${missing === 1 ? 'person has' : 'people have'} no first name. Ask the user for the names.`;
    const surname = members.find((m) => m.lastName)?.lastName ?? '';
    for (const m of members) if (!m.lastName) m.lastName = surname;
    const status = a.status === 'member' || a.status === 'regular' ? a.status : 'visitor';
    return { kind: 'add_family', householdName: clean(a.householdName, 80) || (surname ? `${surname} family` : `${members[0].firstName}'s family`), area: clean(a.area, 120), status, members };
  }
  if (name === 'propose_gift') {
    const fund = ctx.db.get('funds', clean(a.fundId, 40));
    if (!fund) return 'Unknown fund. Look up the fund id with list_funds.';
    const amount = Math.round(Number(a.amount));
    if (!(amount > 0)) return 'The amount is missing.';
    const method = METHODS.includes(a.method as PaymentMethod) ? (a.method as PaymentMethod) : 'cash';
    const donor = a.donorId ? ctx.db.get('people', clean(a.donorId, 40)) : undefined;
    const donorName = clean(a.donorName, 80) || (donor ? `${donor.firstName} ${donor.lastName}`.trim() : '');
    if (!donorName) return 'Who gave it? Ask the user.';
    return { kind: 'record_gift', donorName, donorId: donor?.id ?? null, fundId: fund.id, fundName: fund.name, amount, method, date: isDate(a.date) ? a.date : localDate(ctx, ctx.now) };
  }
  if (name === 'propose_care') {
    const title = clean(a.title, 120);
    if (!title) return 'Say what needs follow-up.';
    const p = a.personId ? ctx.db.get('people', clean(a.personId, 40)) : undefined;
    return { kind: 'care', title, personId: p?.id ?? null, personName: p ? `${p.firstName} ${p.lastName}`.trim() : clean(a.personName, 80), note: clean(a.note, 1000) };
  }
  return 'Unknown tool.';
}

export async function voiceAssistant(ctx: Ctx, text: string, language: string, history: AiMessage[], spoken = true): Promise<AiVoiceReply> {
  const handle = aiHandle(ctx.db);
  if (!handle) throw new ApiError(503, 'ai_off', 'The assistant is not ready.');
  const lang = LANGS[language] ?? 'English';
  const tools = [...READ_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: { type: 'object', properties: t.props ?? {}, ...(t.required ? { required: t.required } : {}) } })), ...PROPOSE];
  const system = `${churchContext(ctx)}\n\nYou are the voice assistant in the church office. ${ctx.staff?.name ?? 'The secretary'} ${spoken ? `speaks to you in ${lang}; the words come from speech recognition, so expect slips, numbers as words and English words mixed in.` : 'types to you.'} Answer questions using the read tools, which see the church's live data with this person's permissions; look things up rather than guessing, and add up amounts yourself only from what the tools return. Money from the tools is in paise: divide by 100 for rupees. To change anything, call a propose_ tool: it prepares a card the user checks and confirms, and nothing is saved until they do. Never claim something is saved. If a needed detail is missing (a name, an amount, which fund), ask one short question instead. Write people's names in English letters, as they are usually spelled in India. ${spoken ? `Reply in ${lang}${lang !== 'English' ? ' in its own script' : ''}, ` : 'Reply in the language the user wrote in, '}${spoken ? 'in one to three short sentences that sound natural read aloud: no lists, no markdown' : 'briefly: lead with the answer, then at most a few short bullet points'}, amounts like ₹45,000.`;
  const messages: AiMessage[] = [...history.slice(-8), { role: 'user', content: text }];
  const used: string[] = [];
  const actions: VoiceAction[] = [];
  for (let turn = 0; turn < 8; turn++) {
    const res = await run(ctx, { system, messages, tools, maxTokens: 3000, effort: 'medium' });
    messages.push({ role: 'assistant', content: res.content });
    if (res.stopReason === 'pause_turn') continue;
    const calls = res.content.filter((b): b is Extract<AiBlock, { type: 'tool_use' }> => b.type === 'tool_use');
    if (res.stopReason !== 'tool_use' || !calls.length) return { answer: textOf(res.content) || '…', actions, toolsUsed: used };
    const results: AiBlock[] = [];
    for (const c of calls) {
      used.push(c.name);
      if (c.name.startsWith('propose_')) {
        const a = toAction(ctx, c.name, (c.input ?? {}) as Json);
        if (typeof a === 'string') results.push({ type: 'tool_result', tool_use_id: c.id, content: a, is_error: true });
        else { actions.push(a); results.push({ type: 'tool_result', tool_use_id: c.id, content: 'Prepared. The user will see it as a card and confirm it. Tell them briefly what you prepared.' }); }
        continue;
      }
      const tool = READ_TOOLS.find((t) => t.name === c.name);
      if (!tool) { results.push({ type: 'tool_result', tool_use_id: c.id, content: 'Unknown tool.', is_error: true }); continue; }
      try {
        const r = tool.call((c.input ?? {}) as Json);
        const out = await handle({ method: r.method, path: r.path, query: r.query, body: r.body, auth: ctx.auth });
        results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(trim(out)).slice(0, 60_000) });
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: c.id, content: e instanceof ApiError ? e.message : 'That lookup failed.', is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  return { answer: 'That needed too many steps. Try a shorter request.', actions, toolsUsed: used };
}

/** Does a confirmed action through the normal office endpoints, so the user's own permissions apply. */
async function perform(ctx: Ctx, raw: Json): Promise<VoiceDone> {
  const handle = aiHandle(ctx.db);
  if (!handle) throw new ApiError(503, 'ai_off', 'The assistant is not ready.');
  const kind = String(raw.kind ?? '');
  const a = toAction(ctx, kind === 'add_family' ? 'propose_add_family' : kind === 'record_gift' ? 'propose_gift' : kind === 'care' ? 'propose_care' : '', raw);
  if (typeof a === 'string') throw new ApiError(422, 'invalid', a);
  const call = (method: string, path: string, body: unknown) => handle({ method, path, body, auth: ctx.auth }) as Promise<{ id: string }>;
  if (a.kind === 'add_family') {
    let first: string | null = null;
    for (const m of a.members) {
      const p = await call('POST', '/admin/people', { firstName: m.firstName, lastName: m.lastName, gender: m.gender, birthDate: m.birthDate, phone: m.phone, status: a.status, householdName: a.householdName, address: a.area || undefined });
      first ??= p.id;
    }
    return { text: `Added ${a.householdName}: ${a.members.map((m) => m.firstName).join(', ')}.`, link: first ? `/admin/people?open=${first}` : null };
  }
  if (a.kind === 'record_gift') {
    await call('POST', '/admin/giving/donations', { donorName: a.donorName, donorId: a.donorId, fundId: a.fundId, amount: a.amount * 100, method: a.method, receivedAt: `${a.date}T12:00:00` });
    return { text: `Recorded ₹${a.amount.toLocaleString('en-IN')} from ${a.donorName} to ${a.fundName}.`, link: '/admin/giving' };
  }
  await call('POST', '/admin/care', { title: a.title, personId: a.personId, note: a.note });
  return { text: `Care follow-up added: ${a.title}${a.personName ? ` (${a.personName})` : ''}.`, link: '/admin/care' };
}

function totals(ctx: Ctx): GivingTotals {
  const today = localDate(ctx, ctx.now);
  const from = isDate(ctx.query.from) ? ctx.query.from : `${today.slice(0, 7)}-01`;
  const to = isDate(ctx.query.to) ? ctx.query.to : today;
  const fundId = typeof ctx.query.fundId === 'string' ? ctx.query.fundId : '';
  const byFund = new Map<string, { fundId: string; fundName: string; amount: number; count: number }>();
  const byMethod = new Map<string, number>();
  let total = 0;
  let count = 0;
  for (const d of ctx.db.all('donations')) {
    if (d.status !== 'succeeded' || (fundId && d.fundId !== fundId)) continue;
    const day = localDate(ctx, new Date(giftDate(d)));
    if (day < from || day > to) continue;
    total += d.amount;
    count++;
    const f = byFund.get(d.fundId) ?? { fundId: d.fundId, fundName: d.fundName, amount: 0, count: 0 };
    f.amount += d.amount;
    f.count++;
    byFund.set(d.fundId, f);
    const m = d.method ?? 'other';
    byMethod.set(m, (byMethod.get(m) ?? 0) + d.amount);
  }
  return { from, to, total, count, currency: settings(ctx).currency, byFund: [...byFund.values()].sort((a, b) => b.amount - a.amount), byMethod: [...byMethod].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount) };
}

export function registerVoice(r: Router) {
  r.get('/admin/giving/totals', { perm: 'giving.view' }, (ctx): GivingTotals => totals(ctx));

  r.post('/admin/ai/voice', { staff: true }, async (ctx): Promise<AiVoiceReply> => {
    const text = clean(ctx.body.text, 2000);
    if (!text) throw new ApiError(400, 'text_required', 'Say or type something.');
    const history: AiMessage[] = (Array.isArray(ctx.body.history) ? ctx.body.history : [])
      .filter((m: { role?: string; text?: string }) => (m.role === 'user' || m.role === 'assistant') && m.text)
      .map((m: { role: 'user' | 'assistant'; text: string }) => ({ role: m.role, content: clean(m.text, 4000) }));
    return voiceAssistant(ctx, text, clean(ctx.body.language, 5) || 'en', history, ctx.body.spoken !== false);
  });

  r.post('/admin/ai/voice/do', { staff: true }, async (ctx): Promise<VoiceDone> => perform(ctx, (ctx.body.action ?? {}) as Json));
}
