# Sprint 9 test cases: legal pages, reporting, error states

Before testing, run `supabase/014_reports.sql` (README, "Launch readiness (Sprint 9)"). You need a Goer, a Host with a live event, an Artist with a live track and an admin. Record any failure in `defect-log.md`.

| ID | Scenario | Steps | Expected result |
|----|----------|-------|-----------------|
| S9-01 | Terms, signed out | Signed out, scroll to the foot of Discover and tap Terms. | "Terms of use" opens without asking to log in, with a notice that the wording is a draft still to be reviewed by a lawyer. |
| S9-02 | Privacy | From Terms tap Privacy (or from the foot of Discover). | "Privacy" opens; it names POPIA, what is collected and how to ask for a copy or deletion. |
| S9-03 | Sign-up links | Open Sign up and tap Terms, then Privacy Policy, in the line under the button. | Each opens the right page. |
| S9-04 | Report an event | As the Goer open a live event, tap "Report this event", choose "Scam or fake", tap Send report. | "Thank you. Your report was sent and our team will look at it." |
| S9-05 | Reason needed | Open the report form and tap Send report with nothing chosen; then choose "Something else" with no detail. | "Choose what is wrong."; then a message asking for more detail. Nothing is sent. |
| S9-06 | Report twice | Reload the event and report it again. | "You have already reported this. Our team will look at it." |
| S9-07 | Not your own | As the Host open your own event; as the Artist open your own track. | There is no Report link. |
| S9-08 | Report a track | As the Goer open a live track and report it as "Uses someone else's work" with a sentence of detail. | The thank-you message. |
| S9-09 | Admin sees reports | As the admin open Review queue. | A "Reports" section lists each reported item once, with its clip, who posted it, how many reports, the reasons and any detail. |
| S9-10 | Dismiss | Tap Dismiss on the track's report. | The card goes at once; the track stays live. The Goer can report it again later. |
| S9-11 | Take it down | Tap Take it down on the event's report. | The card goes at once; the event leaves Discover, the feed and search. In the Host's My events it is "Not approved" with "Taken down after a report…". |
| S9-12 | Several reports, one card | Have two Goers report the same item. | The admin sees one card saying "2 reports"; one action closes both. |
| S9-13 | Offline bar | Switch the phone to flight mode with the app open. | A yellow bar says "You are offline…". It goes when the connection is back. |
| S9-14 | Screen fails to load | In flight mode tap an event. | "This screen could not be shown", "You are offline…", a "Try again" button and "Back to Discover". Back online, Try again shows the event. |
| S9-15 | Events fail to load | Open Discover while the connection drops (or block the Supabase address). | A red message says events could not be loaded and that the items below are samples. |
| S9-16 | Everything else still works | Buy a ticket, set a reminder, approve an event and a track. | As in earlier sprints. |
