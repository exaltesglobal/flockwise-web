// On a phone, office tables turn into cards (admin.css). Each cell needs its column name to show
// as a small label, so this copies every header's text onto the cells below it as data-label.
import { useEffect } from 'react';

function label(root: ParentNode) {
  root.querySelectorAll<HTMLTableElement>('table.table').forEach((table) => {
    const heads = [...table.querySelectorAll<HTMLTableCellElement>('thead th')].map((th) => th.textContent?.trim() ?? '');
    if (!heads.length) return;
    table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((tr) => {
      [...tr.cells].forEach((td, i) => {
        const text = heads[i] ?? '';
        if (td.dataset.label !== text) td.dataset.label = text;
      });
    });
  });
}

export function useTableCards(selector = '.admin-main') {
  useEffect(() => {
    const root = document.querySelector(selector);
    if (!root) return;
    let queued = false;
    const run = () => {
      queued = false;
      label(root);
    };
    run();
    const obs = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(run);
    });
    obs.observe(root, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, [selector]);
}
