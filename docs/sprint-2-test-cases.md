# Sprint 2 test cases: posting an event and admin review

Before testing, run `supabase/002_events.sql` in the Supabase SQL Editor and make one account an admin (the last lines of that file say how). You need three accounts: a Host, an admin, and a Goer. Record any failure in [defect-log.md](defect-log.md) with "Sprint caused" set to 2.

| ID | Scenario | Steps | Expected result |
|----|----------|-------|-----------------|
| S2-01 | Host menu | Log in as a Host and click your name in the top-right corner. | The menu shows Profile, My events and Log out. A Goer does not see My events. |
| S2-02 | Empty list | As a Host with no events, open My events. | "You have not posted an event yet." and a "Promote an event" button. |
| S2-03 | Clip too long | Promote an event, choose a video longer than 30 seconds. | An error says how many seconds over the limit it is; the event cannot be submitted. |
| S2-04 | Clip accepted | Choose a video of 30 seconds or less. | The file name is shown with its length and "within the 30s limit". |
| S2-05 | Wrong file | Choose a photo or a document instead of a video. | "Use an MP4, WebM or MOV video." |
| S2-06 | Empty form | Press Submit for review with nothing filled in. | Clip, event name, date and time, venue and category each show their own error. |
| S2-07 | Date in the past | Fill in the form with yesterday's date. | "The event must start in the future." |
| S2-08 | Submit an event | Fill in everything correctly and submit. | "Your event is submitted". My events lists it as "In review". In Supabase, Storage, the `clips` bucket has the file in a folder named after the host's account id. |
| S2-09 | Not live before approval | Log out and open Discover. | The new event is not shown. |
| S2-10 | Goer cannot post | As a Goer, open the address ending `#/new-event`. | "Only hosts can post events." |
| S2-11 | Review page is admin only | As the Host, open the address ending `#/review`. | "This page is for admins only." |
| S2-12 | Admin menu and queue | Log in as the admin, click your name, choose Review queue. | The submitted event is listed with its clip, details, host name and the clip's actual length. |
| S2-13 | Reject needs a reason | Press Reject with the reason box empty. | "Give the host a reason for rejecting." The event stays in the queue. |
| S2-14 | Reject | Type a reason and press Reject. | The event leaves the queue. The host's My events shows "Not approved" with the reason. It never appears on Discover. |
| S2-15 | Approve | Submit another event as the Host, then approve it as the admin. | The event leaves the queue. The host's My events shows "Live in feed" with a "View event" link. |
| S2-16 | Live on Discover | Log out and open Discover. | "Upcoming events" shows the approved event with its date, time and venue. The sample events are gone; sample hosts and music remain. |
| S2-17 | Event page | Signed out, click the event; log in when asked. | After logging in, the event page opens with the full clip, name, date, time, venue, host name and description. |
| S2-18 | Times are Johannesburg time | Compare the time on the event page with what the host entered. | They match exactly. |
