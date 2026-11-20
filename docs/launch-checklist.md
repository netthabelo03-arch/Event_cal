# plusespot launch checklist

Everything here must be done, or decided, before real users are invited. Tick each line as it is finished. "Owner" is who can do it: **You** (it needs your accounts, keys or decisions) or **Claude** (code).

## Must do: money

| # | Item | Why | Owner | Done |
|---|------|-----|-------|------|
| 1 | Add `PAYSTACK_SECRET_KEY` (live key) in Supabase, Edge Functions, Secrets | Without it no real payment can be taken | You | ☐ |
| 2 | **Delete** the `PAYMENTS_MODE` secret | While it says `demo` and there is no Paystack key, anyone gets tickets and boosts without paying | You | ☐ |
| 3 | Turn "Verify JWT" off for `paystack-webhook` and set the webhook URL in Paystack (live) | Paystack must be able to tell the app a payment went through | You | ☐ |
| 4 | Decide the refund policy and how Hosts are paid out; build payouts and refunds | Built in Sprint 10 (Host picks the refund window; Paystack split pays Hosts; buyer pays the booking fee). Test with `docs/sprint-10-test-cases.md` | You, then Claude | ☑ |
| 4a | Decide who covers refunds when a Host has already been paid: Paystack takes refunds from plusespot's balance, not the Host's | A cancelled event after payout means plusespot pays buyers back out of its own money | You | ☐ |
| 4b | Update the Terms with the refund rules, the 5% commission and the booking fee | Buyers and Hosts must be told | You, then Claude | ☐ |
| 5 | Confirm the boost prices (now R50, R120, R250) | They are placeholders | You | ☐ |
| 5a | Tell Hosts that sales stop at 90% of the tickets they offer | They may want to offer more tickets to sell the number they need | You | ☐ |
| 6 | Make one real R5 purchase and one boost end to end, then refund them | Proves the live keys and the webhook | You | ☐ |

## Must do: reminders

| # | Item | Why | Owner | Done |
|---|------|-----|-------|------|
| 7 | Fix D-006: add the Vault entry named `secret_key`; delete the wrongly named entry | Phone reminders are not being sent | You | ☑ |
| 8 | Turn "Verify JWT" off for `send-reminders`; check the 5-minute job gets a 200 answer | Same | You, Claude checks | ☑ |
| 9 | Set up a sending domain and switch on email reminders | The email a day before is part of the product | You, then Claude | ☐ |

## Must do: legal

| # | Item | Why | Owner | Done |
|---|------|-----|-------|------|
| 10 | Have a lawyer review the Terms and Privacy pages; fill in every [bracketed] detail | The wording in the app is a draft, not legal advice | You | ☐ |
| 11 | Decide who is the responsible party under POPIA and register an Information Officer | Required for handling personal information in South Africa | You | ☐ |
| 12 | Add a contact email to the Terms and Privacy pages | People must be able to reach you about their data | You, then Claude | ☐ |
| 13 | Decide the minimum age and the rule for music rights | Both pages have a placeholder | You | ☐ |

## Must do: testing

| # | Item | Owner | Done |
|---|------|-------|------|
| 14 | Run every case in `docs/sprint-4-test-cases.md` to `docs/sprint-9-test-cases.md` on a real phone (Android and iPhone) | You | ☐ |
| 15 | Close every defect in `docs/defect-log.md` (open now: D-006; to retest: D-007, D-008) | You, Claude | ☐ |
| 16 | Test door scanning with a real camera at a real door, on weak signal | You | ☐ |

## Must do: accounts and safety

| # | Item | Why | Owner | Done |
|---|------|-----|-------|------|
| 17 | Decide who the admins are and add them to the `admins` table | They approve content and answer disputes within 24 hours | You | ☐ |
| 18 | Agree who watches the Review queue each day (reports, disputes, new content) | A dispute promises an answer within 24 hours | You | ☐ |
| 19 | Switch on leaked-password protection and review sign-up limits in Supabase, Authentication | Protects accounts | You | ☐ |
| 20 | Replace or remove the sample events and sample music on Discover once there are enough real ones | They are placeholders | Claude | ☐ |

## Should do

| # | Item | Owner | Done |
|---|------|-------|------|
| 21 | A proper web address (domain) instead of the GitHub Pages address | You | ☐ |
| 22 | Switch buttons and highlights to the logo's lime colour (tried 17 Nov; you chose to stay green) | Claude | n/a |
| 23 | Trending grid ranked by views and tickets sold (backlog B-001) | Claude | ☑ Sprint 11 |
| 24 | Let Hosts edit a rejected event and send it back, as Artists can | Claude | ☑ Sprint 11 |
| 25 | Tell the Artist by notification when a dispute is answered | Claude | ☑ Sprint 11 |
| 26 | Update the demo deck: new name, logo and the features added since | Claude | ☐ |
| 27 | Feed text and highlights take the colours of the clip behind them | Claude | ☑ Sprint 11 |
| 28 | Run `docs/sprint-11-test-cases.md` on real phones | You | ☐ |
