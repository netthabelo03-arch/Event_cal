# Sprint 6 test cases: door scanning

Before testing, run `supabase/007_checkin.sql` (README, "Door scanning (Sprint 6)"). You need a Host account with a live event that has tickets, and a Goer account holding at least two tickets for it. Use two devices if you can: the Goer's phone shows the ticket, the Host's phone scans it. Record any failure in `defect-log.md`.

| ID | Scenario | Steps | Expected result |
|----|----------|-------|-----------------|
| S6-01 | Way in | As the Host, open My events. | A live event with tickets shows "Scan tickets at the door". |
| S6-02 | Door screen | Tap it. | "Scan tickets" shows the event, "0 of N checked in", a grey "Ready" box and the guest list with every ticket "Not yet". |
| S6-03 | Scan a ticket | Tap Start camera, allow the camera, point it at a Goer's QR code in My tickets. | Green "Let them in"; the counter goes up by one; that ticket shows "In". |
| S6-04 | Same ticket again | Wait 5 seconds and scan the same QR code. | Red "Already used" with the time of the first scan; the counter does not change. |
| S6-05 | Type the code | Type the second ticket's 12-character code (small letters and spaces allowed) and tap Check in. | Green "Let them in"; the box is emptied. |
| S6-06 | Not a code | Type "hello" and tap Check in. | Grey "That is not a ticket code"; nothing is checked in. |
| S6-07 | Unknown code | Type 12 letters that are not a ticket, for example AAAAAAAAAAAA. | Red "Not a ticket for this event". |
| S6-08 | Ticket for another event | Scan a ticket for a different event of the same Host. | Red "Wrong event". |
| S6-09 | Goer sees it | As the Goer, open My tickets. | The scanned tickets say "Used at the door". |
| S6-10 | Not the host | As the Goer (or another Host), open the door screen's address for that event. | "Only the host of an event can scan its tickets." |
| S6-11 | Signed out | Sign out and open the door screen's address. | The sign-in screen; after signing in as the Host, the door screen opens. |
| S6-12 | Camera refused | Tap Start camera and refuse camera access. | A message says to allow the camera or type the code; typing still works. |
| S6-13 | Stop camera | Tap Stop camera, or go back to My events. | The camera light goes off. |
