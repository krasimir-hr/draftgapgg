# DraftGap Player Performance Rating System

> **Status:** Design draft. Defines how a per-game player performance is turned
> into a normalized rating, role weights, and a points scale used to find the
> best-contributing player.

## 1. Goal

Take the stats we store per player per game and produce:

1. **Performance Rating (PR)** — a `0–100` score of how well a player played
   *relative to other players in the same role*. Answers: "who is the best Mid
   laner this split?"
2. **Game Points** — PR transformed into a points number per game, with a win
   weighting, so contributions accumulate into a season leaderboard.
3. **Contribution Share** — how much of their team's production a player drove
   in a given game. Answers: "who carried this game?"

The hard requirement is **cross-role comparability**: 280 CS on an ADC and 30
CS on a support both have to map onto the same scale. We get that by
normalizing every metric *within its role cohort* before combining.

## 2. Data sources

Esports data is **not in the Riot API** (tournament-realm games aren't served by
Match-V5). We use two sources:

### Tier 1 — Leaguepedia (always present)

Cargo tables `ScoreboardPlayers` / `ScoreboardGames`, mirroring the broadcast
scoreboard. This is what `sync_events` already pulls. Verified fields:

- Per player: `Kills` `Deaths` `Assists` `CS` `Gold` `DamageToChampions`
  `VisionScore` `TeamKills` `TeamGold` `Champion` `Role` `Side` `PlayerWin`
- Per game: `Gamelength` `Winner` `Team1/2 Kills/Gold/Towers/Dragons/Barons/RiftHeralds`

### Tier 2 — Oracle's Elixir (enrichment, ~92% of games)

A free per-player/per-game CSV (`{year}_LoL_esports_match_data_from_OraclesElixir.csv`,
165 columns). It carries the laning, vision, and damage-detail stats Leaguepedia
lacks. **Joined to our games on `gameid == Game.riot_platform_game_id`** (verified:
OE `gameid` is the Riot platformGameId, e.g. `LOLTMNT02_375568`, which is exactly
what we store).

Verified extras over Tier 1:

- **Laning** — `goldat10/15/20/25`, `xpat…`, `csat…`, and the opponent diffs
  `golddiffat15`, `xpdiffat15`, `csdiffat15` (plus `…at10`).
- **Vision** — `vspm` (vision score/min), `wpm`, `wardskilled`, `controlwardsbought`.
- **Damage detail** — `damageshare`, `dpm`, `damagetakenperminute`,
  `damagemitigatedperminute`.
- **Economy** — `earnedgoldshare`, `gspd`, `cspm`.
- **Misc** — `firstblood`/`firstbloodassist`, multikills, team objective totals
  (`dragons`, `heralds`, `barons`, `turretplates`, …).

> **Verified completeness (2026 file, 68,652 rows):** 63,312 `complete` /
> 5,340 `partial`. The *only* partial league is **LPL** — it doesn't publish
> timeline data, so LPL games fall back to Tier 1. `goldat15` is filled for
> **100%** of `complete` rows and **0%** of `partial` — so the tier of any game
> is read straight off `datacompleteness`.

### Two practical caveats

1. **Join coverage.** Only games with `riot_platform_game_id` populated can be
   enriched (currently ~735 / 4,268). Backfill that field from Leaguepedia's
   `RiotPlatformGameId` to widen coverage. Use per-year OE files for older
   events (this CSV is 2026 only).
2. **License.** Oracle's Elixir is free for **non-commercial use with
   attribution** to Oracle's Elixir / Tim Sevenhuysen. Credit it visibly;
   commercial use needs permission.

## 3. Derived metrics

Let `minutes = gamelength` in minutes. OE rows where `position == 'team'` are
team-summary rows — **filter them out** for player ratings (use them, or the
`ScoreboardGames` fields, for team context). OE positions map
`top→Top, jng→Jungle, mid→Mid, bot→Bot, sup→Support`.

### Tier 1 (Leaguepedia) — available for every game

| Metric | Formula | Notes |
|--------|---------|-------|
| **KDA** | `(K + A) / max(1, D)` | quality + survivability |
| **KP** | `(K + A) / max(1, team_kills)` | involvement in kills |
| **DMG share** | `damage / team_damage` | % of team's damage |
| **DPM** | `damage / minutes` | damage output rate |
| **CS/min** | `cs / minutes` | farm |
| **Gold efficiency** | `damage / (gold / 1000)` | damage per 1k gold |
| **Survivability** | `1 − deaths / max(1, team_deaths)` | inverse death share |
| **Vision/min** | `VisionScore / minutes` | warding (low resolution) |
| **Objective bonus** | normalized team `(dragons + barons + heralds)` | team-shared |

### Tier 2 (Oracle's Elixir) — `complete` games only

| Metric | Source | Notes |
|--------|--------|-------|
| **Lane diff @15** | `golddiffat15` (and `csdiffat15`/`xpdiffat15`) | the cleanest laning signal — beat your counterpart |
| **Vision/min (rich)** | `vspm` (+ `wpm`, `wardskilled`, `controlwardsbought`) | replaces the low-res Tier-1 vision |
| **Damage taken/min** | `damagetakenperminute` | frontline soak |
| **Damage mitigated/min** | `damagemitigatedperminute` | tankiness / durability |
| **DMG share** | `damageshare` | precomputed; preferred over manual |

All metrics are z-scored within role (§4). A game uses Tier-2 metrics only if
`datacompleteness == complete`; otherwise it falls back to the Tier-1 weights.

## 4. Normalization (the comparability trick)

Raw metrics aren't comparable across roles, nor across games (a 20-minute stomp
inflates totals). So:

1. **Cohort** = all performances in the same `(event, role)`. (Optionally split
   by patch once data volume allows.)
2. Compute the cohort **mean** and **std dev** per metric.
3. Convert each player's metric to a **z-score**, clamped to `[−2.5, +2.5]`:

   ```
   z = clamp((x − mean_role) / std_role, −2.5, 2.5)
   ```

4. Map to `0–100`:

   ```
   m = clamp(50 + 20 · z, 0, 100)
   ```

   An average game scores `50`; `+2 std` scores `90`.

This makes "best in role" relative to that role's own distribution — what lets
an ADC's damage and a support's vision land on one scale.

## 5. Composite Performance Rating

```
composite = Σ (weightᵢ · mᵢ)        # weights per role sum to 1.0
PR        = rescale(composite)      # re-spread within the (event, role) cohort → [0, 100]
```

**Why the rescale step.** `composite` is a weighted average of per-metric 0–100
scores. Averaging shrinks variance toward 50, so even a dominant game would top
out ~80 (you'd need +2.5σ on *every* metric at once to hit 100). So after
computing the composite for everyone in the cohort, we normalize the composites
themselves — `PR = clamp(50 + 25·z, 0, 100)` with `z` clamped to ±2σ — so an
elite (~2σ) performance reads ~100 and a poor one ~0, while typical games keep a
natural spread around 50. Order is preserved; only the scale changes. The
per-metric bars shown in the UI remain the first-level scores (each metric vs
role peers); the headline PR is the rescaled overall standing.

### Role weight tables (Tier 2 — enriched games)

These are the primary tables. For `partial`/Tier-1 games, drop the Tier-2 rows
(Lane diff, Damage taken/mitigated) and renormalize the remaining weights to 1.0.

#### Top
| Metric | Weight |
|--------|-------:|
| DMG share | 0.18 |
| Lane diff @15 | 0.15 |
| Damage mitigated/min | 0.12 |
| KP | 0.12 |
| KDA | 0.12 |
| CS/min | 0.11 |
| Gold efficiency | 0.10 |
| Survivability | 0.10 |

Top is the most varied role: a tank and a carry both need to read well. Damage
*and* damage-mitigated mean a frontline tank scores for soaking, not just
dealing; lane diff rewards winning the 1v1.

#### Jungle
| Metric | Weight |
|--------|-------:|
| KP | 0.24 |
| Objective bonus | 0.18 |
| Vision/min | 0.12 |
| KDA | 0.12 |
| Lane diff @15 | 0.10 |
| DMG share | 0.08 |
| Damage mitigated/min | 0.08 |
| Survivability | 0.08 |

Jungle is graded on map impact: kill presence and objective control dominate,
with vision and early gold diff (pathing impact) as real secondary signals.

#### Mid
| Metric | Weight |
|--------|-------:|
| DMG share | 0.26 |
| Lane diff @15 | 0.16 |
| KP | 0.16 |
| KDA | 0.12 |
| Gold efficiency | 0.10 |
| CS/min | 0.10 |
| Survivability | 0.10 |

Mid is a damage-and-roam hybrid: high damage share, winning lane (diff), *and*
roaming (KP) are all rewarded.

#### Bot (ADC)
| Metric | Weight |
|--------|-------:|
| DMG share | 0.28 |
| CS/min | 0.14 |
| Lane diff @15 | 0.12 |
| Gold efficiency | 0.12 |
| KDA | 0.12 |
| KP | 0.12 |
| Survivability | 0.10 |

ADC is the primary sustained-damage carry: damage share leads; farm, lane diff,
and turning gold into damage matter heavily.

#### Support
| Metric | Weight |
|--------|-------:|
| Vision/min | 0.26 |
| KP | 0.24 |
| Survivability | 0.14 |
| Objective bonus | 0.12 |
| Lane diff @15 | 0.10 |
| KDA | 0.08 |
| DMG share | 0.06 |

Support **excludes CS/min, gold, and gold efficiency** — structurally near-zero.
With OE's vision detail (`vspm`/wards/control wards) the role is finally
gradeable on its actual job: **vision + being present for fights (KP) + not
dying**. The lane-diff slot is the shared bot-lane gold diff. Still unmeasured:
peel/CC and heals/shields *on teammates* (OE has neither), so enchanter value is
under-credited — treat support as the lowest-confidence role, but no longer
blind.

## 6. From rating to points

### Per-game points

```
base   = PR / 10                       # 0–10
win    = +2.0 if player's side won, else 0
mvp    = +1.0 if highest PR in the game
points = base + win + mvp              # ~0–13 per game
```

PR measures *how well you played*; the win bonus credits *contributing to a
result* (a great game in a loss still scores via `base`, but winners get
rewarded); the MVP bonus rewards the single best performer that game.

### Season aggregation

| Award | Metric | Guard |
|-------|--------|-------|
| **Best player (overall)** | highest **mean PR** | min games (e.g. ≥ 30% of team's games) |
| **Most valuable (season)** | highest **total Game Points** | rewards volume + quality |
| **Best in role** | highest mean PR within role | same min-games guard |

Mean PR for "best player" (so fewer games isn't penalized); total points for
"most valuable" (showing up every game is itself contribution). The min-games
threshold stops one smurf game from topping the board.

## 7. Contribution Share (who carried)

Separate from PR. Within one game, for player `p` on team `t`:

```
contribution_share(p) = PR(p) / Σ PR(teammates on t)
```

Balanced teams sit ~20% each; a hard carry shows 30–40%. Right signal for "who
won us that game." **Not** averaged into PR — it's a separate lens.

## 8. Remaining gaps (even with Oracle's Elixir)

OE closes most of the Leaguepedia gaps, but a few stay unavailable:

- **CC score / time CCing others** — not in OE; engage/peel still inferred.
- **Heals / shields on teammates** — not in OE; enchanter support value can't be
  isolated (support relies on vision + KP instead).
- **Individual objective participation** — OE gives *team* objective totals and
  individual `firstblood` flags only, so the Objective bonus stays team-shared.
- **LPL** — `partial` data, so LPL games run on the Tier-1 fallback.

Label published ratings by tier ("enriched" vs "basic") so the difference is
transparent.

## 9. Worked example

ADC, 31-min win (enriched game): `8/2/6`, `280 cs`, `28k dmg`, `damageshare 0.39`,
`golddiffat15 +900`, `cspm 9.0`.

- KDA `= (8+6)/2 = 7.0`
- KP `= 14/18 = 0.78`
- Lane diff @15 `= +900 gold`
- Survivability `= 1 − 2/6 = 0.667`

Each is z-scored against all ADCs in the event, mapped to `0–100`, combined with
the Bot weights → say `PR = 80`. Then `base = 8.0`, `+2` win, `+1` if game MVP →
**`11.0` points**.

## 10. Implementation notes

- **Ingest:** load the per-year OE CSV, filter `position != 'team'`, join on
  `gameid → Game.riot_platform_game_id`. Store enriched columns on
  `PlayerPerformance` (or a 1:1 `PerformanceAdvanced` table) plus `vision_score`
  from Leaguepedia. Add `Game.is_enriched` (= matched OE row with
  `datacompleteness == 'complete'`).
- **Backfill** `riot_platform_game_id` from Leaguepedia to widen the join.
- **Cohort stats:** compute mean/std per `(event, role)` in one pass; cache on
  the event. Recompute on sync, not per request.
- **Persist** per-game `PR` and `points` in a `PerformanceRating` table so
  leaderboards are a cheap aggregate query.
- **Tunable weights** in one config dict (Tier-2 keys; renormalize to the Tier-1
  subset when `not is_enriched`):

  ```python
  ROLE_WEIGHTS = {
      "Top":     {"dmg_share": .18, "lane_diff15": .15, "dmg_mitig": .12, "kp": .12, "kda": .12, "cs_min": .11, "gold_eff": .10, "survive": .10},
      "Jungle":  {"kp": .24, "objective": .18, "vision_min": .12, "kda": .12, "lane_diff15": .10, "dmg_share": .08, "dmg_mitig": .08, "survive": .08},
      "Mid":     {"dmg_share": .26, "lane_diff15": .16, "kp": .16, "kda": .12, "gold_eff": .10, "cs_min": .10, "survive": .10},
      "Bot":     {"dmg_share": .28, "cs_min": .14, "lane_diff15": .12, "gold_eff": .12, "kda": .12, "kp": .12, "survive": .10},
      "Support": {"vision_min": .26, "kp": .24, "survive": .14, "objective": .12, "lane_diff15": .10, "kda": .08, "dmg_share": .06},
  }
  ```
