# Event_cal

plusespot is a web app for phones where people find events through short video clips, set reminders and buy tickets.

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
| 6 | Door scanning and guest list (refunds and host payouts follow once real payments are on) | A ticket is scanned once |
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
| `src/reminders/` | Reminders and phone notifications in the app |
| `src/tickets/` | Ticket types, the tickets box, prices and QR codes |
| `supabase/functions/checkout/`, `supabase/functions/paystack-webhook/` | Starting and confirming Paystack payments |
| `supabase/functions/send-reminders/` | The program on Supabase that sends reminder emails and phone notifications |
| `src/config.js` | The Supabase project address and publishable key |
| `supabase/` | Database setup scripts, run once in the Supabase dashboard |
| `src/rules/` | Product rules: clip length and the host fee |
| `sw.js`, `manifest.webmanifest` | Let people add the app to their home screen |
| `tests/` | Automated tests |
| `docs/defect-log.md` | The defect log |

## What works so far (Sprints 0 to 5)

- Discover, open to everyone, with sample events, hosts and music.
- Item details that need a log-in, returning to the clicked item afterwards.
- Sign up with an email and a password, log in, forgot password, profile (name and role) and log out from the menu under the person's name.
- Hosts post an event with a clip of at most 30 seconds; admins approve or reject it; approved events show on Discover with their own page.
- A full-screen feed of 5-second previews, search with category and date filters, real host pages, and view counts for hosts.
- Reminders: an email 1 day before and a phone notification 2 hours before each event a person taps Remind me on.
- Tickets: hosts set ticket types; Goers buy them through Paystack (or get free ones) and see them in My tickets with a QR code.
- The app can be added to a phone's home screen.

## Accounts (Sprint 1)

Anyone can browse Discover without an account. Clicking an item (an event, a host or an artist) asks a signed-out person to log in, and brings them back to that item afterwards. Signing up takes an email and a strong password (8+ characters with a capital letter, a small letter, a number and a symbol), confirmed once by an emailed link; after that the person stays signed in on the device. Everyone starts as a Goer; a name, and switching to Host or Artist, are optional steps in the profile. Accounts and profiles are kept in Supabase.

Until real content exists, Discover shows sample items from `src/sample.js`. Sample events and hosts disappear as soon as one real event is live; sample music stays until artists can post (Sprint 8).

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

## The feed, search and hosts (Sprint 3)

- **Feed:** "Watch the feed" on Discover shows live events one at a time, full screen. Each clip plays muted for 5 seconds, then the feed moves to the next by itself; scrolling by hand works too. Tapping a clip opens the event.
- **Search:** find live events by words (event name, venue or host), category, and date: today, this weekend or the next 7 days, in Johannesburg time.
- **Hosts:** "Popular hosts" on Discover lists the real hosts of live events, busiest first. Each has a page with their upcoming events, also reached from the host's name on an event page.
- **Views:** opening an event's page counts one view, at most once a day per device, and never for the host's own visits. Hosts see the count in My events. Views will also feed the Trending grid (backlog B-001).

One-time setup: in the Supabase SQL Editor, run [`supabase/003_views.sql`](supabase/003_views.sql).

The view count is a guide, not an audit: someone determined could inflate it, because counting happens from the browser.

Manual test cases for this sprint are in [docs/sprint-3-test-cases.md](docs/sprint-3-test-cases.md).

## Reminders (Sprint 4)

A signed-in person taps **Remind me** on an event. They get an **email 1 day before** the event and, if they turned on phone notifications, a **phone notification 2 hours before**. **My reminders** (in the menu under their name) lists their reminders and lets them remove one or turn phone notifications on or off. On an iPhone, phone notifications work only after adding the app to the home screen.

A small program on Supabase (the `send-reminders` Edge Function) checks every 5 minutes for reminders that are due and sends them. Emails go through Resend, using your own domain.

### One-time setup

1. **Database.** In the SQL Editor run [`supabase/004_reminders.sql`](supabase/004_reminders.sql).
2. **Email service.** Create a free account at resend.com, add your domain and add the DNS records it shows at your domain provider until Resend says the domain is verified. Create an API key.
3. **The sender.** In Supabase, open Edge Functions, create a function named `send-reminders`, and add the two files from [`supabase/functions/send-reminders/`](supabase/functions/send-reminders/) (`index.ts` and `schedule.js`). Turn **off** "Enforce JWT verification" for it (it checks the project's secret key instead), then deploy.
4. **Notification keys.** Open `tools/notification-keys.html` on the live site and press Make keys. The page makes the pair in your browser. The public key goes into `src/config.js` (`VAPID_PUBLIC_KEY`); the private key goes only into Supabase in the next step. Until the public key is set, the app says phone notifications are not available.
5. **Secrets.** In Edge Functions, Secrets, add: `RESEND_API_KEY`, `EMAIL_FROM` (for example `plusespot <reminders@yourdomain.co.za>`), `APP_URL` (`https://netthabelo03-arch.github.io/Event_cal/`), `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (from step 4) and `VAPID_SUBJECT` (`mailto:` followed by your email).
6. **Schedule.** In the SQL Editor, open [`supabase/005_schedule_reminders.sql`](supabase/005_schedule_reminders.sql), put in your project address and secret key where it says, and run it. Do not save the file with the real key in it.

To check the sender, open Edge Functions, `send-reminders`, Logs. Each run reports how many emails and notifications it sent and any failures.

Manual test cases for this sprint are in [docs/sprint-4-test-cases.md](docs/sprint-4-test-cases.md).

## Tickets (Sprint 5)

Hosts set ticket types when they promote an event (for example General R150, 200 of them; a price of 0 makes free tickets). On the event page a Goer picks how many of each (at most 10 per order) and pays on Paystack's secure page. Once Paystack confirms the payment the tickets appear in **My tickets**, each with a QR code and a code to show at the door. Free tickets are issued at once.

Prices and stock are checked in the database, never trusted from the browser. Tickets are only issued after Paystack confirms the payment, either when the buyer returns to the app or through Paystack's webhook if they do not. The host's share of the money is paid out in Sprint 6; until then all payments go to the Paystack account.

### One-time setup

1. **Database.** In the SQL Editor run [`supabase/006_tickets.sql`](supabase/006_tickets.sql).
2. **Paystack.** Create an account at paystack.com (South Africa). In Settings, API Keys & Webhooks, keep **Test mode** on and copy the **test secret key** (`sk_test_...`).
**Demo payments (for testing, no Paystack needed):** in Supabase, Edge Functions, Secrets, add `PAYMENTS_MODE` with the value `demo` and do not add `PAYSTACK_SECRET_KEY`. Buyers then see a "Demo payment" screen with a Pay button and no real money moves. Remove `PAYMENTS_MODE` before going live; once `PAYSTACK_SECRET_KEY` is set, Paystack is used instead.

3. **Secret.** In Supabase, Edge Functions, Secrets, add `PAYSTACK_SECRET_KEY` with that key. (`APP_URL` is already set from Sprint 4.)
4. **Functions.** Create two Edge Functions, each with its two files:
   - `checkout`: [`index.ts` and `paystack.js`](supabase/functions/checkout/). Keep "Verify JWT" **on**.
   - `paystack-webhook`: [`index.ts` and `paystack.js`](supabase/functions/paystack-webhook/). Turn "Verify JWT" **off**: Paystack cannot sign in, and the function checks Paystack's signature instead.
5. **Webhook address.** In Paystack, Settings, API Keys & Webhooks, set the test **Webhook URL** to `https://tylodszndhehbiedlqjp.supabase.co/functions/v1/paystack-webhook`.

Before taking real money: switch Paystack to live mode (it needs a registered business), replace the secret with the live key (`sk_live_...`) and set the live Webhook URL.

Manual test cases for this sprint are in [docs/sprint-5-test-cases.md](docs/sprint-5-test-cases.md).


## Door scanning (Sprint 6)

1. **Database.** In Supabase, SQL Editor, paste `supabase/007_checkin.sql` and Run.
2. **At the door.** The host opens My events and taps **Scan tickets at the door** under the event. **Start camera** reads each ticket's QR code; the 12-character code under the QR code can be typed instead.

Each ticket gets in once: a second scan shows "Already used" with the time of the first. Only the event's host can check its tickets in, and the check happens in the database. The camera needs the site to be opened over https (GitHub Pages is) and permission to use the camera.

## Boosts (Sprint 7)

1. **Database.** In Supabase, SQL Editor, paste `supabase/008_boosts.sql` and Run.
2. **Functions.** Deploy `checkout` and `paystack-webhook` again with the files in `supabase/functions/` (both `index.ts` files and both copies of `paystack.js` changed).

A host opens My events, taps **Boost this clip** under a live event and chooses 1 day (R50), 3 days (R120) or 7 days (R250). Once paid, the event shows first on Discover, in the feed and in search, marked **Promoted**, until the boost ends; a second boost adds time. Prices are set in `boost_price_cents` in the database script (and shown from `src/boosts/rules.js`; keep the two the same). Boosts use the same payment mode as tickets: demo while `PAYMENTS_MODE = demo`, Paystack once `PAYSTACK_SECRET_KEY` is set.

## Opening the app

The app must be opened through a web address, not by double-clicking `index.html`; browsers block this kind of JavaScript when a file is opened directly.

- **Online:** turn on GitHub Pages for this repository (Settings, then Pages, then deploy from a branch) and open the address GitHub gives you.
- **On your computer:** in this folder run `python -m http.server 8000`, then open `http://localhost:8000`.

## Running the tests

You need Node.js 20 or newer. Nothing has to be installed.

```
npm test
```
