# Sprint 11 test cases: Trending, sending an event back, dispute answers, clip colours

Before testing: `supabase/018_trending_resubmit_notice.sql` is run (dry run passed, 9 checks) and `send-reminders` is redeployed (done 2026-11-20). Test on a phone (Android and iPhone) and on a computer. Record any failure in `defect-log.md`.

## Feed text in the clip's colours

| ID | Steps | Expected |
|----|-------|----------|
| S11-01 | Open the Feed on a phone | Within about a second of a clip showing, the Host's name, the "Tap for details" line and the Promoted label take a colour from the clip (blue clip → blue, red clip → red). The fade under the words is a very dark shade of the clip, not plain black |
| S11-02 | Swipe to a clip of another colour | The colours glide to the new clip's colours (no jump, no flicker) |
| S11-03 | A clip that is mostly grey, black or white | The words use the plusespot green; still readable |
| S11-04 | A clip whose bottom half is bright (sky, white wall) | The fade under the words gets stronger; the white title stays easy to read |
| S11-05 | A track with a video (Music → a track) | The play button and the small caption take the video's colour too |
| S11-06 | Phone set to reduce motion | Colours change without the glide |

## Trending this week

| ID | Steps | Expected |
|----|-------|----------|
| S11-07 | Discover, while fewer than 3 live events had views or ticket sales in the last 7 days | No Trending section |
| S11-08 | Open 3 or more different live events (each open counts a view), then reload Discover | "Trending this week" shows a grid, numbered 1, 2, 3…, each with "N views this week" |
| S11-09 | Buy a ticket for one of them | After reload it moves up: one ticket counts as much as 10 views; it shows "1 ticket this week" |
| S11-10 | An event that has started | It is no longer in Trending |
| S11-11 | Boost an event | Its Trending place does not change (boosts show in the ribbon and feed, as Promoted) |
| S11-12 | Signed out | Trending shows the same |

## Hosts send a rejected event back

| ID | Steps | Expected |
|----|-------|----------|
| S11-13 | As admin, reject an event with a reason | In the Host's My events: "Not approved", the reason, and "Edit and send back" |
| S11-14 | Tap Edit and send back | The form opens filled in: name, date, time (Johannesburg time), venue, category, description, tickets and refund rule; the reason shows at the top |
| S11-15 | Change the name and a ticket price, keep the clip, Send back for review | "Your event is sent back for review". My events shows "In review" with the new name. The admin queue shows it with the new details and tickets |
| S11-16 | Choose a new clip over 30 seconds | The same clip error as when posting |
| S11-17 | Set a date in the past | "The event must start in the future." |
| S11-18 | Open `#/edit-event/<id>` of a live event, or another Host's event | "This event is live…" / "This event is not yours to edit." |

## Dispute answers

| ID | Steps | Expected |
|----|-------|----------|
| S11-19 | As an Artist with phone notifications on, file a dispute; as admin, Take down | Within 5 minutes the Artist's phone shows "Dispute PS-… answered: We took "<track>" down so you can correct it…"; tapping it opens My music |
| S11-20 | File another; as admin, Keep with a note | The notification says "<track> stays live." and the note |
| S11-21 | Wait another 10 minutes | No second notification for the same dispute |
| S11-22 | After email is set up | The same answer arrives by email too |

## Faster event upload (after Sprint 11)

| # | Steps | Expected |
|---|---|---|
| U-1 | New event → choose a valid clip | Under the clip: a progress bar and "Uploading your clip… N% of X MB. Keep filling in the form." |
| U-2 | Keep filling in the form while it uploads | The form works normally; the bar fills up to "Clip uploaded." |
| U-3 | Submit after the clip says "Clip uploaded." | The event is saved within a moment ("Sending…"), with no wait for the video. |
| U-4 | Submit while the clip is still uploading | The button shows "Finishing the clip upload… N%", then saves on its own. |
| U-5 | Turn data off mid-upload, then back on | "The connection dropped. Trying the upload again…"; after 3 failed tries, "Try the upload again" shows and works. |
| U-6 | Choose a clip, then choose a different one | The first upload stops; only the second one uploads and is used. |
| U-7 | Edit and send back with a new clip | Same as U-1 to U-4. Without a new clip, no upload happens. |
## Feed: 10-second clips and a Music section (after Sprint 11)

| # | Steps | Expected |
|---|---|---|
| F-1 | Open the feed | Tabs "Events | Music" at the top, Events selected. Each event clip plays 10 seconds, then the next. A hint says "Swipe left for Music". |
| F-2 | Swipe left | Music opens (address `#/feed/music`); event clips stop; artists' tracks play their picture, 10 seconds each. |
| F-3 | Tap "Tap for sound" | The track's music plays (its audio, or the video's own sound if it has no audio). The button reads "Sound on". Sound stays on from track to track. |
| F-4 | Swipe right, or tap "Events" | Back on Events; the music stops. |
| F-5 | Tap a track | Its page opens with the full track (sign-in asked if signed out). |
| F-6 | Open `#/feed/music` directly | The feed opens on Music. |
| F-7 | No approved tracks | Music shows "No music yet". |
| F-8 | On a computer | Left and right arrow keys switch sections. |
| F-9 | Discover rows | Card previews still change every 5 seconds. |
