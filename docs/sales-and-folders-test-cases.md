# Test cases: tickets sold as a percentage (sold out at 90%), sales notices, ticket folders

Before testing, run `supabase/015_sales_limit.sql` and deploy the updated `send-reminders` function (README, "Tickets: percentage sold and folders"). Sales notices go out by phone notification, so D-006 must be fixed first (the Vault `secret_key` entry). Record any failure in `defect-log.md`.

| ID | Scenario | Steps | Expected result |
|----|----------|-------|-----------------|
| PS-01 | Percentage shown | Open an event with tickets, for example Rambo (7 General, 3 sold). | Under General: a green bar and "42% sold" instead of "4 left". |
| PS-02 | Stops at 90% | With 50 tickets offered, buy until 45 are sold. | At 44 sold it shows "88% sold" with 1 left to buy. At 45 it shows "Sold out" in red and + does nothing. |
| PS-03 | The last 10% cannot be bought | Try to buy one more ticket than the 90% allows (for example from a page opened before it sold out). | "Sorry, there are not enough of those tickets left…"; nothing is charged. |
| PS-04 | Small numbers | Offer 1 ticket. | It can be bought; then it shows "Sold out". |
| PS-05 | My reminders | Set a reminder on an event with tickets; open My reminders. | The event shows "N% of tickets sold" (or "Sold out"). |
| PS-06 | Notice at 50% | With a reminder set and phone notifications on, let the event pass 50% sold. Wait up to 5 minutes. | A notification: "<Event>: 50% of tickets sold — Get your ticket before it sells out at 90%." |
| PS-07 | Ticket holder's wording | Hold a ticket for that event with notifications on. | "<Event>: 50% of tickets sold — Your ticket is safe in My tickets…" |
| PS-08 | 75% and sold out | Let the event pass 75%, then sell out. | One notice at 75% and one "<Event> is sold out", each once only. |
| PS-09 | Once per person | Hold two tickets and a reminder for the same event. | One notice per milestone, not three. |
| PS-10 | No notice for quiet events | An event at 20% sold. | No notice. |
| TF-01 | One folder per event | Hold tickets for two events; open My tickets. | Each event is a folder showing its name, date, venue, "N tickets" and how much is sold. Tickets for different events never appear together. |
| TF-02 | Next event open | Open My tickets. | The folder for the soonest event is open; the others are closed. Tap a folder to open or close it. |
| TF-03 | Inside a folder | Open a folder. | Each ticket says "Ticket 1 of 2" with its type, QR code and code; used tickets say "Used at the door". A link opens the event. |
| TF-04 | Straight to the right folder | Buy tickets and tap "See my tickets" on "You're going!". | My tickets opens with that event's folder open. |
| TF-05 | Past events | Hold a ticket for an event that has finished. | Its folder is under "Past events", closed, without a QR code. |
