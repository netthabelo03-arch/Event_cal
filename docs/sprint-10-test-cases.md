# Sprint 10 test cases: refunds and Host payouts

Before testing: `supabase/017_refunds_payouts.sql` is run and the `checkout` and `paystack-webhook` functions are deployed (done 2026-11-18). Paystack is in **test mode**: use Paystack's test card (choose "Success" in the test options). No real money moves. Record any failure in `defect-log.md`.

| ID | Area | Steps | Expected |
|----|------|-------|----------|
| S10-01 | Booking fee | Open an event with a R100 ticket and choose 1 ticket | Shows "Tickets R100 + booking fee R4.64 = R104.64"; the button says "Buy 1 ticket · R104.64" |
| S10-02 | Booking fee | Pay with the test card | Paystack asks for R104.64. The order screen lists the tickets and a "Booking fee" line |
| S10-03 | Free tickets | Get a free ticket | No booking fee; total is Free |
| S10-04 | Refund rule (new event) | As a Host, Promote an event; under Refunds choose "Until 3 days before" | After approval the event page says "Refunds until 3 days before the event (booking fee not refunded)" |
| S10-05 | Refund rule (existing) | My events → an event with no paid tickets → Change → pick a rule | The line updates. With paid tickets it says "The refund rule cannot change once tickets are sold." |
| S10-06 | Buyer refund | Buy a ticket for an event that allows refunds; My tickets → open the folder → "Cancel this ticket for R100 back" → "Yes, cancel…" | The ticket disappears, "Cancelled. Refund on its way…" shows, and a Refunds section lists it. In Paystack (test) the transaction shows a refund for R100 (not R104.64) |
| S10-07 | Refund window | Same, but for an event with "No refunds", or inside the last 3 days | No cancel button |
| S10-08 | Used ticket | Scan a ticket at the door, then look at My tickets | No cancel button for that order |
| S10-09 | Tickets back on sale | After S10-06, open the event | The sold percentage drops by the refunded tickets |
| S10-10 | Refund finished | Wait for Paystack's refund.processed webhook (test mode: minutes) | Refunds list shows "Refunded" |
| S10-11 | Host cancels | My events → Cancel event → "Yes, cancel and refund everyone" | Shows "The event is cancelled… N orders are being refunded in full." The event leaves Discover; buyers' tickets disappear; each buyer gets their full amount, booking fee included |
| S10-12 | Late payment | Start paying for an event, then the Host cancels it, then finish paying | The order screen says "This event was cancelled" and the payment is refunded in full |
| S10-13 | Bank details | As a Host: My events → "Add bank details" → choose bank, name, account number → Save | "Ticket money will be paid to <bank>, account ending 1234". My events shows the bank and last 4 digits |
| S10-14 | Bad bank details | Enter letters, or too few digits | "Enter your account number: only digits, 6 to 16 of them." |
| S10-15 | Split payment | After S10-13, a Goer buys a R100 ticket | In Paystack → Transactions, the payment shows split to the Host's subaccount: R95 to the Host; plusespot's share R9.64 less Paystack's fee |
| S10-16 | Takings | My events after some sales and a refund | "Sales R… · plusespot 5% R… · yours R… · refunded R…" |
| S10-17 | Not a Host | As a Goer, open `#/payouts` | "Only Hosts get paid for tickets." |
