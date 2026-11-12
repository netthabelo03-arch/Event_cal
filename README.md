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

Defects are recorded in [docs/defect-log.md](docs/defect-log.md). Ideas for later are kept in [docs/backlog.md](docs/backlog.md).

## How it is built

Plain HTML, CSS and JavaScript. There is no framework and nothing to install.

| File or folder | What it holds |
|---|---|
| `index.html` | The single page the app runs in |
| `src/app.css` | Layout and controls shared by every screen |
| `src/theme/tokens.css` | The green and black colours every screen uses |
| `src/app.js` | Starts the app and shows the right screen |
| `src/usermenu.js` | The top bar: Sign up and Log in, or the person's name with Profile and Log out |
| `src/next.js` | Remembers the item a signed-out person clicked, for after log-in |
| `src/sample.js` | Sample items for Discover, to be removed when real events exist |
| `src/router.js` | Works out which screen an address means |
| `src/roles.js` | The list of roles; add a role here and it appears in the profile |
| `src/screens/` | One file per screen |
| `src/auth/` | Accounts: form checks, error messages and the calls to Supabase |
| `src/events/` | Events: the form's rules, statuses, dates, and the calls to Supabase |
| `src/viewer.js` | Who is signed in: their profile and whether they are an admin |
| `src/config.js` | The Supabase project address and publishable key |
| `supabase/` | Database setup scripts, run once in the Supabase dashboard |
| `src/rules/` | Product rules: clip length and the host fee |
| `sw.js`, `manifest.webmanifest` | Let people add the app to their home screen |
| `tests/` | Automated tests |
| `docs/defect-log.md` | The defect log |

## What works so far (Sprints 0 to 2)

- Discover, open to everyone, with sample events, hosts and music.
- Item details that need a log-in, returning to the clicked item afterwards.
- Sign up with an email and a password, log in, forgot password, profile (name and role) and log out from the menu under the person's name.
- Hosts post an event with a clip of at most 30 seconds; admins approve or reject it; approved events show on Discover with their own page.
- The app can be added to a phone's home screen.

## Accounts (Sprint 1)

Anyone can browse Discover without an account. Clicking an item (an event, a host or an artist) asks a signed-out person to log in, and brings them back to that item afterwards. Signing up takes an email and a strong password (8+ characters with a capital letter, a small letter, a number and a symbol), confirmed once by an emailed link; after that the person stays signed in on the device. Everyone starts as a Goer; a name, and switching to Host or Artist, are optional steps in the profile. Accounts and profiles are kept in Supabase.

Until real content exists, Discover shows sample items from `src/sample.js`. Sample events disappear as soon as one real event is live; sample hosts and music stay until those are built.

One-time setup in the Supabase dashboard:

1. **Create the profiles table.** Open SQL Editor, paste the contents of [`supabase/001_profiles.sql`](supabase/001_profiles.sql) and press Run.
2. **Tell Supabase where the app lives.** Under Authentication, then URL Configuration, set Site URL to the app's web address and add the same address to Redirect URLs. Email links (confirm account, reset password) send people back there.

`src/config.js` holds the Supabase project URL and publishable key. The publishable key is meant to be public. Never put a secret key in this repository.

Manual test cases for this sprint are in [docs/sprint-1-test-cases.md](docs/sprint-1-test-cases.md).

## Events (Sprint 2)

A person whose role is Host can post an event from **My events**: a video clip of at most 30 seconds (MP4, WebM or MOV, up to 50 MB), the event's name, date, start time, venue, category and an optional description. The event then waits in the **Review queue**, where an admin watches the clip and approves or rejects it with a reason. Approved events appear under "Upcoming events" on Discover, where each clip plays its first 5 seconds by itself, muted, one after another. Clicking an event opens its page, where the full clip (at most 30 seconds) starts playing by itself. Clips do not play by themselves for people whose device asks for reduced motion or data saving. Event times are always Johannesburg time.

One-time setup in the Supabase dashboard:

1. **Create the events table and clip storage.** Open SQL Editor, paste the contents of [`supabase/002_events.sql`](supabase/002_events.sql) and press Run.
2. **Make yourself an admin.** Sign up in the app, then run the one-line statement at the end of that file with your sign-up email.

Things to know:

- The clip's length is checked on the host's device before upload. The database only accepts a reported length of 30 seconds or less, and the review queue shows the clip's actual length, so the admin review is the final check.
- Clips are in a public storage bucket: anyone who has a clip's address can play it, including before approval. The address is long and random, and unapproved events are not listed anywhere.
- Hosts cannot edit or delete an event yet. That arrives with the manage-event screen in a later sprint.

Manual test cases for this sprint are in [docs/sprint-2-test-cases.md](docs/sprint-2-test-cases.md).

## Opening the app

The app must be opened through a web address, not by double-clicking `index.html`; browsers block this kind of JavaScript when a file is opened directly.

- **Online:** turn on GitHub Pages for this repository (Settings, then Pages, then deploy from a branch) and open the address GitHub gives you.
- **On your computer:** in this folder run `python -m http.server 8000`, then open `http://localhost:8000`.

## Running the tests

You need Node.js 20 or newer. Nothing has to be installed.

```
npm test
```
