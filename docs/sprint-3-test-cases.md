# Sprint 3 test cases: the feed, search, host pages and views

Before testing, run `supabase/003_views.sql` in the Supabase SQL Editor. You need at least three live (approved) events, from at least two hosts, on different days. Record any failure in [defect-log.md](defect-log.md) with "Sprint caused" set to 3.

| ID | Scenario | Steps | Expected result |
|----|----------|-------|-----------------|
| S3-01 | Buttons on Discover | Open Discover signed out. | "Watch the feed" and "Search events" buttons sit under the heading. The top bar has a search button. |
| S3-02 | Feed opens | Press Watch the feed. | Live events fill the screen one at a time, each with host, name, date, time and venue. Signed out is fine. |
| S3-03 | Feed moves by itself | Watch without touching. | Each clip plays muted for 5 seconds, then the feed slides to the next. After the last it goes back to the first. |
| S3-04 | Feed by hand | Swipe or scroll up and down. | Each clip snaps into place and the one on screen plays. |
| S3-05 | Feed to event | Tap a clip in the feed (log in if asked). | The event's page opens and its full clip plays. |
| S3-06 | Leaving the feed | Press the back arrow at top left. | Discover opens and the feed's sound and video stop. |
| S3-07 | Search by words | Open Search, type part of an event name, a venue or a host name. | Matching events appear after a moment; "N events found" is shown. |
| S3-08 | Search with odd characters | Type `jazz, ( % *` into Search. | No error; the search treats it as plain words. |
| S3-09 | Category filter | Choose Music, then Business. | Only events of that category are shown. |
| S3-10 | Date filters | Try Today, This weekend and Next 7 days. | Only events in that window are shown, judged by Johannesburg time. |
| S3-11 | Nothing found | Search for a word no event has. | "No events match. Try fewer words or another date." |
| S3-12 | Real hosts on Discover | Look at "Popular hosts" on Discover. | The real hosts of live events, busiest first, with "N upcoming events". No sample hosts. |
| S3-13 | Host page | Click a host (log in if asked). | The host's page shows their name and all their upcoming events. |
| S3-14 | Host link on an event | On an event page, click the host's name. | That host's page opens. |
| S3-15 | Views counted | As a Goer, open an event page. Then, as its host, open My events. | The event shows "1 view". |
| S3-16 | One view a day per device | As the same Goer, open the same event again. | The host still sees the same count. |
| S3-17 | Host's own visits not counted | As the host, open your own live event's page, then My events. | The count does not go up. |
| S3-18 | Full-screen feed, nothing cut | Open the feed on a phone held upright with (a) a clip filmed upright and (b) a clip filmed sideways. Then open it on a computer. | (a) The clip fills the screen. (b) The whole clip is shown, centred, with a blurred copy of it filling the space above and below; no words in the clip are cut. Computer: a phone-shaped column in the middle. |
| S3-19 | Filming tip | Open Promote an event. | Under "Promo video" a tip suggests filming upright so the clip fills the screen. |
