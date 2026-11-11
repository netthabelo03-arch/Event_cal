# Event_cal

Event Calender is a web app for phones where people find events through short video clips, set reminders and buy tickets.

There are three roles:

- **Goers** scroll clips, set reminders and buy tickets.
- **Hosts** post an event with a clip, sell tickets and scan them at the door.
- **Artists** post a clip of their music.

## Product rules

- A clip is at most 30 seconds long.
- In the Discover feed a clip plays for 5 seconds, then the feed moves to the next one.
- Posting a clip is free. Hosts pay 5% of every ticket sold; buyers pay no booking fee.
- Hosts and artists can pay to boost a clip. Boosted clips are labelled "Promoted".
- Launch city: Johannesburg.

## How the work is organised

The app is built in sprints. Each sprint has its own branch, its own folder of code and its own tests, so a defect can be traced to the sprint that caused it.

| Sprint | What gets built | Done when |
|---|---|---|
| 0 | Project setup: code structure, theme, test setup | An empty app opens and the tests run |
| 1 | Accounts: sign up, sign in, the three roles, profile | A person can register, log in and log out |
| 2 | Host posts an event with a clip, 30-second limit, admin review | A host's event is approved and saved |
| 3 | Discover feed with 5-second previews, event page, search | A goer can scroll clips and open an event |
| 4 | Reminders and notifications | A goer gets reminded before an event |
| 5 | Tickets: ticket types, checkout, QR ticket | A goer can pay (test mode) and receive a ticket |
| 6 | Door scanning, guest list, refunds, host payouts | A ticket is scanned once and the payout is correct |
| 7 | Paid boosts and the Promoted label | A host can pay to boost a clip |
| 8 | Artists and the music feed | An artist's clip appears under Music |
| 9 | Legal pages, reporting, error states, launch checks | Ready for real users |

Defects are recorded in [docs/defect-log.md](docs/defect-log.md).

## What is here so far (Sprint 0, part 1)

- `src/rules/clip.js`: the 30-second and 5-second clip rules.
- `src/rules/fees.js`: the 5% host fee and payout calculation.
- `src/theme/tokens.css`: the green and black colours every screen uses.
- `tests/`: automated tests for the rules above.

Still to come in Sprint 0: the React app shell and the installable web app setup.

## Running the tests

You need Node.js 20 or newer. No packages have to be installed yet.

```
npm test
```
