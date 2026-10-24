// Silent worship-team cues. The worship leader taps "Repeat chorus", "Key up" or "Ending" on a phone
// and the band view, the stage display and the presenter flash it, so nobody has to shout or wave
// across the stage. Anyone on the service's team (and office staff) can send a cue.
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import { featureOn } from '../features.js';
import type { CuePad, WorshipCue, WorshipCueKind } from '../types.js';
import { find, fullName, settings } from '../util.js';
import { deckNow, liveCue, stateFor } from './present.js';

/** The cue buttons, in the order the pad shows them. */
export const CUES: { kind: Exclude<WorshipCueKind, 'custom'>; text: string }[] = [
  { kind: 'chorus', text: 'Repeat chorus' },
  { kind: 'again', text: 'One more time' },
  { kind: 'bridge', text: 'Go to bridge' },
  { kind: 'verse', text: 'Back to verse' },
  { kind: 'keyup', text: 'Key up' },
  { kind: 'softer', text: 'Softer' },
  { kind: 'build', text: 'Build up' },
  { kind: 'instrumental', text: 'Instrumental' },
  { kind: 'end', text: 'Ending' },
  { kind: 'stop', text: 'Stop' },
  { kind: 'next', text: 'Next song' },
];

const baseLabel = (label: string) => label.replace(/\s*\(\d+\/\d+\)$/, '');

function guard(ctx: Ctx) {
  if (!featureOn(settings(ctx).features, 'worship-cues')) throw new ApiError(404, 'not_found', 'Worship cues are switched off for this church.');
}

/** Office staff who run services, or a person serving at this event (not one who said no). */
function mayCue(ctx: Ctx, eventId: string) {
  if (ctx.staff && (ctx.can('services') || ctx.can('checkin'))) return true;
  const me = ctx.me();
  return ctx.db.all('assignments').some((a) => a.eventId === eventId && a.personId === me && a.status !== 'declined');
}

function pad(ctx: Ctx, eventId: string): CuePad {
  const ev = find(ctx, 'events', eventId, 'Service');
  const { items, slides, state, index } = deckNow(ctx, ev);
  const sl = slides[index];
  const item = sl ? items[sl.itemIndex] : undefined;
  const sections = sl ? [...new Set(slides.filter((x) => x.itemIndex === sl.itemIndex && x.kind === 'lyrics').map((x) => baseLabel(x.label)).filter(Boolean))] : [];
  return {
    event: { id: ev.id, title: ev.title, startsAt: ev.startsAt },
    item: item ? { title: item.title, key: item.key ?? null, sections } : null,
    cue: liveCue(ctx, state.cue),
  };
}

function send(ctx: Ctx, eventId: string): CuePad {
  guard(ctx);
  find(ctx, 'events', eventId, 'Service');
  if (!mayCue(ctx, eventId)) throw new ApiError(403, 'forbidden', 'Only people serving at this service can send cues.');
  const state = stateFor(ctx, eventId);
  if (ctx.body.clear) {
    ctx.db.put('presentations', { ...state, cue: null, updatedAt: ctx.now.toISOString() });
    return pad(ctx, eventId);
  }
  const kind = String(ctx.body.kind ?? '') as WorshipCueKind;
  const preset = CUES.find((c) => c.kind === kind);
  const typed = String(ctx.body.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!preset && kind !== 'custom') throw new ApiError(422, 'invalid', 'Pick a cue.');
  if (kind === 'custom' && !typed) throw new ApiError(422, 'invalid', 'Type a few words to show the team.', { text: 'Required' });
  const me = ctx.staff ? null : ctx.db.get('people', ctx.me());
  const cue: WorshipCue = {
    id: ctx.id('cue'), kind,
    // "Go to bridge" may name the section: "Go to Bridge 2".
    text: typed || preset!.text,
    by: ctx.staff?.name ?? (me ? fullName(me) : null),
    at: ctx.now.toISOString(),
  };
  ctx.db.put('presentations', { ...state, cue, updatedAt: ctx.now.toISOString() });
  return pad(ctx, eventId);
}

export function registerWorshipCues(r: Router) {
  r.get('/me/services/:eventId/cues', {}, (ctx) => {
    guard(ctx);
    if (!mayCue(ctx, ctx.params[0])) throw new ApiError(403, 'forbidden', 'Only people serving at this service can send cues.');
    return pad(ctx, ctx.params[0]);
  });
  r.post('/me/services/:eventId/cues', {}, (ctx) => send(ctx, ctx.params[0]));
  r.post('/admin/services/:eventId/cues', { perm: ['services', 'checkin'] }, (ctx) => send(ctx, ctx.params[0]));
}
