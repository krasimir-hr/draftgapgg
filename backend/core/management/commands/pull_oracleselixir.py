"""Pull Oracle's Elixir match data and enrich our games with Tier-2 stats.

Source: a free, per-year CSV in a public Google Drive folder (updated daily).
We join OE rows to our games on `gameid == Game.riot_platform_game_id` and match
each player row to a PlayerPerformance by (game, side, canonical role).

Reliable automation uses the Drive API (`OE_DRIVE_API_KEY`); anonymous web
downloads are quota-throttled. For local testing pass `--file <path>` to ingest
a CSV that's already on disk (no key needed).

See docs/player-rating-system.md §2 and §10.
"""

import csv
import re
import sys

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils.timezone import now

from core.models import Game, PlayerPerformance, PerformanceAdvanced
from core.rating import canonical_role

DEFAULT_FOLDER = "1gLSw0RLjBbtaNy0dgnGQDAZOHIgCe-HH"
FOLDER_VIEW = "https://drive.google.com/embeddedfolderview?id={folder}#list"
DRIVE_API = "https://www.googleapis.com/drive/v3/files/{id}?alt=media&key={key}"

# OE column -> PerformanceAdvanced field. ints parsed as int, rest as float.
FLOAT_COLS = {
    "golddiffat10": "golddiffat10",
    "golddiffat15": "golddiffat15",
    "csdiffat15": "csdiffat15",
    "xpdiffat15": "xpdiffat15",
    "damageshare": "damageshare",
    "earnedgoldshare": "earnedgoldshare",
    "damagetakenperminute": "damagetakenperminute",
    "damagemitigatedperminute": "damagemitigatedperminute",
    "vspm": "vspm",
    "wpm": "wpm",
}
INT_COLS = {
    "wardskilled": "wardskilled",
    "controlwardsbought": "controlwardsbought",
}


def _f(v):
    try:
        return float(v) if v not in (None, "") else None
    except (ValueError, TypeError):
        return None


def _i(v):
    f = _f(v)
    return int(f) if f is not None else None


class Command(BaseCommand):
    help = "Download Oracle's Elixir CSV and enrich games with Tier-2 stats."

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, default=now().year)
        parser.add_argument("--file", type=str, help="Ingest a local CSV instead of downloading.")
        parser.add_argument("--no-download", action="store_true", help="Skip download; use the mirrored file.")
        parser.add_argument("--folder", type=str, default=DEFAULT_FOLDER)

    def handle(self, *args, **opts):
        year = opts["year"]
        path = opts["file"]

        if not path:
            mirror = self._mirror_path(year)
            if not opts["no_download"]:
                self._download(opts["folder"], year, mirror)
            path = mirror

        self.stdout.write(f"Ingesting {path}")
        self._ingest(path)

    # download

    def _mirror_path(self, year):
        data_dir = getattr(settings, "OE_DATA_DIR", settings.BASE_DIR / "oe_data")
        data_dir = __import__("pathlib").Path(data_dir)
        data_dir.mkdir(parents=True, exist_ok=True)
        return str(data_dir / f"{year}_oracleselixir.csv")

    def _resolve_file_id(self, folder, year):
        """Parse the public folder listing into {year: file_id}."""
        html = requests.get(FOLDER_VIEW.format(folder=folder), timeout=30).text
        titles = re.findall(r'flip-entry-title">([^<]+)', html)
        ids = re.findall(r'"entry-([A-Za-z0-9_-]{20,})"', html)
        by_year = {t[:4]: i for t, i in zip(titles, ids) if t[:4].isdigit()}
        return by_year.get(str(year))

    def _download(self, folder, year, dest):
        key = getattr(settings, "OE_DRIVE_API_KEY", "")
        if not key:
            raise CommandError(
                "OE_DRIVE_API_KEY not set. Set it in the environment, or pass "
                "--file <path> / --no-download to use a local CSV."
            )
        file_id = self._resolve_file_id(folder, year)
        if not file_id:
            raise CommandError(f"No Oracle's Elixir file found for {year} in folder {folder}.")
        self.stdout.write(f"Downloading {year} (file {file_id}) → {dest}")
        url = DRIVE_API.format(id=file_id, key=key)
        with requests.get(url, stream=True, timeout=120) as r:
            ctype = r.headers.get("Content-Type", "")
            if r.status_code != 200 or "text/html" in ctype:
                raise CommandError(
                    f"Drive download failed (status {r.status_code}, type {ctype}). "
                    "Keeping any existing mirror."
                )
            with open(dest, "wb") as fh:
                for chunk in r.iter_content(chunk_size=1 << 20):
                    fh.write(chunk)
        self.stdout.write(self.style.SUCCESS(f"Downloaded → {dest}"))

    # ingest

    def _ingest(self, path):
        # Map our games by Riot platform game id (the OE join key).
        games_by_rgid = {
            g.riot_platform_game_id: g
            for g in Game.objects.exclude(riot_platform_game_id="")
        }
        self.stdout.write(f"Games with riot id (joinable): {len(games_by_rgid)}")

        # Performance lookup keyed by (game_id, side, canonical_role).
        perf_lookup = {}
        perfs = PlayerPerformance.objects.filter(
            game__in=list(games_by_rgid.values())
        ).only("id", "game_id", "side", "role")
        for p in perfs:
            role = canonical_role(p.role)
            if role:
                perf_lookup[(p.game_id, p.side, role)] = p.id

        # Avoid Python's default 131072-char CSV field cap on big files.
        csv.field_size_limit(min(sys.maxsize, 2**31 - 1))

        matched_rows = 0
        unmatched_games = set()
        enriched_game_ids = set()
        advanced_to_upsert = []  # (perf_id, defaults)

        with open(path, newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                if row.get("position") == "team":
                    continue
                gid = row.get("gameid", "")
                game = games_by_rgid.get(gid)
                if not game:
                    if gid:
                        unmatched_games.add(gid)
                    continue

                side = 1 if row.get("side") == "Blue" else 2
                role = canonical_role(row.get("position"))
                perf_id = perf_lookup.get((game.id, side, role))
                if not perf_id:
                    continue

                defaults = {field: _f(row.get(col)) for col, field in FLOAT_COLS.items()}
                defaults.update({field: _i(row.get(col)) for col, field in INT_COLS.items()})
                advanced_to_upsert.append((perf_id, defaults))
                matched_rows += 1

                if row.get("datacompleteness") == "complete":
                    enriched_game_ids.add(game.id)

        # Upsert advanced rows.
        created = updated = 0
        for perf_id, defaults in advanced_to_upsert:
            _, was_created = PerformanceAdvanced.objects.update_or_create(
                performance_id=perf_id, defaults=defaults
            )
            created += was_created
            updated += not was_created

        # Flag enriched games.
        Game.objects.filter(id__in=enriched_game_ids).update(is_enriched=True)

        self.stdout.write(self.style.SUCCESS(
            f"Matched {matched_rows} player rows | advanced created {created}, updated {updated} | "
            f"games enriched {len(enriched_game_ids)} | OE gameids with no local match {len(unmatched_games)}"
        ))
