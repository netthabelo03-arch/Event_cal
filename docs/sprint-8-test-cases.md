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
| S8-17 | Edit a rejected track | As the Artist, open My music. Under the rejected track tap "Edit and send back". | The form opens with the admin's reason at the top and the track's name, genre and description filled in. |
| S8-18 | Send back, same clip | Change the name and tap "Send back for review" without choosing a clip. | "Your music is sent back for review". My music shows it as "In review" with the new name. |
| S8-19 | Admin sees the history | As the admin, open Review queue. | The track is under Music with a line "Sent back after: <the earlier reason>". |
| S8-20 | Send back with a new clip | Reject it again; as the Artist edit it, choose a new clip (30 seconds or less) and send back. Approve as admin. | The track goes live with the new clip. |
| S8-21 | New clip too long | While editing, choose a clip longer than 30 seconds. | A message says the clip is too long; it cannot be sent. |
| S8-22 | Only rejected tracks | Open the edit address of a track that is live or in review. | A message says it cannot be edited; no form. |
| S8-23 | Only your own | As another Artist, open the edit address of the first Artist's rejected track. | "This track is not yours to edit." |
| S8-24 | Name needed to post | As an Artist with no name in the profile, fill in the form and submit. | A message asks for the artist name first; nothing is sent. |
| S8-25 | Name shows to others (D-007) | Save a name in the profile, post a track, approve it. As a Goer open Discover, the track page and the artist page. | All three show the artist's name. |
| S8-26 | Name change follows | As the Artist change the name in the profile. As a Goer reload Discover. | The track and the artist show the new name. |
| S8-27 | Post a track with audio | As the Artist, Post your music: choose a short video, then under "Your track (audio, optional)" choose an MP3 or M4A. Add a name and genre, submit. | The audio line shows the file name and its length (for example 3:07). The track is submitted; My music shows "audio 3:07 with video". |
| S8-28 | Wrong audio file | Choose a WAV file, or a file over 20 MB or over 10 minutes, as the audio. | A message says what is wrong; the track cannot be submitted. |
| S8-29 | Admin hears it | As the admin, open Review queue. | The track's card has the video and, under "The track (audio)", an audio player with the actual length. Approve it. |
| S8-30 | Player | As a Goer, open the track from Discover. | A player shows the video with a round play button, a progress bar and times. The track starts (or waits for one tap on Play). The video has no sound and no controls of its own. |
| S8-31 | Video loops | Let the track play longer than the video. | The video starts again from its beginning, over and over, while the music carries on without a break. |
| S8-32 | Pause and jump | Tap the button; drag the progress bar. | The music and the video stop together and start together; the music jumps to where the bar was dragged. |
| S8-33 | End and leave | Let the track finish; play again and go back to Discover. | At the end the video stops and the button shows Play. Leaving the page stops the music. |
| S8-34 | Track without audio | Open a track posted with a video only. | The video plays with its own sound and normal controls, as before. |
| S8-35 | Add audio when sending back | Edit a rejected track and choose an audio file. | It is sent back with the new audio; without choosing one, the audio it had is kept. |
