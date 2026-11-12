# Sprint 5 test cases: tickets

Before testing, complete the setup in the README section "Tickets (Sprint 5)". Use Paystack's **test** keys and test cards (listed on Paystack's "Test payments" page); no real money moves. Record any failure in [defect-log.md](defect-log.md) with "Sprint caused" set to 5.

| ID | Scenario | Steps | Expected result |
|----|----------|-------|-----------------|
| S5-01 | Host sets ticket types | As a Host, Promote an event. Under Tickets keep "General", price 150, how many 200. Add "VIP", 350, 3. Submit, then approve as admin. | The event is submitted. My events shows "0 of 203 tickets taken" once it is live. |
| S5-02 | Ticket form checks | On the form, enter price "abc", or leave "How many" empty, and submit. | That ticket row shows what is wrong; nothing is submitted. |
| S5-03 | Event without tickets | Remove every ticket row and submit another event. | It is accepted; its page has no Tickets box but still has Remind me. |
| S5-04 | Tickets box | As a Goer, open the approved event. | A Tickets box lists General R150 and VIP R350 "3 left", each with - and + buttons. |
| S5-05 | Choosing tickets | Press + twice on General and once on VIP. | The total shows R650 and the button reads "Buy 3 tickets · R650". |
| S5-06 | Limits | Press + on VIP until it stops; then try to go past 10 tickets in all. | VIP stops at 3; the + buttons stop when the order reaches 10 tickets. |
| S5-07 | Pay with a test card | Press Buy. On Paystack's page, pay with a successful test card. | Paystack sends you back to the app: "Confirming your payment…", then "You're going!" within a few seconds. |
| S5-08 | My tickets | Press "See my tickets" (or click your name, then My tickets). | One ticket per seat bought, each with a QR code, a 12-character code, the event and the ticket type. |
| S5-09 | Payment cancelled | Start buying, then close or cancel Paystack's page. Open the order again from the browser history, or wait. | No tickets are issued; the order stays waiting and nothing is charged. |
| S5-10 | Declined card | Pay with a test card that Paystack says will be declined. | No tickets are issued. |
| S5-11 | Webhook | Buy tickets, and close the browser tab while still on Paystack's success page (before returning to the app). Open My tickets a minute later. | The tickets are there: Paystack told the app directly. |
| S5-12 | Sold out | Buy the last VIP tickets, then open the event as another Goer. | VIP shows "Sold out" and cannot be chosen. |
| S5-13 | Free tickets | Create an event with a ticket priced 0. As a Goer choose 2 and press "Get 2 free tickets". | No payment page; the order is confirmed at once and the tickets appear in My tickets. |
| S5-14 | Host sees sales | As the host, open My events. | The event shows how many tickets are taken out of the total. |
| S5-15 | Own tickets only | As another Goer, open the order address from S5-07. | "Order not found". |
