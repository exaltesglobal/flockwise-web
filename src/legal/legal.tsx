import { ArrowLeft } from 'lucide-react';
import { useEffect } from 'react';
import { Link, Navigate, NavLink, useParams } from 'react-router';

import { Logo } from '@/components/ui';

import { BUSINESS, LEGAL_LINKS, LEGAL_PAGES, UPDATED } from './legal-content.mjs';
import './legal.css';

/** Links between policies are written href="@slug" in the shared content. */
const withRoutes = (html: string) => html.replace(/href="@([a-z]+)"/g, 'href="/legal/$1"');

export function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <nav className={`legal-links small ${className}`} aria-label="Policies">
      {LEGAL_LINKS.map((l) => (
        <NavLink key={l.slug} to={`/legal/${l.slug}`}>
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function LegalFooter() {
  return (
    <footer className="legal-footer small muted">
      <LegalLinks />
      <span>
        © {new Date().getFullYear()} {BUSINESS.product} by {BUSINESS.brand} · {BUSINESS.company}
      </span>
    </footer>
  );
}

export function LegalPage() {
  const { slug } = useParams();
  const page = LEGAL_PAGES.find((p) => p.slug === slug);
  useEffect(() => {
    if (page) document.title = `${page.title} · Flockwise`;
    window.scrollTo(0, 0);
  }, [page]);
  if (!page) return <Navigate to="/legal/terms" replace />;
  return (
    <div className="legal">
      <header className="legal-top">
        <Link to="/" aria-label="Flockwise home">
          <Logo height={28} />
        </Link>
        <Link to="/" className="small row" style={{ gap: 6 }}>
          <ArrowLeft size={15} /> Back to Flockwise
        </Link>
      </header>
      <main className="legal-main">
        <LegalLinks className="legal-tabs" />
        <article className="legal-doc">
          <h1>{page.title}</h1>
          <p className="muted">Last updated {UPDATED}</p>
          <div dangerouslySetInnerHTML={{ __html: withRoutes(page.body) }} />
        </article>
      </main>
      <LegalFooter />
    </div>
  );
}
