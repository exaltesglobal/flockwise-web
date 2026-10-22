// Writes public/<slug>/index.html for each policy page from legal/legal-content.mjs
// (the same file the web app uses), so flockwise.church/terms/ etc. are plain static pages.
import { mkdirSync, writeFileSync } from 'node:fs';
import { BUSINESS, LEGAL_LINKS, LEGAL_PAGES, UPDATED } from '../legal/legal-content.mjs';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const withRoutes = (html) => html.replace(/href="@([a-z]+)"/g, 'href="/$1/"');
const year = new Date().getFullYear();

const links = (current) =>
  LEGAL_LINKS.map((l) => `<a href="/${l.slug}/"${l.slug === current ? ' aria-current="page"' : ''}>${l.label}</a>`).join('');

for (const page of LEGAL_PAGES) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(page.title)} · Flockwise</title>
  <meta name="description" content="${esc(page.summary)}">
  <meta name="theme-color" content="#0f3f36">
  <link rel="canonical" href="${BUSINESS.website}/${page.slug}/">
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/legal.css">
</head>
<body>
  <header class="nav">
    <div class="wrap nav-inner">
      <a href="/" aria-label="Flockwise home"><img src="/brand/logo-reverse.svg" alt="Flockwise" height="28"></a>
      <a class="nav-back" href="/">Back to home</a>
    </div>
  </header>
  <main class="wrap legal-main">
    <nav class="legal-tabs" aria-label="Policies">${links(page.slug)}</nav>
    <article class="legal-doc">
      <h1>${esc(page.title)}</h1>
      <p class="updated">Last updated ${UPDATED}</p>
      ${withRoutes(page.body)}
    </article>
  </main>
  <footer class="foot">
    <div class="wrap foot-inner">
      <nav class="foot-links" aria-label="Policies">${links('')}</nav>
      <span>© ${year} ${BUSINESS.product} by ${BUSINESS.brand} · ${BUSINESS.company}</span>
    </div>
  </footer>
</body>
</html>
`;
  mkdirSync(`public/${page.slug}`, { recursive: true });
  writeFileSync(`public/${page.slug}/index.html`, html);
}
console.log(`Wrote ${LEGAL_PAGES.length} policy pages`);
