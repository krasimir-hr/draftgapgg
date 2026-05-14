"""Populate Game.gold_graph from the lolesports feed for completed games.

Uses VOD URLs already stored in the database to look up esports game IDs via
the lolesports schedule API, then walks the livestats feed frame-by-frame to
build a minute-by-minute gold-difference timeline.

Usage:
    python manage.py sync_gold_graphs            # all missing
    python manage.py sync_gold_graphs --force    # re-fetch even if already set
    python manage.py sync_gold_graphs --event "LCK/2025 Season/Spring Season"
"""

import time
from datetime import datetime, timezone
from urllib.parse import urlparse

import requests
from django.core.management.base import BaseCommand

from core.models import Event, Game

_KEY  = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z'
_GW   = 'https://esports-api.lolesports.com/persisted/gw'
_FEED = 'https://feed.lolesports.com/livestats/v1'
_HDR  = {'x-api-key': _KEY}


def _get(url, params=None, retries=3):
    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, headers=_HDR, timeout=10)
            r.raise_for_status()
            return r.json()
        except Exception as exc:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)


def _parse_vod_url(vod_url: str):
    """Return (match_event_id, game_number) from a lolesports.com VOD URL, or (None, None)."""
    try:
        path = urlparse(vod_url).path.lstrip('/')
        # Handles both /vod/{id}/{n}/... and /match/{id}/{n}/...
        parts = path.split('/')
        if parts[0] in ('vod', 'match') and len(parts) >= 3:
            return parts[1], int(parts[2])
    except Exception:
        pass
    return None, None


def _get_esports_game_id(match_event_id: str, game_number: int):
    """Fetch the lolesports esports game ID for a specific game in a match."""
    data = _get(f'{_GW}/getEventDetails', params={'hl': 'en-US', 'id': match_event_id})
    event = data.get('data', {}).get('event', {})
    match = event.get('match', {})
    for g in match.get('games', []):
        if g.get('number') == game_number:
            return g.get('id'), match.get('teams', [])
    return None, []


def _fetch_all_frames(esports_game_id: str):
    """Walk the lolesports window feed and collect every frame for a completed game."""
    frames = []
    starting_time = None

    while True:
        params = {}
        if starting_time:
            params['startingTime'] = starting_time

        data = _get(f'{_FEED}/window/{esports_game_id}', params=params or None)
        batch = data.get('frames', [])
        if not batch:
            break

        # On first fetch without startingTime, we may get duplicates on the next
        # fetch if we reuse the last timestamp exactly — deduplicate by timestamp.
        last_ts = frames[-1]['rfc460Timestamp'] if frames else None
        new_frames = [f for f in batch if f['rfc460Timestamp'] != last_ts] if last_ts else batch
        if not new_frames:
            break

        frames.extend(new_frames)

        last_ts = frames[-1]['rfc460Timestamp']
        # Advance 1 second past the last frame to get the next window
        last_dt = datetime.fromisoformat(last_ts.replace('Z', '+00:00'))
        next_dt = last_dt.replace(second=last_dt.second + 1) if last_dt.second < 59 else \
                  last_dt.replace(second=0, minute=last_dt.minute + 1)
        starting_time = next_dt.strftime('%Y-%m-%dT%H:%M:%S.000Z')

        time.sleep(0.3)

    return frames


def _build_gold_graph(frames, team1_is_blue: bool):
    """Convert raw frames to [{m, t1, t2}] with minutes relative to the first frame."""
    if not frames:
        return []

    first_dt = datetime.fromisoformat(frames[0]['rfc460Timestamp'].replace('Z', '+00:00'))
    graph = []

    for f in frames:
        ts_dt = datetime.fromisoformat(f['rfc460Timestamp'].replace('Z', '+00:00'))
        elapsed_s = (ts_dt - first_dt).total_seconds()
        minute = round(elapsed_s / 60, 1)

        blue_gold = f.get('blueTeam', {}).get('totalGold', 0)
        red_gold  = f.get('redTeam',  {}).get('totalGold', 0)

        t1 = blue_gold if team1_is_blue else red_gold
        t2 = red_gold  if team1_is_blue else blue_gold

        graph.append({'m': minute, 't1': t1, 't2': t2})

    return graph


class Command(BaseCommand):
    help = 'Populate gold_graph for games using the lolesports livestats feed'

    def add_arguments(self, parser):
        parser.add_argument('--event', type=str, help='Leaguepedia overview page')
        parser.add_argument('--force', action='store_true', help='Re-fetch even if gold_graph already set')

    def handle(self, *args, **options):
        qs = Game.objects.select_related('match__event')

        if options['event']:
            qs = qs.filter(match__event__leaguepedia_page=options['event'])

        if not options['force']:
            qs = qs.filter(gold_graph__isnull=True)

        # Only games that have a lolesports.com VOD
        qs = qs.filter(vod__icontains='lolesports.com')

        total = qs.count()
        self.stdout.write(f'Games to process: {total}')
        if total == 0:
            return

        done, skipped, errors = 0, 0, 0

        for game in qs.iterator():
            match_event_id, game_number = _parse_vod_url(game.vod)
            if not match_event_id:
                self.stderr.write(f'  ⚠ Cannot parse VOD URL: {game.vod}')
                skipped += 1
                continue

            try:
                self.stdout.write(f'  {game} — match event {match_event_id} game {game_number}')

                esports_game_id, teams = _get_esports_game_id(match_event_id, game_number)
                if not esports_game_id:
                    self.stderr.write(f'    ⚠ Game ID not found in event details')
                    skipped += 1
                    continue

                # Determine which side is team1 (best-effort code match)
                team1_name = game.team1.lower()
                team1_is_blue = True  # default: assume team1 is blue
                for t in teams:
                    code  = (t.get('code') or '').lower()
                    name  = (t.get('name') or '').lower()
                    if code == team1_name or name == team1_name or team1_name in code or team1_name in name:
                        # Found team1 in lolesports teams list; blue side is index 0
                        team1_is_blue = (teams.index(t) == 0)
                        break

                frames = _fetch_all_frames(esports_game_id)
                if not frames:
                    self.stderr.write(f'    ⚠ No frames returned')
                    skipped += 1
                    continue

                gold_graph = _build_gold_graph(frames, team1_is_blue)
                game.gold_graph = gold_graph
                game.save(update_fields=['gold_graph'])

                self.stdout.write(self.style.SUCCESS(
                    f'    ✔ {len(gold_graph)} points, {gold_graph[-1]["m"]:.0f} min'
                ))
                done += 1

            except Exception as exc:
                self.stderr.write(self.style.ERROR(f'    ✗ Error: {exc}'))
                errors += 1

            time.sleep(1)

        self.stdout.write(self.style.SUCCESS(
            f'\nDone — {done} saved, {skipped} skipped, {errors} errors'
        ))
