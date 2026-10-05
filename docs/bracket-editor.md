# Playoff bracket administration

Open a playoff overview and choose **Admin sign in**. Use an existing Django account marked **Staff status** (superusers also qualify). The app uses the existing JWT login API. Public visitors can read matches but cannot save bracket changes.

Choose **Edit bracket**, then drag a match into an upper, lower, or final zone. Drop it above another match to reorder the series. The selected match can also be moved with the destination selector and **Move** button, which supports keyboards and touch devices. The **Winner advances to** selector connects it to a series in a later round; moving a match clears connections that would point backwards. Placement matches remain separate.

**Save layout** stores positions, bracket paths, final flags, and winner connections together. Scores, teams, dates, and original imported round names are unchanged. **Cancel** discards the draft. Changes become public only after saving, and the page reloads its data automatically. An expired session prompts for sign-in while retaining the draft.

`POST /api/matches/bracket-layout/` accepts an event ID and match placements. The server enforces staff access, same-event/stage connections, distinct positions, and forward winner paths. It clears occupied positions before applying swaps inside one transaction. Existing per-match bracket and rename-column endpoints are also staff-only. No schema migration is needed.
