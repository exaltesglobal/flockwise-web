// The offering moment on the big screen: the church's UPI QR code with a live progress bar toward a
// goal ("Roof fund: ₹3.2L of ₹5L") and what has come in today. Totals and counts only, never names.
import type { Ctx } from '../engine.js';
import { ApiError } from '../errors.js';
import { featureOn } from '../features.js';
import type { OfferingChoices, OfferingOnScreen, OfferingScreen } from '../types.js';
import { church, giftDate, localDate, settings } from '../util.js';
import { publicCampaign } from './offerings.js';

const activeCodes = (ctx: Ctx) => ctx.db.all('qrCodes').filter((q) => q.status === 'active');

export function offeringChoices(ctx: Ctx): OfferingChoices {
  const funds = ctx.db.all('funds').filter((f) => f.active && !f.system);
  return {
    codes: activeCodes(ctx).map((q) => ({ id: q.id, name: q.name, fundId: q.fundId, fundName: q.fundName })),
    campaigns: ctx.db.all('campaigns').filter((c) => c.status === 'active').map((c) => ({ id: c.id, name: c.name, fundId: c.fundId, goal: c.goal })),
    funds: funds.map((f) => ({ id: f.id, name: f.name, goal: f.goal ?? null })),
  };
}

/** Checks what the operator picked and fills in the rest: a campaign brings its fund, a fund its QR code. */
export function pickOffering(ctx: Ctx, body: Record<string, unknown>): OfferingOnScreen {
  if (!featureOn(settings(ctx).features, 'offering-screen')) throw new ApiError(404, 'not_found', 'The offering screen is switched off for this church.');
  const campaign = body.campaignId ? ctx.db.get('campaigns', String(body.campaignId)) : undefined;
  if (body.campaignId && !campaign) throw new ApiError(404, 'not_found', 'Campaign not found.');
  let fundId = campaign?.fundId ?? (body.fundId ? String(body.fundId) : null);
  if (fundId && !ctx.db.get('funds', fundId)) throw new ApiError(404, 'not_found', 'Fund not found.');
  let qr = body.qrId ? ctx.db.get('qrCodes', String(body.qrId)) : undefined;
  if (body.qrId && (!qr || qr.status !== 'active')) throw new ApiError(404, 'not_found', 'That QR code is not active.');
  if (!qr && fundId) qr = activeCodes(ctx).find((q) => q.fundId === fundId);
  fundId ??= qr?.fundId ?? null;
  if (!qr && !fundId) throw new ApiError(422, 'invalid', 'Pick a QR code, a fund or a campaign to show.');
  const fund = fundId ? ctx.db.get('funds', fundId) : undefined;
  const title = String(body.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || campaign?.name || fund?.name || qr?.name || 'Offering';
  return { qrId: qr?.id ?? null, campaignId: campaign?.id ?? null, fundId, title };
}

export function offeringScreen(ctx: Ctx, pick: OfferingOnScreen | null | undefined): OfferingScreen | null {
  if (!pick) return null;
  const qr = pick.qrId ? ctx.db.get('qrCodes', pick.qrId) : undefined;
  const campaign = pick.campaignId ? ctx.db.get('campaigns', pick.campaignId) : undefined;
  const fund = pick.fundId ? ctx.db.get('funds', pick.fundId) : undefined;
  const gifts = fund ? ctx.db.all('donations').filter((d) => d.fundId === fund.id && d.status === 'succeeded') : [];
  const today = localDate(ctx, ctx.now);
  const todays = gifts.filter((d) => localDate(ctx, new Date(giftDate(d))) === today);
  const sum = (xs: { amount: number }[]) => xs.reduce((a, d) => a + d.amount, 0);
  let goal: number | null = null;
  let raised = 0;
  let givers = 0;
  if (campaign) {
    const p = publicCampaign(ctx, campaign);
    goal = p.goal; raised = p.raised; givers = p.givers;
  } else if (fund) {
    // A fund with a goal counts every gift it has had; without one, the bar shows today only.
    goal = fund.goal ?? null;
    const counted = goal ? gifts : todays;
    raised = sum(counted);
    givers = new Set(counted.map((d) => d.donorId ?? `n:${d.donorName.toLowerCase()}`)).size;
  }
  const name = campaign?.name ?? fund?.name ?? null;
  return {
    title: pick.title,
    subtitle: name && name !== pick.title ? name : null,
    currency: church(ctx).currency,
    goal, raised,
    percent: goal ? Math.min(999, Math.round((raised * 100) / goal)) : null,
    givers,
    today: sum(todays), todayGifts: todays.length,
    qr: qr && qr.status === 'active' ? { imageUrl: qr.imageUrl, payload: qr.payload, url: `${ctx.env.webUrl}/qr/${qr.id}` } : null,
  };
}
