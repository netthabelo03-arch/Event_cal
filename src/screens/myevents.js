// My events: a host's own events with their review status, and the way in
// to posting a new one.

import { listMyEvents, requestEventEnd, latestEndRequest } from '../events/api.js';
import { addTicketTypes, cancelEvent, eventTakings, getMyPayout, setRefundDays } from '../tickets/api.js';
import { REFUND_CHOICES, refundPolicyLabel } from '../rules/fees.js';
import { ticketEditor } from '../tickets/editor.js';
import { formatRand, moneyErrorMessage } from '../tickets/rules.js';
import { DOOR_DEVICE_LIMIT, listDoorDevices, addDoorDevice, revokeDoorDevice, doorLink, doorErrorMessage, lastUsedLabel } from '../tickets/doors.js';
import { qrSvgForText } from '../tickets/qr.js';
import { startBoost, payDemoBoost, verifyBoost } from '../boosts/api.js';
import { BOOST_OPTIONS, boostedUntil, boostedLabel, boostErrorMessage } from '../boosts/rules.js';
import { statusOf, formatWhen, formatWhenRange, johannesburgParts, startsAtIso, checkExtension, extensionMessage, extensionStatus } from '../events/rules.js';
import { viewsLabel } from '../events/discovery.js';
import { friendlyAuthError } from '../auth/errors.js';
import { loadViewer } from '../viewer.js';
import { topBar } from '../usermenu.js';
import { el, linkTo, whileBusy } from '../dom.js';

/**
 * "Add tickets" for an upcoming event that has none yet (for example one posted
 * before ticket sales existed). Opens the ticket editor in place.
 */
function addTicketsPanel(event) {
  const open = el('button', { type: 'button', class: 'button button--quiet button--small', text: 'Add tickets' });
  const panel = el('div', { class: 'stack' }, [open]);
  open.addEventListener('click', () => {
    const editor = ticketEditor();
    const message = el('p', { class: 'field__error', role: 'alert' });
    message.hidden = true;
    const save = el('button', { type: 'button', class: 'button button--primary', text: 'Save tickets' });
    const cancel = el('button', { type: 'button', class: 'text-link', text: 'Cancel' });
    cancel.addEventListener('click', () => panel.replaceChildren(open));
    save.addEventListener('click', async () => {
      message.hidden = true;
      const result = editor.check();
      if (!result.ok || result.types.length === 0) {
        message.textContent = result.types.length === 0 ? 'Add at least one ticket type.' : 'Fix the highlighted tickets and try again.';
        message.hidden = false;
        return;
      }
      let saved = false;
      await whileBusy(save, 'Saving…', async () => {
        try {
          await addTicketTypes(event.id, result.types);
          saved = true;
        } catch (error) {
          message.textContent = friendlyAuthError(error);
          message.hidden = false;
        }
      });
      if (saved) {
        const total = result.types.reduce((sum, type) => sum + type.quantity, 0);
        const when = event.status === 'live' ? 'They are on sale now.' : 'They go on sale when the event is approved.';
        panel.replaceChildren(el('p', { class: 'event-row__meta', role: 'status', text: `${total} tickets added. ${when}` }));
      }
    });
    panel.replaceChildren(editor.node, message, el('div', { class: 'link-row' }, [save, cancel]));
  });
  return panel;
}

/**
 * "Boost this clip" for a live, upcoming event: choose 1, 3 or 7 days, pay,
 * and the clip moves to the front as "Promoted". A second boost adds time.
 */
function boostPanel(event) {
  const status = el('span', { class: 'chip chip--good' });
  const showUntil = (until) => {
    status.hidden = !until;
    if (until) status.textContent = boostedLabel(until);
  };
  showUntil(boostedUntil(event.boosts));
  const open = el('button', { type: 'button', class: 'button button--quiet button--small', text: boostedUntil(event.boosts) ? 'Add more boost days' : 'Boost this clip' });
  const body = el('div', { class: 'stack' }, [open]);
  const panel = el('div', { class: 'stack boost' }, [status, body]);
  const reset = () => body.replaceChildren(open);

  const problem = el('p', { class: 'field__error', role: 'alert' });
  const fail = (text) => {
    problem.textContent = text;
    problem.hidden = false;
  };
  const done = (until) => {
    showUntil(until);
    open.textContent = 'Add more boost days';
    body.replaceChildren(el('p', { class: 'event-row__meta', role: 'status', text: 'Your clip now shows first, marked Promoted.' }), open);
  };

  open.addEventListener('click', () => {
    problem.hidden = true;
    const cancel = el('button', { type: 'button', class: 'text-link', text: 'Cancel' });
    cancel.addEventListener('click', reset);
    const choices = BOOST_OPTIONS.map((option) => {
      const button = el('button', { type: 'button', class: 'button button--quiet button--small', text: `${option.label} · ${formatRand(option.cents)}` });
      button.addEventListener('click', async () => {
        problem.hidden = true;
        let started = null;
        await whileBusy(button, 'Starting…', async () => {
          try {
            started = await startBoost(event.id, option.days);
          } catch (error) {
            fail(boostErrorMessage(error?.code));
          }
        });
        if (!started) return;
        if (started.authorization_url) {
          window.location.assign(started.authorization_url);
          return;
        }
        if (started.demo !== true) {
          fail(boostErrorMessage(''));
          return;
        }
        // Demo payments: no real money. The host taps Pay and the boost starts.
        const pay = el('button', { type: 'button', class: 'button button--primary', text: `Pay ${formatRand(started.amount_cents)} (demo)` });
        pay.addEventListener('click', async () => {
          problem.hidden = true;
          let paid = null;
          await whileBusy(pay, 'Paying…', async () => {
            try {
              paid = await payDemoBoost(started.boost_id);
            } catch {
              paid = null;
            }
          });
          if (paid?.status === 'paid') done(paid.ends_at);
          else fail('The demo payment did not go through. Please try again.');
        });
        body.replaceChildren(
          el('p', { class: 'event-row__meta', text: `Demo payment for a ${option.label} boost: no real money is charged and no card is needed.` }),
          problem,
          el('div', { class: 'link-row' }, [pay, cancel]),
        );
      });
      return button;
    });
    body.replaceChildren(
      el('p', { class: 'event-row__meta', text: 'A boost shows your clip first on Discover, in the feed and in search, marked Promoted.' }),
      el('div', { class: 'pills' }, choices),
      problem,
      cancel,
    );
  });

  problem.hidden = true;
  return panel;
}

/** Change the refund rule; only works until the first ticket is sold. */
function refundRulePanel(event) {
  const line = el('span', { class: 'event-row__meta', text: `Refunds: ${refundPolicyLabel(event.refund_days)}` });
  const change = el('button', { type: 'button', class: 'text-link', text: 'Change' });
  const area = el('div', { class: 'refund-rule' }, [line, change]);
  const showLine = () => {
    area.className = 'refund-rule';
    area.replaceChildren(line, change);
  };
  change.addEventListener('click', () => {
    const problem = el('p', { class: 'field__error', role: 'alert' });
    problem.hidden = true;
    const pills = REFUND_CHOICES.map((choice) => {
      const button = el('button', { type: 'button', class: 'pill', 'aria-pressed': String(choice.days === (event.refund_days ?? null)), text: choice.label });
      button.addEventListener('click', async () => {
        problem.hidden = true;
        try {
          await setRefundDays(event.id, choice.days);
          event.refund_days = choice.days;
          line.textContent = `Refunds: ${refundPolicyLabel(choice.days)}`;
          showLine();
        } catch (error) {
          problem.textContent = moneyErrorMessage(error?.message);
          problem.hidden = false;
        }
      });
      return button;
    });
    const close = el('button', { type: 'button', class: 'text-link', text: 'Leave it as it is' });
    close.addEventListener('click', showLine);
    area.className = 'refund-rule refund-rule--open';
    area.replaceChildren(
      el('span', { class: 'field__label', text: 'Until when can buyers cancel and get their money back?' }),
      el('div', { class: 'pills' }, pills),
      problem,
      close,
    );
  });
  return area;
}

/**
 * "Ends: …" with "Ask to extend": the Host asks an Admin for a later end time
 * (026). The answer shows here: waiting, approved, or not approved with the
 * Admin's note.
 */
function endTimePanel(event) {
  const line = el('span', { class: 'event-row__meta', text: `Ends: ${formatWhen(event.ends_at)}` });
  const ask = el('button', { type: 'button', class: 'text-link', text: 'Ask to extend' });
  const status = el('span', { class: 'chip' });
  status.hidden = true;
  const area = el('div', { class: 'refund-rule' }, [line, ask, status]);
  const showStatus = (request) => {
    const shown = extensionStatus(request);
    status.hidden = !shown;
    if (shown) {
      status.className = `chip chip--${shown.tone}`;
      status.textContent = shown.text;
    }
    // One open request at a time.
    ask.hidden = request?.status === 'pending';
  };
  const showLine = () => {
    area.className = 'refund-rule';
    area.replaceChildren(line, ask, status);
  };
  latestEndRequest(event.id).then(showStatus).catch(() => {});
  ask.addEventListener('click', () => {
    const now = johannesburgParts(event.ends_at);
    const date = el('input', { type: 'date', class: 'input', value: now.date, 'aria-label': 'New end date' });
    const time = el('input', { type: 'time', class: 'input', value: now.time, 'aria-label': 'New end time' });
    const reason = el('textarea', { class: 'input input--area', rows: '2', maxlength: '500', 'aria-label': 'Why the event needs more time' });
    const problem = el('p', { class: 'field__error', role: 'alert' });
    problem.hidden = true;
    const send = el('button', { type: 'button', class: 'button button--primary button--small', text: 'Send request' });
    const close = el('button', { type: 'button', class: 'text-link', text: 'Leave it as it is' });
    close.addEventListener('click', showLine);
    send.addEventListener('click', async () => {
      const wrong = checkExtension(event, date.value, time.value, reason.value);
      if (wrong) {
        problem.textContent = wrong;
        problem.hidden = false;
        return;
      }
      problem.hidden = true;
      await whileBusy(send, 'Sending…', async () => {
        try {
          await requestEventEnd(event.id, startsAtIso(date.value, time.value), reason.value.trim());
          showStatus({ status: 'pending', requested_ends_at: startsAtIso(date.value, time.value) });
          showLine();
        } catch (error) {
          problem.textContent = extensionMessage(error);
          problem.hidden = false;
        }
      });
    });
    area.className = 'refund-rule refund-rule--open';
    area.replaceChildren(
      el('span', { class: 'field__label', text: 'Until when should the event run?' }),
      el('p', { class: 'field__hint', text: 'An admin checks the request. Until it is approved, the event ends at its current time. Up to 31 days after the start.' }),
      el('div', { class: 'field-pair' }, [date, time]),
      el('label', { class: 'field__label', text: 'Why does it need more time?' }),
      reason,
      problem,
      el('div', { class: 'confirm-row' }, [send, close]),
    );
  });
  return area;
}

/** Ticket money for one event: what was sold, plusespot's 5%, what the Host gets, refunds. */
function takingsLine(event) {
  const line = el('span', { class: 'event-row__meta' });
  eventTakings(event.id).then((takings) => {
    if (!takings || (takings.paid_orders === 0 && Number(takings.refunded_cents) === 0)) return;
    const sales = Number(takings.tickets_cents);
    const commission = Number(takings.commission_cents);
    const refunded = Number(takings.refunded_cents);
    line.textContent = `Sales ${formatRand(sales)} · plusespot 5% ${formatRand(commission)} · yours ${formatRand(sales - commission)}${refunded > 0 ? ` · refunded ${formatRand(refunded)}` : ''}`;
  }).catch(() => {});
  return line;
}

/**
 * "Cancel event": two taps, then every buyer is refunded in full. It sits in
 * its own area at the bottom of the event, set apart from everything else,
 * so it cannot be tapped by mistake (for example instead of "No refunds").
 */
function cancelPanel(event, row) {
  const open = el('button', { type: 'button', class: 'button button--danger button--small', text: 'Cancel event…' });
  const area = el('div', { class: 'event-row__danger' }, [open]);
  open.addEventListener('click', () => {
    const problem = el('p', { class: 'field__error', role: 'alert' });
    problem.hidden = true;
    const sure = el('button', { type: 'button', class: 'button button--danger', text: 'Yes, cancel and refund everyone' });
    const keep = el('button', { type: 'button', class: 'button button--quiet', text: 'No, keep the event' });
    keep.addEventListener('click', () => area.replaceChildren(open));
    sure.addEventListener('click', async () => {
      problem.hidden = true;
      let result = null;
      await whileBusy(sure, 'Cancelling…', async () => {
        try {
          result = await cancelEvent(event.id);
        } catch (error) {
          problem.textContent = moneyErrorMessage(error?.code);
          problem.hidden = false;
        }
      });
      if (!result) return;
      const refunds = result.refunds === 0 ? 'Nobody had paid yet, so there was nothing to refund.'
        : `${result.refunds} ${result.refunds === 1 ? 'order is' : 'orders are'} being refunded in full.${result.failed > 0 ? ` ${result.failed} could not be started; we will follow up.` : ''}`;
      row.replaceChildren(
        el('span', { class: 'event-row__title', text: event.title }),
        el('span', { class: 'chip chip--bad', text: 'Cancelled' }),
        el('p', { class: 'event-row__meta', role: 'status', text: `The event is cancelled and no longer listed. ${refunds}` }),
      );
    });
    area.replaceChildren(
      el('p', { class: 'event-row__meta', text: 'This cannot be undone. The event leaves Discover, every ticket stops working, and every buyer gets their money back in full, booking fee included. Refunds come out of your sales.' }),
      problem,
      el('div', { class: 'confirm-row' }, [keep, sure]),
    );
  });
  return area;
}

function eventRow(event) {
  const status = statusOf(event.status);
  const dates = el('span', { class: 'event-row__meta', text: `${formatWhenRange(event.starts_at, event.ends_at)} · ${event.venue}` });
  const lines = [
    el('span', { class: 'event-row__title', text: event.title }),
    dates,
    el('span', { class: `chip chip--${status.tone}`, text: status.label }),
  ];
  if (event.status === 'rejected' && event.reject_reason) {
    lines.push(el('span', { class: 'event-row__meta', text: `Reason: ${event.reject_reason}` }));
  }
  if (event.status === 'rejected' && Date.parse(event.starts_at) > Date.now()) {
    lines.push(el('a', { href: `#/edit-event/${event.id}`, class: 'button button--quiet button--small event-row__scan', text: 'Edit and send back' }));
  }
  if (event.status === 'live') {
    lines.push(el('span', { class: 'event-row__meta', text: viewsLabel(event.view_count) }));
    const types = Array.isArray(event.ticket_types) ? event.ticket_types : [];
    if (types.length > 0) {
      const sold = types.reduce((sum, type) => sum + type.sold, 0);
      const total = types.reduce((sum, type) => sum + type.quantity, 0);
      lines.push(el('span', { class: 'event-row__meta', text: `${sold} of ${total} tickets taken` }));
    }
  }
  const hasTickets = Array.isArray(event.ticket_types) && event.ticket_types.length > 0;
  if (!hasTickets && (event.status === 'live' || event.status === 'in_review') && Date.parse(event.starts_at) > Date.now()) {
    lines.push(addTicketsPanel(event));
  }
  const upcoming = Date.parse(event.starts_at) > Date.now();
  if (event.status === 'live' || event.status === 'cancelled') lines.push(takingsLine(event));
  if ((event.status === 'live' || event.status === 'in_review') && upcoming) lines.push(refundRulePanel(event));
  if (event.status === 'live') {
    const view = linkTo(`#/event/${event.id}`, 'View event');
    view.className = 'text-link event-row__link';
    lines.push(view);
    if (Date.parse(event.starts_at) > Date.now()) lines.push(boostPanel(event));
    if (hasTickets) {
      const scan = el('a', { href: `#/scan/${event.id}`, class: 'button button--quiet button--small event-row__scan', text: 'Scan tickets at the door' });
      lines.push(scan);
    }
  }
  // The Host can ask to extend while the event has not ended (026).
  if ((event.status === 'live' || event.status === 'in_review') && !event.cancelled_at && event.ends_at && Date.parse(event.ends_at) > Date.now()) {
    lines.splice(2, 0, endTimePanel(event));
  }
  const row = el('li', { class: 'event-row' }, lines);
  if ((event.status === 'live' || event.status === 'in_review') && upcoming) row.append(cancelPanel(event, row));
  return row;
}

/**
 * Door scanners (027): up to 20 phones that scan tickets for the Host. Each
 * gets a secret link (shown once, with a QR code to open it on the phone).
 */
async function doorDevicesCard(userId) {
  const list = el('ul', { class: 'door-devices' });
  const count = el('p', { class: 'event-row__meta' });
  const problem = el('p', { class: 'field__error', role: 'alert' });
  problem.hidden = true;
  const fresh = el('div', { class: 'door-devices__new' });
  fresh.hidden = true;
  let devices = await listDoorDevices(userId).catch(() => []);

  const name = el('input', { type: 'text', class: 'input', maxlength: '40', placeholder: 'For example Gate 1', 'aria-label': 'Scanner name' });
  const add = el('button', { type: 'button', class: 'button button--quiet button--small', text: 'Add a scanner' });

  function draw() {
    count.textContent = `${devices.length} of ${DOOR_DEVICE_LIMIT} scanners. Each opens a link on a phone and checks tickets in for your events, from 12 hours before the start until the end. No account needed.`;
    add.disabled = devices.length >= DOOR_DEVICE_LIMIT;
    list.replaceChildren(...devices.map((device) => {
      const off = el('button', { type: 'button', class: 'text-link', text: 'Switch off' });
      const row = el('li', { class: 'door-device' }, [
        el('span', { class: 'event-row__title', text: device.name }),
        el('span', { class: 'event-row__meta', text: lastUsedLabel(device.last_used_at, Date.now()) }),
        off,
      ]);
      off.addEventListener('click', async () => {
        if (off.dataset.sure !== 'yes') {
          off.dataset.sure = 'yes';
          off.textContent = 'Tap again to switch it off for good';
          return;
        }
        await whileBusy(off, 'Switching off…', async () => {
          try {
            await revokeDoorDevice(device.id);
            devices = devices.filter((item) => item.id !== device.id);
            draw();
          } catch (error) {
            problem.textContent = doorErrorMessage(error);
            problem.hidden = false;
          }
        });
      });
      return row;
    }));
  }

  add.addEventListener('click', async () => {
    problem.hidden = true;
    const label = name.value.trim();
    if (!label) {
      problem.textContent = doorErrorMessage({ message: 'no_name' });
      problem.hidden = false;
      return;
    }
    await whileBusy(add, 'Adding…', async () => {
      try {
        const made = await addDoorDevice(label);
        devices.push({ id: made.device_id, name: label, last_used_at: null });
        name.value = '';
        draw();
        const link = doorLink(made.token, location.href);
        const copy = el('button', { type: 'button', class: 'button button--quiet button--small', text: 'Copy link' });
        copy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(link);
            copy.textContent = 'Copied';
          } catch {
            copy.textContent = 'Select the link and copy it';
          }
        });
        const picture = el('div', { class: 'door-devices__qr', 'aria-label': `QR code for ${label}` });
        qrSvgForText(link).then((svg) => { if (svg) picture.innerHTML = svg; });
        fresh.replaceChildren(
          el('p', { class: 'field__label', text: `Link for ${label}` }),
          el('p', { class: 'field__hint', text: 'Open it on the scanning phone: scan this QR code with its camera, or send the link. It is shown only now. Anyone with the link can check your tickets in, so share it only with your door staff. Lost it? Switch the scanner off and add a new one.' }),
          picture,
          el('p', { class: 'door-devices__link', text: link }),
          copy,
        );
        fresh.hidden = false;
      } catch (error) {
        problem.textContent = doorErrorMessage(error);
        problem.hidden = false;
      }
    });
  });

  draw();
  return el('section', { class: 'notice door-devices__card' }, [
    el('h2', { class: 'section__title', text: 'Door scanners' }),
    count,
    list,
    el('div', { class: 'field-pair' }, [name, add]),
    problem,
    fresh,
  ]);
}

/** Where the Host's ticket money goes: their bank, or a nudge to add it. */
async function payoutCard(userId) {
  const payout = await getMyPayout(userId).catch(() => null);
  const link = el('a', { href: '#/payouts', class: 'text-link', text: payout ? 'Change bank details' : 'Add bank details' });
  return el('div', { class: `notice${payout ? '' : ' notice--warning'}` }, [
    el('p', { text: payout
      ? `Ticket money is paid to ${payout.bank_name}, account ending ${payout.account_last4}, the next business day after each sale (less plusespot's 5%).`
      : 'Add your bank details to get your ticket money automatically, the next business day after each sale (less plusespot\'s 5%).' }),
    link,
  ]);
}

export async function renderMyEvents({ session }) {
  const { profile, admin } = await loadViewer(session);
  const back = linkTo('#/', 'Back to Discover');
  back.className = 'text-link';
  const head = [topBar({ profile, session, admin }), back, el('h1', { class: 'title', text: 'My events' })];

  if (profile?.role !== 'host') {
    return [
      ...head,
      el('p', { class: 'notice', text: 'Only hosts can post events.' }),
      el('p', { class: 'link-row' }, [linkTo('#/profile', 'Switch to Host in your profile')]),
    ];
  }

  const promote = el('a', { href: '#/new-event', class: 'button button--primary', text: 'Promote an event' });

  // Back from the payment page for a boost: confirm it before listing the events.
  try {
    const waiting = window.sessionStorage.getItem('boost-to-confirm');
    if (waiting) {
      window.sessionStorage.removeItem('boost-to-confirm');
      await verifyBoost(waiting).catch(() => {});
    }
  } catch {
    // Without storage the webhook still switches the boost on.
  }

  let events;
  try {
    events = await listMyEvents(session.user.id);
  } catch (error) {
    return [...head, promote, el('p', { class: 'message message--error', role: 'alert', text: friendlyAuthError(error) })];
  }

  if (events.length === 0) {
    return [...head, promote, el('p', { class: 'notice', text: 'You have not posted an event yet. Your events and their review status will show here.' })];
  }
  return [...head, promote, await payoutCard(session.user.id), await doorDevicesCard(session.user.id), el('ul', { class: 'event-list' }, events.map(eventRow))];
}
