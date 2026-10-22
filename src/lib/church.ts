// Which church this browser is using. One Flockwise server hosts many churches; the web app
// remembers the church's address (its slug) and sends it with requests made before sign-in.
// Links like /c/grace/app/events select the church "grace" and then open /app/events.
const KEY = 'fw.church';

type Listener = (slug: string | null) => void;
const listeners = new Set<Listener>();

function read() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

let current: string | null = read();

export const getChurch = () => current;

export function setChurch(slug: string | null) {
  const next = slug ? slug.trim().toLowerCase() : null;
  if (next === current) return;
  current = next;
  try {
    if (next) localStorage.setItem(KEY, next);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: keep it for this visit */
  }
  listeners.forEach((l) => l(next));
}

export function onChurchChange(l: Listener) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

/** A shareable link to a page of the current church (adds /c/<slug> when one is chosen). */
export function churchUrl(path: string) {
  const base = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}`;
  return current ? `${base}/c/${current}${path}` : `${base}${path}`;
}

// A ?church=<slug> on any page also selects the church.
if (typeof window !== 'undefined') {
  const q = new URLSearchParams(window.location.search).get('church');
  if (q && /^[a-z0-9-]{3,40}$/i.test(q)) setChurch(q);
}
