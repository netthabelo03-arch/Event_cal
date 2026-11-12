# Defect log

One row per defect. "Sprint found" is when it was noticed; "Sprint caused" is the sprint whose code was at fault.

| ID | Date | Sprint found | Sprint caused | Screen or feature | What happened | What should happen | Severity | Status |
|----|------|--------------|---------------|-------------------|---------------|--------------------|----------|--------|
| D-001 | 2026-11-11 | 1 | 1 | Email and password boxes | When the browser fills in a saved email, the box turns pale blue | The box keeps the dark theme | Low | Fixed |
| D-002 | 2026-11-12 | 2 | 0 | Updating the live app | After an update, the live site kept showing the previous version (Discover still said "Posting an event arrives in Sprint 2"). Cause: GitHub Pages was publishing from an older branch instead of `gh-pages`; the browser cache also held old files. | A new version shows on the next visit | Medium | Retested |
| D-003 | 2026-11-12 | 3 | 1 | Layout on phones | On a phone, items overlapped (reported on the live app after Sprint 3) | Nothing overlaps on a phone-sized screen | Medium | Fixed |
| D-004 | 2026-11-12 | 3 | 2 | Clips in the feed and on cards | Words that are part of a host's video were cut off at the edges, because the clip was cropped to fill the screen or the square card | The whole frame of the clip is shown, so words inside the video are readable | Medium | Fixed |

Severity: Critical (app unusable or money wrong), High (feature broken), Medium (works with a workaround), Low (cosmetic).
Status: Open, In progress, Fixed, Retested, Closed.
