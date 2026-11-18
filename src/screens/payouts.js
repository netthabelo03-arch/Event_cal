// Get paid: a Host adds the bank account their ticket money goes to. The
// details go to Paystack, which pays the Host's share of every sale (ticket
// price less plusespot's 5%) the next business day. plusespot keeps only the
// bank's name and the last 4 digits of the account.

import { getMyPayout, payoutBanks, savePayout } from '../tickets/api.js';
import { moneyErrorMessage } from '../tickets/rules.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, field, messageBox, linkTo, whileBusy } from '../dom.js';

export async function renderPayouts({ session }) {
  const { profile, admin } = await loadViewer(session);
  const back = linkTo('#/my-events', 'Back to my events');
  back.className = 'text-link';
  const heading = el('h1', { class: 'title', text: 'Get paid' });
  const head = [topBar({ profile, session, admin }), back, heading];

  if (profile?.role !== 'host') {
    return [...head, el('p', { class: 'notice', text: 'Only Hosts get paid for tickets.' })];
  }

  const current = await getMyPayout(session.user.id).catch(() => null);
  const intro = el('p', { class: 'lead', text: 'Your share of each ticket sale (the ticket price less plusespot\'s 5%) is paid by Paystack into this account the next business day. Buyers pay the card fee.' });
  const now = current
    ? el('p', { class: 'notice', text: `Now paid to ${current.bank_name}, account ending ${current.account_last4} (${current.business_name}).` })
    : null;

  let banks = [];
  const message = messageBox();
  try {
    banks = (await payoutBanks()).banks ?? [];
  } catch (error) {
    return [...head, intro, ...(now ? [now] : []), el('p', { class: 'message message--error', role: 'alert', text: moneyErrorMessage(error?.code ?? 'banks_failed') })];
  }

  const bank = el('select', { id: 'bank', class: 'input' }, [
    el('option', { value: '', text: 'Choose your bank' }),
    ...banks.map((item) => el('option', { value: item.code, text: item.name })),
  ]);
  const name = field({ id: 'business-name', label: 'Account holder or business name', value: current?.business_name ?? profile.full_name ?? '' });
  const account = field({ id: 'account-number', label: 'Account number' });
  account.input.inputMode = 'numeric';
  account.input.autocomplete = 'off';
  const submit = el('button', { type: 'submit', class: 'button button--primary', text: current ? 'Save new bank details' : 'Save bank details' });

  const form = el('form', { class: 'form', novalidate: '' }, [
    el('div', { class: 'field' }, [el('label', { for: 'bank', class: 'field__label', text: 'Bank' }), bank]),
    name.node,
    account.node,
    el('p', { class: 'field__hint', text: 'Check the number carefully: money paid to a wrong account cannot be pulled back. We send it to Paystack and keep only the last 4 digits.' }),
    message.node,
    el('div', { class: 'push-down' }, [submit]),
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.clear();
    const chosen = banks.find((item) => item.code === bank.value);
    if (!chosen) {
      message.show(moneyErrorMessage('bad_bank'));
      return;
    }
    await whileBusy(submit, 'Saving…', async () => {
      try {
        const saved = await savePayout({ bank_code: chosen.code, bank_name: chosen.name, account_number: account.input.value, business_name: name.input.value });
        account.input.value = '';
        heading.textContent = 'Bank details saved';
        form.replaceWith(el('div', { class: 'stack' }, [
          el('p', { class: 'lead', role: 'status', text: `Ticket money will be paid to ${saved.bank_name}, account ending ${saved.account_last4}.` }),
          el('a', { href: '#/my-events', class: 'button button--primary', text: 'Back to my events' }),
        ]));
      } catch (error) {
        message.show(moneyErrorMessage(error?.code));
      }
    });
  });

  return [...head, intro, ...(now ? [now] : []), form];
}
