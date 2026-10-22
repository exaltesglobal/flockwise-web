import type { GivingStatement } from '@/api/admin-types';

import { formatDate, formatMoney } from './format';

const esc = (s: string | null | undefined) => (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Opens a print dialog for a self-contained HTML document (statements, labels, rotas). */
export function printHtml(title: string, body: string, css = '') {
  const w = window.open('', '_blank', 'width=820,height=900');
  if (!w) {
    alert('Allow pop-ups for this site to print.');
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#14211f;margin:32px;font-size:13px}
    h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:20px 0 8px}
    table{width:100%;border-collapse:collapse;margin-top:8px} th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #dde5e3}
    th{font-size:11px;text-transform:uppercase;color:#5b6b68} .num{text-align:right} .muted{color:#5b6b68}
    .tot td{font-weight:700;border-top:2px solid #14211f}
    ${css}
  </style></head><body>${body}<script>window.onload=()=>{window.print()}</script></body></html>`);
  w.document.close();
}

export function statementHtml(s: GivingStatement) {
  const m = (v: number) => esc(formatMoney(v, s.currency));
  return `
    <div style="display:flex;align-items:center;gap:12px">${s.church.logoUrl ? `<img src="${esc(s.church.logoUrl)}" alt="" style="width:56px;height:56px;object-fit:contain">` : ''}<h1 style="margin:0">${esc(s.church.name)}</h1></div>
    <div class="muted">${esc(s.church.address)}${s.church.pan ? ` · PAN ${esc(s.church.pan)}` : ''}${s.church.registration80g ? ` · 80G ${esc(s.church.registration80g)}` : ''}</div>
    <h2>Statement of donations · FY ${esc(s.financialYear)}</h2>
    <p><b>${esc(s.donor.name)}</b>${s.donor.pan ? ` · PAN ${esc(s.donor.pan)}` : ''}<br><span class="muted">${esc(s.donor.address)}</span></p>
    <table><thead><tr><th>Date</th><th>Receipt</th><th>Fund</th><th>Mode</th><th>80G</th><th class="num">Amount</th></tr></thead><tbody>
    ${s.gifts.map((g) => `<tr><td>${esc(formatDate(g.date))}</td><td>${esc(g.receiptNumber ?? '—')}</td><td>${esc(g.fundName)}</td><td>${esc(g.method ?? '')}</td><td>${g.eligible80g ? 'Yes' : 'No'}</td><td class="num">${m(g.amount)}</td></tr>`).join('')}
    <tr class="tot"><td colspan="5">Total</td><td class="num">${m(s.total)}</td></tr>
    <tr><td colspan="5">Eligible for deduction under section 80G</td><td class="num">${m(s.eligible80g)}</td></tr>
    </tbody></table>
    <p class="muted" style="margin-top:24px">This statement lists gifts received during the financial year. The official certificate is Form 10BE, issued after the church files Form 10BD. Cash gifts above ₹2,000, gifts to non-80G funds and FCRA gifts are not eligible.</p>`;
}
