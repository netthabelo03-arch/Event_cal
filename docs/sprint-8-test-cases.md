# Sprint 8 test cases: artists and music

Before testing, run `supabase/009_tracks.sql` (README, "Music (Sprint 8)"). You need an Artist account (switch role in Profile and add a name), an admin account and a Goer account, plus a video clip of 30 seconds or less and one longer than 30 seconds. Record any failure in `defect-log.md`.

| ID | Scenario | Steps | Expected result |
|----|----------|-------|-----------------|
| S8-01 | Way in | As the Artist, open the account menu. | "My music" is listed. A Goer or Host does not see it. |
| S8-02 | Empty list | Open My music. | "Nothing posted yet" and a "Post your music" button. |
| S8-03 | Not an artist | As a Goer, open the My music address. | "Only artists can post music." with a link to the profile. |
| S8-04 | Form checks | Tap Post your music and submit the empty form. | Messages ask for a clip, a track name and a genre; nothing is sent. |
| S8-05 | Clip too long | Choose the clip longer than 30 seconds. | A message says the clip is too long; it cannot be submitted. |
| S8-06 | Post a track | Choose the short clip, enter a name, pick a genre, submit. | "Your music is submitted". My music lists it as "In review". |
| S8-07 | Not public yet | As the Goer, open Discover. | The track is not shown. |
| S8-08 | Review | As the admin, open Review queue. | The track is under "Music" with its clip, genre, artist name and actual length. |
| S8-09 | Reject needs a reason | Tap Reject with no reason. | "Give the artist a reason for rejecting." Nothing changes. |
| S8-10 | Approve | Tap Approve. | The card goes; the count drops by one. |
| S8-11 | Discover | As the Goer, open Discover. | "New music" shows the track (title, artist, genre) and "Artists" shows the artist. The sample music is gone. |
| S8-12 | Track page | Tap the track. | The full clip plays (at most 30 seconds); the page shows the genre, title, "By <artist>" and the play count. |
| S8-13 | Plays | As the Artist, open My music. | The track says "Live in New music" and shows 1 play (the Goer's). The artist's own visits are not counted. |
| S8-14 | Artist page | From the track page tap the artist's name. | The artist's page lists their live tracks. |
| S8-15 | Rejected track | Post a second track; as admin reject it with a reason. | My music shows "Not approved" and the reason. It never appears on Discover. |
| S8-16 | Events unaffected | As the admin, review a new event; as a Goer, open an event. | Works as before. |
