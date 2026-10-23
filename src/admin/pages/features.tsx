// Settings › Features: switch whole features on or off so the office menu shows only what this
// church uses. Off only hides the pages; nothing is deleted and switching back brings it all back.
import { useState } from 'react';

import { AdminApi } from '@/api/endpoints';
import { FEATURE_GROUPS, FEATURES, featureOn } from '@/core/features';
import { useToast } from '@/components/ui';

import { setFeatures, useFeatures } from '../features';

export function FeaturesSettings() {
  const { choices } = useFeatures();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const onCount = FEATURES.filter((f) => featureOn(choices, f.key)).length;

  async function flip(key: string, on: boolean) {
    setBusy(key);
    const before = choices;
    setFeatures({ ...choices, [key]: on });
    try {
      const s = await AdminApi.settings.update({ features: { [key]: on } });
      setFeatures(s.features ?? {});
      toast(`${FEATURES.find((f) => f.key === key)?.label} ${on ? 'switched on' : 'switched off'}`);
    } catch {
      setFeatures(before);
      toast('Could not save. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <div className="card card-pad">
        <h2>Features</h2>
        <p className="muted small" style={{ margin: '4px 0 0' }}>Switch on what your church uses; the menu shows only those. Switching off just hides the pages: nothing is deleted. {onCount} of {FEATURES.length} on.</p>
      </div>
      {FEATURE_GROUPS.map((g) => (
        <section key={g.id} className="stack" style={{ gap: 8 }}>
          <span className="section-title" style={{ margin: 0 }}>{g.label}</span>
          <div className="feature-grid">
            {FEATURES.filter((f) => f.group === g.id).map((f) => {
              const on = featureOn(choices, f.key);
              return (
                <div key={f.key} className={`feature-card card ${on ? 'on' : ''}`}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b>{f.label}</b>
                    <p className="small muted">{f.body}</p>
                  </div>
                  {f.core ? <span className="badge">Always on</span> : (
                    <label className="switch"><input type="checkbox" checked={on} disabled={busy === f.key} onChange={(e) => void flip(f.key, e.target.checked)} aria-label={f.label} /><span /></label>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
