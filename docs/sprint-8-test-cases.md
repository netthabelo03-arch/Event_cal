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
| S8-36 | Way in to a dispute | As the Artist, open My music. | A live or in-review track shows "Wrong track? File a dispute". A track that was not approved does not (it has "Edit and send back"). |
| S8-37 | Reason needed | Tap it and tap File dispute with nothing typed, then with "wrong". | A message asks what is wrong, then for more detail; nothing is filed. |
| S8-38 | File a dispute | Type a reason of a sentence and tap File dispute. | "Dispute lodged. Your ticket number is PS-<today's date as YYYYMMDD>-<number>, for example PS-20261114-0001. We will get back to you within 24 hours, by <day and time 24 hours from now>." |
| S8-39 | Shows in My music | Reload My music. | The track shows "Dispute PS-… open · reply by <time>". The dispute button is gone (one open dispute per track). |
| S8-40 | Admin sees it first | As the admin, open Review queue. | "Disputes" is the first section: ticket number, track, artist, the reason, "Reply by <time>", the video and audio to play. |
| S8-41 | Keep needs a note | Tap Keep the track with no note. | "Tell the artist why the track is being kept." Nothing changes. |
| S8-42 | Take the track down | Tap Take the track down. | The card goes. On Discover the track is gone. |
| S8-43 | Artist corrects it | As the Artist, open My music. | The track is "Not approved" with "Taken down at your request (dispute PS-…)", shows "Dispute PS-… · track taken down", and has "Edit and send back". Edit it with the right files and send it back. |
| S8-44 | Keep the track | File a dispute on another track; as admin type a note and tap Keep the track. | The track stays live. My music shows "Dispute PS-… · track kept" and "Our answer: <the note>". The artist can file a new dispute. |
| S8-45 | Overdue | (Admin) Leave a dispute open past its reply-by time. | In the Review queue it reads "Overdue: reply was due <time>" in red. |
| S8-46 | Only your own | As another Artist, there is no dispute button on tracks that are not yours (checked in the database too). | No way to dispute someone else's track. |
| S8-47 | Actioned dispute leaves the approver's screen (D-008) | As the Artist post a track and, before it is approved, file a dispute on it. As the admin open Review queue: the dispute is under Disputes and the track under Music. Tap Take the track down. | At once, with no reload: the dispute card and the "Disputes" heading are gone, the track's card under Music is gone, and the count drops by two. |
| S8-48 | Kept dispute leaves too | File a dispute on a live track; as the admin add a note and tap Keep the track. | The dispute card goes at once; if it was the only one the "Disputes" heading goes too. Reloading does not bring it back. |
| S8-49 | Track fills the phone screen | On a phone, open a track from Discover. | The video fills the whole screen like the feed (shown whole over a blurred copy), with a round back button top left, and the genre, track name, "By <artist>", Play, the progress bar and times over it. The top bar is not shown. Scrolling down shows plays, Up next, the description and Report. |
| S8-50 | Bigger screens | Open the same track on a computer. | The player is a tall frame with the same name and controls over the video; the top bar and "Back to Discover" are shown. |
| S8-51 | Next track, same artist | Play a track by an artist who has another live track, and let it end. | The artist's other track opens and starts by itself. "Up next" under the player named it beforehand. |
| S8-52 | Next track, same genre | Play a track by an artist with no other tracks, where another artist has a track in the same genre. | That same-genre track plays next. |
| S8-53 | Skip | Tap the Next button to the right of Play. | The "Up next" track opens and plays. |
| S8-54 | No repeats until all are played | Let several tracks play through. | No track comes round again until every live track has been played once in this visit. |
| S8-55 | Only one track | With a single live track, play it to the end. | It stops and goes back to the start; there is no Next button and no "Up next". |
| S8-56 | Video-only track | Open a track posted without audio. | Same full-screen player; the video plays with its own sound, stops at 30 seconds at most, then the next track plays. |
