"""Compute Performance Ratings for all performances in an event.

Idempotent: re-running recomputes and upserts PerformanceRating rows. Metrics
are z-scored within each (event, role) cohort, so run this per event after
sync_matches + pull_oracleselixir. See docs/player-rating-system.md.
"""

from collections import defaultdict

from django.core.management.base import BaseCommand, CommandError

from core.models import Event, PlayerPerformance, PerformanceRating
from core import rating


class Command(BaseCommand):
    help = "Compute Performance Ratings (PR), points, MVP and contribution share."

    def add_arguments(self, parser):
        parser.add_argument("--event", type=str, help="Leaguepedia page of a single event.")
        parser.add_argument("--all", action="store_true", help="Process every event.")

    def handle(self, *args, **opts):
        if opts["event"]:
            events = list(Event.objects.filter(leaguepedia_page=opts["event"]))
            if not events:
                raise CommandError(f"No event with leaguepedia_page={opts['event']!r}")
        elif opts["all"]:
            events = list(Event.objects.all())
        else:
            raise CommandError("Pass --event <page> or --all.")

        total = 0
        for event in events:
            n = self._process_event(event)
            if n:
                self.stdout.write(f"  {event.name}: {n} ratings")
            total += n
        self.stdout.write(self.style.SUCCESS(f"Computed {total} ratings across {len(events)} events."))

    def _process_event(self, event):
        perfs = list(
            PlayerPerformance.objects
            .filter(game__match__event=event)
            .select_related("game", "advanced")
        )
        if not perfs:
            return 0

        # Team totals per (game_id, side): kills/deaths/damage from the 5 rows.
        team_totals = defaultdict(lambda: {"kills": 0, "deaths": 0, "damage": 0})
        for p in perfs:
            t = team_totals[(p.game_id, p.side)]
            t["kills"] += p.kills or 0
            t["deaths"] += p.deaths or 0
            t["damage"] += p.damage_to_champions or 0

        # Raw metrics + tier per perf; group indices by role cohort.
        raw = {}        # perf.id -> {metric: value}
        tier = {}       # perf.id -> 'enriched' | 'basic'
        role_of = {}    # perf.id -> canonical role
        cohorts = defaultdict(list)  # role -> [perf.id, ...]
        for p in perfs:
            role = rating.canonical_role(p.role)
            if not role:
                continue  # Coach / Sub / unmapped — no rating
            raw[p.id] = rating.extract_metrics(p, p.game, team_totals[(p.game_id, p.side)])
            enriched = bool(p.game.is_enriched and getattr(p, "advanced", None) is not None)
            tier[p.id] = "enriched" if enriched else "basic"
            role_of[p.id] = role
            cohorts[role].append(p.id)

        # Normalize within each cohort → per-metric scores → weighted composite,
        # then re-spread the composites across the cohort so the best same-role
        # performance lands near 100 (see rating.scale_to_pr).
        pr_by_perf = {}
        breakdown_by_perf = {}
        for role, ids in cohorts.items():
            scored = rating.normalize_cohort([raw[i] for i in ids])
            raw_composite = {}
            for pid, scores in zip(ids, scored):
                raw_composite[pid] = rating.composite_pr(scores, role, tier[pid] == "enriched")
                breakdown_by_perf[pid] = {k: round(v, 1) for k, v in scores.items()}
            scaled = rating.scale_to_pr([raw_composite[i] for i in ids])
            for pid, pr in zip(ids, scaled):
                pr_by_perf[pid] = pr

        # MVP per game + contribution share per (game, side).
        by_game = defaultdict(list)
        by_team = defaultdict(list)  # (game_id, side) -> [pr]
        for p in perfs:
            if p.id in pr_by_perf:
                by_game[p.game_id].append(p.id)
                by_team[(p.game_id, p.side)].append(pr_by_perf[p.id])
        mvp_ids = set()
        for gid, ids in by_game.items():
            mvp_ids.add(max(ids, key=lambda i: pr_by_perf[i]))

        # Upsert ratings.
        count = 0
        for p in perfs:
            if p.id not in pr_by_perf:
                continue
            pr = pr_by_perf[p.id]
            won = p.game.winner == p.side
            is_mvp = p.id in mvp_ids
            PerformanceRating.objects.update_or_create(
                performance_id=p.id,
                defaults={
                    "pr": round(pr, 2),
                    "points": round(rating.game_points(pr, won, is_mvp), 3),
                    "tier": tier[p.id],
                    "is_mvp": is_mvp,
                    "contribution_share": round(
                        rating.contribution_share(pr, by_team[(p.game_id, p.side)]), 4
                    ),
                    "metric_breakdown": breakdown_by_perf[p.id],
                },
            )
            count += 1
        return count
