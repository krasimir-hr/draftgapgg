"""Player performance rating engine.

Pure, dependency-free functions that turn per-game stats into a 0–100
Performance Rating (PR), game points, and contribution share. See
docs/player-rating-system.md for the design rationale.

Two tiers of input:
  - Tier 1 (basic):    always available from Leaguepedia.
  - Tier 2 (enriched): Oracle's Elixir stats, present only when a game's OE row
                       is datacompleteness='complete'.

Metrics are z-scored within an (event, role) cohort, mapped to 0–100, then
combined with role-specific weights. For basic games the Tier-2 weights are
dropped and the remainder renormalized to sum 1.0.
"""

from statistics import mean, pstdev

# Role weights (Tier-2 / enriched). Keys are metric names from extract_metrics.
# Each role's weights sum to 1.0. See docs/player-rating-system.md §10.
ROLE_WEIGHTS = {
    "Top":     {"dmg_share": .18, "lane_diff15": .15, "dmg_mitig": .12, "kp": .12, "kda": .12, "cs_min": .11, "gold_eff": .10, "survive": .10},
    "Jungle":  {"kp": .24, "objective": .18, "vision_min": .12, "kda": .12, "lane_diff15": .10, "dmg_share": .08, "dmg_mitig": .08, "survive": .08},
    "Mid":     {"dmg_share": .26, "lane_diff15": .16, "kp": .16, "kda": .12, "gold_eff": .10, "cs_min": .10, "survive": .10},
    "Bot":     {"dmg_share": .28, "cs_min": .14, "lane_diff15": .12, "gold_eff": .12, "kda": .12, "kp": .12, "survive": .10},
    "Support": {"vision_min": .26, "kp": .24, "survive": .14, "objective": .12, "lane_diff15": .10, "kda": .08, "dmg_share": .06},
}

# Metrics that require Tier-2 (Oracle's Elixir) data. Dropped for basic games.
TIER2_METRICS = {"lane_diff15", "dmg_mitig"}

ROLES = ("Top", "Jungle", "Mid", "Bot", "Support")

_ROLE_MAP = {
    "top": "Top", "toplane": "Top",
    "jng": "Jungle", "jungle": "Jungle", "jgl": "Jungle",
    "mid": "Mid", "middle": "Mid",
    "bot": "Bot", "adc": "Bot", "ad carry": "Bot", "bottom": "Bot",
    "sup": "Support", "support": "Support", "supp": "Support",
}


def canonical_role(raw):
    """Normalize a Leaguepedia/OE role string to one of ROLES, or None."""
    if not raw:
        return None
    return _ROLE_MAP.get(str(raw).strip().lower())


def gamelength_minutes(gl):
    """Parse a 'mm:ss' (or numeric minutes) gamelength to float minutes."""
    if gl is None:
        return None
    s = str(gl).strip()
    if not s:
        return None
    if ":" in s:
        try:
            m, sec = s.split(":")[:2]
            return int(m) + int(sec) / 60.0
        except (ValueError, TypeError):
            return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def _clamp(x, lo, hi):
    return max(lo, min(hi, x))


def extract_metrics(perf, game, team_totals):
    """Return {metric: raw_value} for a PlayerPerformance.

    `team_totals` is a dict for the player's side in this game:
      {kills, deaths, damage}  (summed from the 5 player rows)
    Tier-1 metrics are always returned; Tier-2 only when the game is enriched
    and the perf has an `advanced` row.
    """
    minutes = gamelength_minutes(game.gamelength) or 0.0
    deaths = perf.deaths or 0
    ka = (perf.kills or 0) + (perf.assists or 0)

    team_kills = team_totals.get("kills") or 0
    team_deaths = team_totals.get("deaths") or 0
    team_damage = team_totals.get("damage") or 0

    side = perf.side  # 1 = blue, 2 = red
    objectives = 0
    if side == 1:
        objectives = (game.team1_dragons or 0) + (game.team1_barons or 0) + (game.team1_rift_heralds or 0)
    elif side == 2:
        objectives = (game.team2_dragons or 0) + (game.team2_barons or 0) + (game.team2_rift_heralds or 0)

    m = {
        "kda": ka / max(1, deaths),
        "kp": ka / max(1, team_kills),
        "dmg_share": (perf.damage_to_champions or 0) / team_damage if team_damage else 0.0,
        "cs_min": (perf.cs or 0) / minutes if minutes else 0.0,
        "gold_eff": (perf.damage_to_champions or 0) / ((perf.gold or 0) / 1000.0) if perf.gold else 0.0,
        "survive": 1 - deaths / max(1, team_deaths),
        "vision_min": (perf.vision_score or 0) / minutes if minutes else 0.0,
        "objective": float(objectives),
    }

    adv = getattr(perf, "advanced", None)
    if game.is_enriched and adv is not None:
        if adv.golddiffat15 is not None:
            m["lane_diff15"] = adv.golddiffat15
        if adv.damagemitigatedperminute is not None:
            m["dmg_mitig"] = adv.damagemitigatedperminute
        # Prefer OE's precomputed shares/vision rates where present.
        if adv.damageshare is not None:
            m["dmg_share"] = adv.damageshare
        if adv.vspm is not None:
            m["vision_min"] = adv.vspm
    return m


def normalize_cohort(rows):
    """Map raw metric values to 0–100 scores within a cohort.

    `rows` is a list of {metric: value} dicts (one per performance in the same
    (event, role) cohort). Returns a parallel list of {metric: 0–100} dicts.
    z = clamp((x - mean)/std, -2.5, 2.5); score = clamp(50 + 20z, 0, 100).
    """
    if not rows:
        return []
    metrics = set().union(*(r.keys() for r in rows))
    stats = {}
    for met in metrics:
        vals = [r[met] for r in rows if met in r and r[met] is not None]
        if not vals:
            continue
        mu = mean(vals)
        sd = pstdev(vals)
        stats[met] = (mu, sd)

    scored = []
    for r in rows:
        out = {}
        for met, val in r.items():
            if met not in stats or val is None:
                continue
            mu, sd = stats[met]
            if sd == 0:
                out[met] = 50.0
            else:
                z = _clamp((val - mu) / sd, -2.5, 2.5)
                out[met] = _clamp(50 + 20 * z, 0, 100)
        scored.append(out)
    return scored


def scale_to_pr(values):
    """Spread a cohort's raw composite scores across a full 0–100 PR.

    A composite is a weighted average of per-metric 0–100 scores; averaging
    compresses the variance toward 50, so even a dominant game tops out ~80.
    This second normalization re-spreads the composites within the cohort
    (z → 50 + 20z, clamped) so the event's best same-role performance lands
    near 100 and the worst near 0 — matching how a viewer reads the game.
    Order is preserved; only the scale changes.
    """
    if not values:
        return []
    mu = mean(values)
    sd = pstdev(values)
    if sd == 0:
        return [50.0 for _ in values]
    # slope 25 with a ±2σ clamp: an elite (~2σ) game reaches ~100 and a poor
    # (~2σ-low) one ~0, while typical games keep a natural spread around 50.
    return [_clamp(50 + 25 * _clamp((v - mu) / sd, -2.0, 2.0), 0, 100) for v in values]


def effective_weights(role, present_metrics, enriched):
    """Role weights restricted to the metrics actually present and renormalized
    to sum 1.0 (Tier-2 weights are dropped for basic games)."""
    weights = ROLE_WEIGHTS.get(role)
    if not weights:
        return {}
    usable = {
        k: w for k, w in weights.items()
        if k in present_metrics and (enriched or k not in TIER2_METRICS)
    }
    total = sum(usable.values())
    if total == 0:
        return {}
    return {k: w / total for k, w in usable.items()}


def composite_pr(scores, role, enriched):
    """Combine 0–100 metric scores into a single composite using role weights."""
    return sum(scores[k] * w for k, w in effective_weights(role, scores.keys(), enriched).items())


def game_points(pr, won, is_mvp):
    """base = PR/10, +2 win, +1 MVP."""
    return pr / 10.0 + (2.0 if won else 0.0) + (1.0 if is_mvp else 0.0)


def contribution_share(pr, team_prs):
    """PR as a fraction of the sum of the team's PRs that game."""
    total = sum(team_prs)
    return pr / total if total else 0.0
