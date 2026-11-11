# Sprint 1 test cases: accounts

Run these on the live app after the database setup script has been run. Record any failure in [defect-log.md](defect-log.md) with "Sprint caused" set to 1.

| ID | Scenario | Steps | Expected result |
|----|----------|-------|-----------------|
| S1-01 | Sign up as a Goer | Welcome, choose Goer, Continue. Fill in name, a new email, a password of 8+ characters, tick the box, Create account. | "Check your email" is shown (or the home screen opens, if email confirmation is switched off). |
| S1-02 | Confirm email | Open the link in the confirmation email in the same browser. | The app opens on the home screen: "Welcome, <first name>." with the Goer label. |
| S1-03 | Sign up as a Host | Repeat S1-01 choosing Host, with another email. | After confirming, the home screen shows the Host label and "Posting an event arrives in Sprint 2." |
| S1-04 | Sign up as an Artist | Repeat S1-01 choosing Artist, with another email. | After confirming, the home screen shows the Artist label. |
| S1-05 | Empty sign-up form | Press Create account with nothing filled in. | Each field shows its own error; no account is created. |
| S1-06 | Short password | Sign up with a 7-character password. | "Use at least 8 characters for your password." |
| S1-07 | Email already used | Sign up again with the email from S1-01. | "An account with this email already exists. Sign in instead." |
| S1-08 | Sign in | Sign in with the S1-01 email and password. | The home screen opens. |
| S1-09 | Wrong password | Sign in with the right email and a wrong password. | "Email or password is incorrect." |
| S1-10 | Stay signed in | While signed in, close the tab and open the app again. | The home screen opens without asking to sign in. |
| S1-11 | Protected screens | While signed out, open the address ending `#/profile`. | The sign-in screen is shown instead. |
| S1-12 | Change name and role | On home, click your name in the top-right corner, then Profile. Change the name, pick another role, Save changes. Go back to home. | "Saved." appears; the name in the top-right corner and on home show the change, with the new role. |
| S1-13 | Log out | Click your name in the top-right corner, then Log out. | The sign-in screen is shown; the address ending `#/home` no longer opens home. |
| S1-16 | Account menu | On home, click your name in the top-right corner. Click elsewhere on the page, then open it again and press Escape. | The menu opens with Profile and Log out, and closes on an outside click and on Escape. |
| S1-14 | Forgot password | Sign in screen, Forgot password?, enter the email, Send reset link. Open the emailed link in the same browser. Enter a new password, Save. | The same confirmation message appears for any email. The link opens "Choose a new password"; after saving, home opens and the new password works for sign-in. |
| S1-15 | Own data only | Signed in as account A, there is no way to see or change account B's profile. In Supabase, Table Editor, `profiles` shows one row per account with the right role. | Rows exist for each account; roles match what was chosen. |
| S1-17 | Moving panel on big screens | Signed out, open the app on a computer with the window wide. Then narrow the window to phone width. Then sign in. | Wide: a moving green panel with "Never miss what's on." sits left of the form. Narrow: the panel is gone and only the form shows. Signed in: no panel on home or profile. |
