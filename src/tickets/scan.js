// Door scanning rules, kept apart from the camera and the screen so they can be tested.

/** Seconds before the same code is sent again while it stays in front of the camera. */
export const RESCAN_SECONDS = 4;

/**
 * The ticket code inside whatever was scanned or typed. Spaces and dashes are
 * ignored and small letters are accepted, so a typed "ab12 cd34 ef56" works.
 * @returns {string | null} the 12-character code, or null if it is not one
 */
export function codeFromScan(text) {
  const code = String(text ?? '').replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z0-9]{12}$/.test(code) ? code : null;
}

/** Whether a code was just handled and should be skipped for now. */
export function isRepeat(code, last, now) {
  return last !== null && last.code === code && now - last.at < RESCAN_SECONDS * 1000;
}

function clock(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

/**
 * What to show the person at the door for an answer from check_in_ticket.
 * @param {{ result: string, ticket_type?: string | null, checked_in_at?: string | null } | null} answer
 * @returns {{ tone: 'good' | 'bad' | 'waiting', title: string, detail: string }}
 */
export function scanMessage(answer) {
  const type = answer?.ticket_type || 'Ticket';
  switch (answer?.result) {
    case 'checked_in':
      return { tone: 'good', title: 'Let them in', detail: `${type} checked in.` };
    case 'already_used': {
      const at = clock(answer.checked_in_at);
      return { tone: 'bad', title: 'Already used', detail: at ? `This ${type} ticket was checked in at ${at}.` : `This ${type} ticket was already checked in.` };
    }
    case 'other_event':
      return { tone: 'bad', title: 'Wrong event', detail: 'This ticket is for another of your events.' };
    case 'not_found':
      return { tone: 'bad', title: 'Not a ticket for this event', detail: 'No ticket has this code.' };
    case 'bad_code':
      return { tone: 'waiting', title: 'That is not a ticket code', detail: 'A ticket code is 12 letters and numbers.' };
    default:
      return { tone: 'bad', title: 'Could not check this ticket', detail: 'Check the connection and try again.' };
  }
}

/** "3 of 10 checked in" */
export function checkedInLabel(tickets) {
  const used = tickets.filter((ticket) => ticket.checked_in_at).length;
  return `${used} of ${tickets.length} checked in`;
}
