# Backlog

Ideas agreed for later. Each one is picked up into a sprint when its turn comes.

| ID | Idea | Details | Depends on | Suggested sprint | Added |
|----|------|---------|------------|------------------|-------|
| B-001 | Trending grid (built in Sprint 11) | A "Trending" grid on Discover. Which events appear, and in what order, depends on how many views each event's clip gets and how many tickets it has sold. | View counts (Sprint 3) and ticket sales (Sprint 5) | After Sprint 5, alongside boosts in Sprint 7 | 2026-11-12 |

## B-001: what was chosen (Sprint 11)

- A ticket sold counts as much as 10 views.
- Only the last 7 days count; today counts in full and each day back a seventh less.
- Boosts do not change Trending. Boosted events already lead the ribbon and feed, labelled Promoted.
- Trending shows once at least 3 live events have activity; started events drop out.
- These are set in `supabase/018_trending_resubmit_notice.sql` and can be tuned there.

## The questions that were open for B-001

- How much should a ticket sale count compared with a view? A sale is a stronger signal, so it should weigh more.
- Should recent activity count more than old activity, so a new event can climb quickly?
- Should paid boosts (Sprint 7) show inside the Trending grid, labelled "Promoted", or in a separate row?
