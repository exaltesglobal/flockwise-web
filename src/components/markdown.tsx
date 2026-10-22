// Light Markdown (headings, bullets, bold, paragraphs) for notes and AI replies, with no HTML allowed through.
import type { ReactNode } from 'react';

export function LightMarkdown({ text, className = 'ai-text' }: { text: string; className?: string }) {
  const out: ReactNode[] = [];
  let list: string[] = [];
  const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/).map((p, i) => (p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p));
  const flush = () => { if (list.length) out.push(<ul key={`l${out.length}`}>{list.map((l, i) => <li key={i}>{bold(l)}</li>)}</ul>); list = []; };
  for (const line of text.split('\n')) {
    const t = line.trim();
    const li = /^([-*•]|\d+\.)\s+(.*)/.exec(t);
    if (li) { list.push(li[2]); continue; }
    flush();
    if (!t) continue;
    const h = /^#{1,4}\s+(.*)/.exec(t);
    out.push(h ? <h4 key={out.length}>{bold(h[1])}</h4> : <p key={out.length}>{bold(t)}</p>);
  }
  flush();
  return <div className={className}>{out}</div>;
}
