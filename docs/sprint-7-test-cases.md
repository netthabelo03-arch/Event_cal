# Sprint 7 test cases: paid boosts

Before testing, complete the setup in the README section "Boosts (Sprint 7)". Payments are in demo mode, so no real money moves. You need a Host account with at least one live, upcoming event, and at least one other live event (so the order can change). Record any failure in `defect-log.md`.

| ID | Scenario | Steps | Expected result |
|----|----------|-------|-----------------|
| S7-01 | Way in | As the Host, open My events. | Each live, upcoming event shows "Boost this clip". Events in review, rejected or past do not. |
| S7-02 | Choices | Tap it. | Three choices: 1 day · R50.00, 3 days · R120.00, 7 days · R250.00, and Cancel. |
| S7-03 | Demo payment | Tap "3 days". | A line says it is a demo payment with no real money, and a "Pay R120.00 (demo)" button shows. |
| S7-04 | Cancel | Tap Cancel instead of Pay. | Back to "Boost this clip"; the event is not promoted. |
| S7-05 | Pay | Tap Pay. | "Boosted until <date three days from now>" and "Your clip now shows first, marked Promoted." The button becomes "Add more boost days". |
| S7-06 | Discover | Open Discover (signed out works too). | The boosted event is first in the ribbon with a "Promoted" tag, and its card under its category shows "Promoted". |
| S7-07 | Feed | Open the feed. | The boosted event's clip is first and shows "Promoted" above the host name. |
| S7-08 | Search | Open Search with no filters. | The boosted event is first and marked "Promoted". |
| S7-09 | Add days | In My events tap "Add more boost days", choose 1 day and pay. | "Boosted until" moves one day later (four days in total). |
| S7-10 | Stays after reload | Reload My events. | The "Boosted until" chip is still there. |
| S7-11 | Not your event | As a different Host, try to boost the first Host's event (there is no button; this is checked in the database). | No boost button is offered for events that are not yours. |
| S7-12 | Tickets unaffected | As a Goer, buy a ticket for any event. | Buying works as in Sprint 5. |
