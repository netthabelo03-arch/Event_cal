// "Report this": a small link under a live event or track that opens a short form.

import { REPORT_REASONS, checkReport, fileReport, reportErrorMessage } from './reports.js';
import { el, whileBusy } from '../dom.js';

/**
 * @param {'event' | 'track'} kind
 * @param {string} itemId
 */
export function reportPanel(kind, itemId) {
  const open = el('button', { type: 'button', class: 'text-link report__open', text: `Report this ${kind}` });
  const panel = el('div', { class: 'stack report' }, [open]);
  open.addEventListener('click', () => {
    let reason = null;
    const pills = REPORT_REASONS.map((item) => {
      const pill = el('button', { type: 'button', class: 'pill', 'aria-pressed': 'false', text: item.name });
      pill.addEventListener('click', () => {
        reason = item.id;
        pills.forEach((other) => other.setAttribute('aria-pressed', String(other === pill)));
      });
      return pill;
    });
    const details = el('textarea', { id: `report-${itemId}`, class: 'input input--area', rows: '3', maxlength: '500' });
    const problem = el('p', { class: 'field__error', role: 'alert' });
    problem.hidden = true;
    const send = el('button', { type: 'button', class: 'button button--primary', text: 'Send report' });
    const cancel = el('button', { type: 'button', class: 'text-link', text: 'Cancel' });
    cancel.addEventListener('click', () => panel.replaceChildren(open));
    send.addEventListener('click', async () => {
      const wrong = checkReport({ reason, details: details.value });
      problem.textContent = wrong ?? '';
      problem.hidden = !wrong;
      if (wrong) return;
      let sent = false;
      await whileBusy(send, 'Sending…', async () => {
        try {
          await fileReport(kind, itemId, { reason, details: details.value });
          sent = true;
        } catch (error) {
          problem.textContent = reportErrorMessage(error);
          problem.hidden = false;
        }
      });
      if (sent) panel.replaceChildren(el('p', { class: 'message message--success', role: 'status', text: 'Thank you. Your report was sent and our team will look at it.' }));
    });
    panel.replaceChildren(
      el('span', { class: 'field__label', id: `report-label-${itemId}`, text: `What is wrong with this ${kind}?` }),
      el('div', { class: 'pills', role: 'group', 'aria-labelledby': `report-label-${itemId}` }, pills),
      el('label', { for: details.id, class: 'field__label', text: 'More detail (optional, unless you chose Something else)' }),
      details,
      problem,
      el('div', { class: 'link-row' }, [send, cancel]),
    );
  });
  return panel;
}
