# Sprint 4 test cases: reminders

Before testing, complete the setup in the README section "Reminders (Sprint 4)". For the timed tests, create an event that starts about 23 hours from now, and another that starts about 90 minutes from now, and have an admin approve both. Record any failure in [defect-log.md](defect-log.md) with "Sprint caused" set to 4.

| ID | Scenario | Steps | Expected result |
|----|----------|-------|-----------------|
| S4-01 | Remind me | As a Goer, open a live upcoming event and press Remind me. | The button changes to "Remove reminder" and says "Reminder set. We will email you 1 day before the event." A phone-notification box appears. |
| S4-02 | Remove reminder | Press Remove reminder. | The button goes back to "Remind me" and the phone-notification box disappears. |
| S4-03 | My reminders | Set reminders on two events. Click your name, then My reminders. | Both events are listed, soonest first, each with a Remove button. |
| S4-04 | Remove from the list | On My reminders, press Remove on one event. | It disappears; the event page shows "Remind me" again. |
| S4-05 | Empty list | Remove all reminders. | "No reminders yet. Tap "Remind me" on any event and it shows here." |
| S4-06 | Phone notifications on (Android) | On an Android phone in Chrome, press "Turn on phone notifications" and allow. | The box says phone notifications are on for this device. In Supabase, `push_subscriptions` has a row for you. |
| S4-07 | iPhone needs the home screen | On an iPhone in Safari, open an event and set a reminder. | The box explains to add the app to the home screen first. After adding it and opening it from the home screen, the button appears. |
| S4-08 | Notifications refused | Press "Turn on phone notifications" and choose Block. | "Notifications were not allowed. You will still get the email." |
| S4-09 | Email a day before | Set a reminder on the event starting in about 23 hours. Wait up to 5 minutes. | An email arrives from your domain with the event's name, date and time (Johannesburg), venue, host and a "See the event" button. My reminders shows "Email sent". |
| S4-10 | Email link | Press "See the event" in the email. | The app opens on that event (log in if asked). |
| S4-11 | Phone notification 2 hours before | With phone notifications on, set a reminder on the event starting in about 90 minutes. Wait up to 5 minutes. | The email arrives and a phone notification "<event> starts soon" appears. My reminders shows both as sent. |
| S4-12 | Tap the notification | Tap the phone notification. | The app opens on that event. |
| S4-13 | Nothing twice | Wait another 10 minutes. | No second email or notification for the same event. |
| S4-14 | Turn notifications off | On My reminders, press "Turn off phone notifications". | The box offers to turn them on again; the device's row disappears from `push_subscriptions`. |
| S4-15 | Own reminders only | In Supabase, Table Editor, open `reminders`. | Each row belongs to the person who set it; no one can see another person's reminders in the app. |
