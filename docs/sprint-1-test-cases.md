# Sprint 1 test cases: accounts and open browsing

Run these on the live app. "Confirm email" must be switched on in Supabase. Record any failure in [defect-log.md](defect-log.md) with "Sprint caused" set to 1.

| ID | Scenario | Steps | Expected result |
|----|----------|-------|-----------------|
| S1-01 | Browse without an account | Open the app signed out. | Discover opens with sample events, hosts and music. The top-right corner shows Sign up and Log in. No log-in is asked for. |
| S1-02 | Clicking an item asks for log-in | Signed out, click any event card. | The log-in screen opens with the heading "Log in to see the details". |
| S1-03 | Return to the item after log-in | Continue from S1-02 and log in with an existing account. | The details of the event that was clicked open, not Discover. |
| S1-04 | Sign up | Signed out, click Sign up. Enter a new email and a strong password (8+ characters with a capital letter, a small letter, a number and a symbol), press Sign up. | "One last step" is shown, saying a link was sent. |
| S1-05 | Confirm email | Open the link in the confirmation email in the same browser. | The app opens signed in: the top-right corner shows the first part of the email address. |
| S1-06 | Sign up from an item | Signed out, click a host card, choose "Create an account" on the log-in screen, sign up, and open the emailed link in the same browser. | After confirming, that host's details open. |
| S1-07 | Empty sign-up form | Press Sign up with nothing filled in. | The email and password boxes each show their own error; no account is created. |
| S1-08 | Weak password | On Sign up, type `password` in the password box and watch the list under it. Press Sign up. Then type `Passw0rd!`. | The list shows which rules are still missing (capital letter, number, symbol) and ticks each one as it is met. Sign up is refused with "Your password is not strong enough yet." until all five are ticked. |
| S1-09 | Email already used | Sign up again with an email that already has an account. | "An account with this email already exists. Sign in instead." |
| S1-10 | Log in before confirming | Sign up with a new email, do not open the link, then try to log in. | "Confirm your email first. Open the link we sent you, then sign in." |
| S1-11 | Wrong password | Log in with the right email and a wrong password. | "Email or password is incorrect." |
| S1-12 | Log in once | Log in, close the browser, open the app again. Click several items. | Still signed in; items open directly with no log-in screen. |
| S1-13 | Profile needs log-in | Signed out, open the address ending `#/profile`. | The log-in screen is shown; after logging in, the profile opens. |
| S1-14 | Add a name | Click the name in the top-right corner, then Profile. Enter your name, Save changes, go back to Discover. | "Saved." appears; the top-right corner now shows your first name. Saving with the name left empty is also accepted. |
| S1-15 | Become a Host or Artist | As a Goer, follow "Switch to Host or Artist" at the bottom of Discover. Choose Host, Save changes, go back. | Discover shows "You are signed in as a Host." and the switch link is gone. |
| S1-16 | Account menu | Click your name in the top-right corner. Click elsewhere, then open it again and press Escape. | The menu opens with Profile and Log out, and closes on an outside click and on Escape. |
| S1-17 | Log out | Click your name, then Log out. | Discover is shown with Sign up and Log in again; clicking an item asks for log-in. |
| S1-18 | Forgot password | Log in screen, Forgot password?, enter the email, Send reset link. Open the emailed link in the same browser, enter a new password, Save. | The same confirmation message appears for any email. The link opens "Choose a new password"; after saving, Discover opens signed in and the new password works. |
| S1-19 | Moving panel on big screens | Signed out on a computer, open Log in with the window wide, then narrow it to phone width. | Wide: the moving green panel takes the larger left side and the form sits in a rounded panel on the right. Narrow: only the form shows. Discover never shows the panel. |
| S1-20 | Own data only | In Supabase, Table Editor, open `profiles`. | One row per account, each with role `goer` unless changed in the profile. |
| S1-21 | Strong password on reset | In the forgot-password flow, try to save `password1` as the new password. | It is refused and the checklist shows what is missing; a strong password is accepted. |
| S1-22 | Old passwords still work | Log in with an account created before this rule, whose password is weaker. | Log-in works; the rule only applies to new passwords. |
