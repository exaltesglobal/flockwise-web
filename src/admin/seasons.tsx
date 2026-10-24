// A gentle nudge when a season is near: "Christmas is 6 weeks away: turn on Carol rounds?".
// Shown only to people who can change settings, only for features that are off, one at a time,
// and each one can be dismissed for the year.
import { CalendarHeart, X } from 'lucide-react';
import { useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import { FEATURES } from '@/core/features';
import { useToast } from '@/components/ui';
import { useCan } from '@/lib/perms';

import { setFeatures, useFeatures } from './features';
import { useOfficeT } from './i18n';

const DAY = 86_400_000;

/** Easter Sunday (Gregorian), by the anonymous computus. */
function easter(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

type Season = { feature: string; text: string; from: Date; to: Date; until: Date };

function seasons(now: Date): Season[] {
  const y = now.getFullYear();
  const d = (m: number, day: number, year = y) => new Date(year, m - 1, day);
  const christmas = d(12, 25);
  const ea = easter(y);
  return [
    { feature: 'carols', text: 'Christmas is {weeks} weeks away: turn on Carol rounds to plan house visits?', from: d(10, 15), to: d(12, 20), until: christmas },
    { feature: 'feasts', text: 'Planning a Christmas love feast? Turn on Love feasts & kitchen for menus and the kitchen team.', from: d(11, 15), to: d(12, 26), until: christmas },
    { feature: 'video-greetings', text: 'Send members a Christmas video greeting from the pastor? Turn on Video greetings.', from: d(12, 1), to: d(12, 24), until: christmas },
    { feature: 'vigils', text: 'Lent has begun. Turn on Prayer vigils to fill a Good Friday prayer chain?', from: new Date(ea.getTime() - 46 * DAY), to: new Date(ea.getTime() - 2 * DAY), until: ea },
    { feature: 'elections', text: 'AGM season: turn on Elections & AGM for nominations, voting and minutes?', from: d(1, 5), to: d(3, 31), until: d(3, 31) },
    { feature: 'camps', text: 'Summer holidays are coming: turn on Camps & retreats for family sign-ups and rooms?', from: d(3, 1), to: d(5, 15), until: d(5, 15) },
    { feature: 'annual-return', text: 'The financial year has closed: turn on Annual return to prepare the yearly figures?', from: d(4, 1), to: d(6, 30), until: d(6, 30) },
    { feature: 'offerings', text: 'Harvest festival season: turn on Special offerings to collect and track it?', from: d(9, 1), to: d(11, 30), until: d(11, 30) },
  ].filter((s) => now >= s.from && now <= s.to);
}

const KEY = 'fw.season.dismissed';
const readDismissed = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};

export function SeasonNudge() {
  const can = useCan();
  const { tr } = useOfficeT();
  const { choices, on } = useFeatures();
  const toast = useToast();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [busy, setBusy] = useState(false);
  const now = new Date();
  const year = now.getFullYear();
  const season = seasons(now).find((s) => !on(s.feature) && !dismissed.includes(`${s.feature}:${year}`));
  if (!season || !can('settings')) return null;
  const label = FEATURES.find((f) => f.key === season.feature)?.label ?? season.feature;
  const weeks = Math.max(1, Math.round((season.until.getTime() - now.getTime()) / (7 * DAY)));

  function dismiss() {
    const next = [...dismissed, `${season!.feature}:${year}`];
    setDismissed(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  async function turnOn() {
    setBusy(true);
    try {
      const s = await AdminApi.settings.update({ features: { [season!.feature]: true } });
      setFeatures(s.features ?? { ...choices, [season!.feature]: true });
      toast(tr('{feature} is on. You will find it in the menu.', { feature: tr(label) }));
    } catch {
      toast(tr('Could not change that. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card season-nudge">
      <CalendarHeart size={20} />
      <p className="grow">{tr(season.text, { weeks })}</p>
      <button className="btn primary sm" disabled={busy} onClick={() => void turnOn()}>{tr('Turn on {feature}', { feature: tr(label) })}</button>
      <button className="btn ghost icon sm" onClick={dismiss} aria-label={tr('Not this year')} title={tr('Not this year')}><X size={16} /></button>
    </div>
  );
}
