import { Server } from 'lucide-react';
import { useState } from 'react';

import { resetDemoData } from '@/api/mock';
import { BuildConfig, canOverrideServer, getApiUrl, isUsingMocks, setApiUrlOverride } from '@/lib/config';

import { Field } from './ui';

/** Lets testers point this build at a real Flockwise API (e.g. staging on Hostinger). Hidden in production. */
export function ServerSettings({ labels }: { labels?: { title: string; body: string; url: string; save: string; reset: string; demo: string } }) {
  const l = labels ?? {
    title: 'Server',
    body: 'Point this test build at a Flockwise API. Not shown in production builds.',
    url: 'API base URL',
    save: 'Connect',
    reset: 'Back to demo data',
    demo: 'Using demo data',
  };
  const [url, setUrl] = useState(isUsingMocks() ? '' : getApiUrl());
  if (!canOverrideServer()) return null;
  return (
    <div className="stack">
      <div className="row">
        <Server size={18} className="muted" />
        <h3>{l.title}</h3>
        {isUsingMocks() ? <span className="badge warn">{l.demo}</span> : <span className="badge ok">{getApiUrl()}</span>}
      </div>
      <p className="small muted">{l.body}</p>
      <Field label={l.url} hint={`Default: ${BuildConfig.apiUrl}`}>
        <input className="input" placeholder="https://staging-api.flockwise.church/v1" value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <div className="row wrap">
        <button className="btn primary" disabled={!/^https?:\/\//.test(url.trim())} onClick={() => setApiUrlOverride(url)}>
          {l.save}
        </button>
        <button className="btn" onClick={() => setApiUrlOverride(null)}>
          {l.reset}
        </button>
        {isUsingMocks() && (
          <button
            className="btn ghost"
            onClick={() => {
              resetDemoData();
              window.location.reload();
            }}
          >
            Reset demo data
          </button>
        )}
      </div>
    </div>
  );
}

export function DemoBanner({ text, href }: { text: string; href?: string }) {
  if (!isUsingMocks()) return null;
  return <div className="demo-banner">{href ? <a href={href}>{text}</a> : text}</div>;
}
