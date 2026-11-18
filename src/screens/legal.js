// Terms and Privacy. Open to everyone, signed in or not.
//
// IMPORTANT: this wording is a plain-language DRAFT written to make the app
// complete for testing. It is not legal advice and has not been reviewed by a
// lawyer. It must be reviewed, and the [bracketed] details filled in, before
// real users are invited (see docs/launch-checklist.md).

import { brand, el, linkTo } from '../dom.js';

/** Shown at the top of both pages until the wording has been reviewed. */
export const LEGAL_STATUS = 'Draft, last updated 16 November 2026. This wording is still to be reviewed by a lawyer before launch.';

export const TERMS = [
  ['Who we are', ['plusespot is run by [company or owner name], based in Johannesburg, South Africa. You can reach us at [contact email].']],
  ['Your account', [
    'You need an account to open events and tracks, set reminders, buy tickets and post content. Give a real email address and keep your password to yourself.',
    'You are responsible for what happens under your account. Tell us if you think someone else is using it.',
  ]],
  ['Goers, Hosts and Artists', [
    'Everyone starts as a Goer. You can switch to Host to promote events or to Artist to post music.',
    'Hosts and Artists must only post content they have the right to post: your own event, your own music, and video you are allowed to use.',
  ]],
  ['What you may not post', [
    'Nothing illegal, hateful, sexually explicit, violent or misleading, and nothing that uses someone else\'s work without permission.',
    'Every event and track is checked before it goes live. We may refuse it or take it down, and we tell you why.',
  ]],
  ['Tickets', [
    'Tickets are sold by the Host of the event, not by plusespot. The Host is responsible for the event taking place as described.',
    'Buyers pay the ticket price shown, with no booking fee. plusespot keeps 5% of each ticket sold, paid by the Host.',
    'Each ticket has its own code and lets one person in once.',
    'Refunds and cancelled events: [refund policy to be decided before real payments are switched on].',
  ]],
  ['Boosts', ['A Host can pay to show an event first, marked Promoted, for 1, 3 or 7 days. A boost that has started is not refunded.']],
  ['Reports and disputes', [
    'Anyone signed in can report an event or track. We look at every report and may take the item down.',
    'An Artist who posted the wrong track can file a dispute and gets a ticket number and an answer within 24 hours.',
  ]],
  ['Reminders', ['Reminders are a convenience. A reminder that arrives late or not at all is not a reason for a refund.']],
  ['Changes and ending', [
    'We may change these terms and will show the date of the latest version here.',
    'You can stop using plusespot at any time and ask us to delete your account. We may close accounts that break these terms.',
  ]],
  ['The law', ['These terms follow the law of South Africa. [Liability and dispute wording to be added by a lawyer.]']],
];

export const PRIVACY = [
  ['In short', ['We collect only what plusespot needs to work, we do not sell it, and you can ask to see or delete it. This page follows South Africa\'s Protection of Personal Information Act (POPIA).']],
  ['What we collect', [
    'Your email address and password (the password is stored scrambled; we cannot read it).',
    'Your name and role, if you add them to your profile. A Host\'s or Artist\'s name is shown publicly on what they post.',
    'What you post: events, tracks, video clips and audio.',
    'What you do: reminders you set, tickets you buy, disputes and reports you send.',
    'If you switch on phone notifications, an address for your browser so we can send them.',
    'Plays and views are counted without recording who watched.',
  ]],
  ['What we do not collect', ['We never see or store your card details. When real payments are on, they are handled by Paystack.']],
  ['Why we use it', [
    'To run your account, show events and music, send the reminders you asked for, issue your tickets and check them at the door.',
    'To review content, handle reports and disputes, and keep the app safe.',
  ]],
  ['Who helps us run plusespot', [
    'Supabase stores accounts, content and files. GitHub hosts the app itself. Paystack will take payments. [Email service] will send reminder emails.',
    'These companies may store data outside South Africa. [Confirm where, and the agreements in place, before launch.]',
  ]],
  ['What other people can see', [
    'A Host sees how many tickets were taken and each ticket\'s code and whether it was used, not who bought it.',
    'Admins can see content and reports in order to review them.',
  ]],
  ['How long we keep it', ['For as long as you have an account. [Retention periods for tickets and payment records to be confirmed.]']],
  ['Your choices', [
    'You can change your name and role in your profile, and switch phone notifications off at any time.',
    'You can ask for a copy of your information, ask us to correct it, or ask us to delete your account, by writing to [contact email].',
    'If you are unhappy with how we handle your information, you can complain to the Information Regulator of South Africa.',
  ]],
  ['Children', ['plusespot is not meant for children under 18 without a parent\'s or guardian\'s consent. [Confirm the age rule before launch.]']],
];

function page(title, sections, other) {
  const back = linkTo('#/', 'Back to Discover');
  back.className = 'text-link';
  const blocks = sections.map(([heading, paragraphs]) => el('section', { class: 'stack legal__section' }, [
    el('h2', { class: 'section__title', text: heading }),
    ...paragraphs.map((text) => el('p', { class: 'detail__text', text })),
  ]));
  return [
    brand(),
    back,
    el('h1', { class: 'title', text: title }),
    el('p', { class: 'notice', text: LEGAL_STATUS }),
    ...blocks,
    el('p', { class: 'link-row' }, ['See also: ', linkTo(other.href, other.text)]),
  ];
}

export function renderTerms() {
  return page('Terms of use', TERMS, { href: '#/privacy', text: 'Privacy' });
}

export function renderPrivacy() {
  return page('Privacy', PRIVACY, { href: '#/terms', text: 'Terms of use' });
}

/** Links for the foot of a page. */
export function legalLinks() {
  return el('p', { class: 'legal-links' }, [linkTo('#/terms', 'Terms'), ' · ', linkTo('#/privacy', 'Privacy')]);
}
