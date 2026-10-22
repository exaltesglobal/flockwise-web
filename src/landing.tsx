import { ArrowRight, HeartHandshake, LayoutDashboard } from 'lucide-react';
import { Link } from 'react-router';

import { DemoBanner } from '@/components/server-settings';
import { Logo } from '@/components/ui';
import { LegalFooter } from '@/legal/legal';

import './landing.css';

export function Landing() {
  return (
    <div className="landing">
      <DemoBanner text="Demo mode: sample church data, no server needed. Sign-in code is 123456." />
      <header className="landing-top">
        <Logo height={30} />
        <a className="small muted" href="mailto:hello@flockwise.church">
          hello@flockwise.church
        </a>
      </header>
      <main className="landing-main">
        <div className="landing-hero">
          <span className="badge accent">Made in India, for churches everywhere</span>
          <h1>Every member, cared for.</h1>
          <p className="muted">People, services, groups and giving in one simple place, with UPI giving, 80G receipts and FCRA-safe routing built in.</p>
        </div>
        <div className="landing-cards">
          <Link to="/admin" className="landing-card card">
            <span className="landing-icon">
              <LayoutDashboard size={22} />
            </span>
            <div className="grow">
              <h2>Church office</h2>
              <p className="muted small">For pastors, admins and finance teams. Manage people, events, groups and giving.</p>
            </div>
            <ArrowRight size={18} className="muted" />
          </Link>
          <Link to="/app" className="landing-card card">
            <span className="landing-icon saffron">
              <HeartHandshake size={22} />
            </span>
            <div className="grow">
              <h2>Members</h2>
              <p className="muted small">See what is on, RSVP, join a group and give online. Same as the mobile app.</p>
            </div>
            <ArrowRight size={18} className="muted" />
          </Link>
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}
