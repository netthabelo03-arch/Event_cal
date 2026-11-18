# Defect log

One row per defect. "Sprint found" is when it was noticed; "Sprint caused" is the sprint whose code was at fault.

| ID | Date | Sprint found | Sprint caused | Screen or feature | What happened | What should happen | Severity | Status |
|----|------|--------------|---------------|-------------------|---------------|--------------------|----------|--------|
| D-001 | 2026-11-11 | 1 | 1 | Email and password boxes | When the browser fills in a saved email, the box turns pale blue | The box keeps the dark theme | Low | Fixed |
| D-002 | 2026-11-12 | 2 | 0 | Updating the live app | After an update, the live site kept showing the previous version (Discover still said "Posting an event arrives in Sprint 2"). Cause: GitHub Pages was publishing from an older branch instead of `gh-pages`; the browser cache also held old files. | A new version shows on the next visit | Medium | Retested |
| D-003 | 2026-11-12 | 3 | 1 | Layout on phones | On a phone, items overlapped (reported on the live app after Sprint 3) | Nothing overlaps on a phone-sized screen | Medium | Retested |
| D-004 | 2026-11-12 | 3 | 3 | Feed | Clips filmed sideways (landscape) were cut at the sides on phones, losing words inside the video | The whole clip is shown, centred, with a blurred copy of it filling the rest of the screen | Medium | Retested |
| D-005 | 2026-11-13 | 5 | 5 | Event page, Tickets | No Buy button on an event posted before Sprint 5: it has no ticket types, and hosts could only add tickets while creating an event | Hosts can add tickets to an upcoming event from My events ("Add tickets"); the Buy button then shows | High | Retested |
| D-006 | 2026-11-13 | 4 | 4 (setup) | Phone reminders, scheduled sending | The 5-minute reminder job runs but the send-reminders function answers 401 "No credentials found": the Vault has no entry named `secret_key` (a key was pasted into the Name box instead), so no reminders are sent | The Vault has an entry named `secret_key` holding the Supabase secret key, and the job gets a 200 answer | High | Fixed 2026-11-18: entry `secret_key` added; the 22:00 run answered 200 |
| D-007 | 2026-11-14 | 8 | 8 | Track page, Discover, artist page | A track posted before the artist saved a name shows no artist to other people ("an artist"), even after the name is saved in the profile | The name on a track or event follows the profile: taken from it when posting and updated when the profile's name changes; posting music needs a name | High | Fixed |
| D-008 | 2026-11-16 | 8 | 8 | Review queue, Disputes | After the approver actions a dispute, things about it stay on the approver's screen until a reload: the empty "Disputes" heading, and the track's own card under Music if it was still in review when it was taken down | Once a dispute is actioned, the dispute, its heading (if it was the last) and any card for that track leave the approver's screen at once | Medium | Fixed |
| D-009 | 2026-11-18 | 9 | 9 | Event page, Tickets | Rambo showed "71% sold" and let the buyer press +, but buying failed with "sold out": the last sellable ticket was held by an unfinished checkout (the buyer's own abandoned Paystack page), which the page did not know about | Starting a new order releases the buyer's own unfinished checkouts for that event; tickets held by other people's checkouts cannot be chosen, and the page says they come back within 30 minutes | High | Fixed |

Severity: Critical (app unusable or money wrong), High (feature broken), Medium (works with a workaround), Low (cosmetic).
Status: Open, In progress, Fixed, Retested, Closed.
