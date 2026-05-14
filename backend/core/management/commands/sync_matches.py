import time
from datetime import date, timezone
from django.core.management.base import BaseCommand
from django.utils.dateparse import parse_datetime
from django.utils.timezone import now, make_aware
from mwrogue.esports_client import EsportsClient
from mwrogue.auth_credentials import AuthCredentials
from core.models import Event, Match, Game, PlayerPerformance
from lol.models import Champion, Item, SummonerSpell, Rune


CHAMPION_ALIASES = {}

ITEM_ALIASES = {
    "Blade of the Ruined King": "Blade of The Ruined King",
    "Luden's Companion": "Luden's Echo",
}

RUNE_ALIASES = {
}

SPELL_ALIASES = {}


def safe_int(value, default=0):
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def parse_csv(value):
    if not value:
        return []
    return [v.strip() for v in value.split(",") if v.strip()]


def parse_utc_datetime(value):
    if not value:
        return None
    dt = parse_datetime(value)
    if dt is None:
        return None
    if dt.tzinfo is None:
        return make_aware(dt, timezone.utc)
    return dt


class Command(BaseCommand):
    help = "Sync matches, games, and player performances from Leaguepedia"

    def add_arguments(self, parser):
        parser.add_argument("--event", type=str)
        parser.add_argument("--all", action="store_true")
        parser.add_argument("--force", action="store_true", help="Ignore is_fully_synced and re-sync everything")

    def handle(self, *args, **options):
        username = 'Witcher303!@draftgap-fanmade'
        password = '73dc4l60kdq8a00o617fefvne7vpnr66'
        credentials = AuthCredentials(username=username, password=password)
        site = EsportsClient('lol', credentials=credentials)

        self.champion_map = {c.name: c for c in Champion.objects.all()}
        self.item_map = {i.name: i for i in Item.objects.all()}
        self.spell_map = {s.name: s for s in SummonerSpell.objects.all()}
        self.rune_map = {r.name: r for r in Rune.objects.all()}

        self.stdout.write(
            f"Loaded: {len(self.champion_map)} champions, {len(self.item_map)} items, "
            f"{len(self.spell_map)} spells, {len(self.rune_map)} runes"
        )

        if options["event"]:
            pages = [options["event"]]
            events = {options["event"]: Event.objects.get(leaguepedia_page=options["event"])}
        elif options["all"]:
            queryset = Event.objects.exclude(leaguepedia_page__isnull=True)

            if not options["force"]:
                today = date.today()
                queryset = queryset.filter(is_fully_synced=False).exclude(
                    start_date__gt=today  # skip future events
                )

            events = {t.leaguepedia_page: t for t in queryset}
            pages = list(events.keys())

            self.stdout.write(f"Found {len(pages)} events to sync")
        else:
            self.stderr.write("Provide --event <page> or --all")
            return

        for page in pages:
            event = events.get(page)
            if not event:
                try:
                    event = Event.objects.get(leaguepedia_page=page)
                except Event.DoesNotExist:
                    self.stderr.write(self.style.ERROR(f"Event not found: {page}"))
                    continue

            self.stdout.write(f"\n{'='*60}\nSyncing: {page}\n{'='*60}")

            self.sync_matches(site, event, page)
            self.sync_games(site, event, page)
            self.sync_player_performances(site, page)

            # Mark as fully synced if the event has ended
            event.last_synced_at = now()
            if event.end_date and event.end_date < date.today():
                event.is_fully_synced = True
                self.stdout.write(self.style.SUCCESS(
                    f"✔ Marked as fully synced (ended {event.end_date})"
                ))
            event.save()

            time.sleep(2)

        self.stdout.write(self.style.SUCCESS("\nDone!"))

    def find_champion(self, name):
        name = CHAMPION_ALIASES.get(name, name)
        return self.champion_map.get(name)

    def find_champions(self, csv_string):
        return [c for name in parse_csv(csv_string) if (c := self.find_champion(name))]

    def find_item(self, name):
        name = ITEM_ALIASES.get(name, name)
        return self.item_map.get(name)

    def find_spell(self, name):
        name = SPELL_ALIASES.get(name, name)
        return self.spell_map.get(name)

    def find_rune(self, name):
        name = RUNE_ALIASES.get(name, name)
        return self.rune_map.get(name)

    # ── Matches ────────────────────────────────────────────────

    def sync_matches(self, site, event, overview_page):
        self.stdout.write("\n--- Matches ---")
        data = site.cargo_client.query(
            tables="MatchSchedule",
            fields="MatchId, Team1, Team2, BestOf, Tab, Winner, DateTime_UTC, Patch",
            where=f"OverviewPage='{overview_page}'",
        )
        time.sleep(1)

        created, updated = 0, 0
        for row in data:
            match, was_created = Match.objects.update_or_create(
                match_id=row.get("MatchId", ""),
                defaults={
                    "event": event,
                    "team1": row.get("Team1", ""),
                    "team2": row.get("Team2", ""),
                    "winner": safe_int(row.get("Winner"), None),
                    "best_of": safe_int(row.get("BestOf"), 3),
                    "tab": row.get("Tab", ""),
                    "datetime_utc": parse_utc_datetime(row.get("DateTime UTC", "")),
                    "patch": row.get("Patch", ""),
                },
            )
            created += 1 if was_created else 0
            updated += 0 if was_created else 1

        self.stdout.write(self.style.SUCCESS(f"Matches — created: {created}, updated: {updated}"))

    # ── Games ──────────────────────────────────────────────────

    def sync_games(self, site, event, overview_page):
        self.stdout.write("\n--- Games ---")
        data = site.cargo_client.query(
            tables="ScoreboardGames",
            fields=(
                "GameId, MatchId, DateTime_UTC, Patch, Gamelength, Winner, VOD, "
                "Team1, Team2, "
                "Team1Picks, Team1Bans, Team1Kills, Team1Gold, Team1Towers, Team1Dragons, Team1Barons, Team1RiftHeralds, "
                "Team2Picks, Team2Bans, Team2Kills, Team2Gold, Team2Towers, Team2Dragons, Team2Barons, Team2RiftHeralds, "
                "RiotPlatformId, RiotPlatformGameId"
            ),
            where=f"OverviewPage='{overview_page}'",
        )
        time.sleep(1)

        created, updated = 0, 0
        for row in data:
            match_id = row.get("MatchId", "")
            game_id = row.get("GameId", "")

            try:
                match = Match.objects.get(match_id=match_id)
            except Match.DoesNotExist:
                self.stderr.write(self.style.ERROR(f"Match not found: {match_id}"))
                continue

            game_number = safe_int(game_id.rsplit("_", 1)[-1], 1)

            game, was_created = Game.objects.update_or_create(
                game_id=game_id,
                defaults={
                    "match": match,
                    "game_number": game_number,
                    "datetime_utc": parse_utc_datetime(row.get("DateTime UTC", "")),
                    "patch": row.get("Patch", ""),
                    "gamelength": row.get("Gamelength", ""),
                    "winner": safe_int(row.get("Winner"), None),
                    "vod": row.get("VOD", ""),
                    "team1": row.get("Team1", ""),
                    "team1_kills": safe_int(row.get("Team1Kills")),
                    "team1_gold": safe_int(row.get("Team1Gold")),
                    "team1_towers": safe_int(row.get("Team1Towers")),
                    "team1_dragons": safe_int(row.get("Team1Dragons")),
                    "team1_barons": safe_int(row.get("Team1Barons")),
                    "team1_rift_heralds": safe_int(row.get("Team1RiftHeralds")),
                    "riot_platform_id": row.get("RiotPlatformId", ""),
                    "riot_platform_game_id": row.get("RiotPlatformGameId", ""),
                    "team2": row.get("Team2", ""),
                    "team2_kills": safe_int(row.get("Team2Kills")),
                    "team2_gold": safe_int(row.get("Team2Gold")),
                    "team2_towers": safe_int(row.get("Team2Towers")),
                    "team2_dragons": safe_int(row.get("Team2Dragons")),
                    "team2_barons": safe_int(row.get("Team2Barons")),
                    "team2_rift_heralds": safe_int(row.get("Team2RiftHeralds")),
                },
            )

            # M2M fields must be set after save
            game.team1_picks.set(self.find_champions(row.get("Team1Picks", "")))
            game.team1_bans.set(self.find_champions(row.get("Team1Bans", "")))
            game.team2_picks.set(self.find_champions(row.get("Team2Picks", "")))
            game.team2_bans.set(self.find_champions(row.get("Team2Bans", "")))

            # Log unmatched champions
            for field in ["Team1Picks", "Team1Bans", "Team2Picks", "Team2Bans"]:
                for name in parse_csv(row.get(field, "")):
                    if not self.find_champion(name):
                        self.stderr.write(self.style.WARNING(f"  ⚠ Champion not found: '{name}'"))

            created += 1 if was_created else 0
            updated += 0 if was_created else 1

        self.stdout.write(self.style.SUCCESS(f"Games — created: {created}, updated: {updated}"))

    # ── Player Performances ────────────────────────────────────

    def sync_player_performances(self, site, overview_page):
        self.stdout.write("\n--- Player Performances ---")
        data = site.cargo_client.query(
            tables="ScoreboardPlayers",
            fields=(
                "GameId, Name, Link, Team, Side, Role, Champion, "
                "Kills, Deaths, Assists, CS, Gold, DamageToChampions, "
                "Items, Trinket, SummonerSpells, KeystoneRune, Runes"
            ),
            where=f"OverviewPage='{overview_page}'",
        )
        time.sleep(1)

        created, updated = 0, 0
        for row in data:
            game_id = row.get("GameId", "")
            try:
                game = Game.objects.get(game_id=game_id)
            except Game.DoesNotExist:
                self.stderr.write(self.style.ERROR(f"Game not found: {game_id}"))
                continue

            # Parse summoner spells (e.g. "Barrier,Flash")
            spells = parse_csv(row.get("SummonerSpells", ""))
            spell_d = self.find_spell(spells[0]) if len(spells) > 0 else None
            spell_f = self.find_spell(spells[1]) if len(spells) > 1 else None

            # Parse keystone
            keystone = self.find_rune(row.get("KeystoneRune", ""))

            # Parse champion
            champion = self.find_champion(row.get("Champion", ""))

            # Parse trinket as an Item
            trinket = self.find_item(row.get("Trinket", ""))

            perf, was_created = PlayerPerformance.objects.update_or_create(
                game=game,
                name=row.get("Name", ""),
                team=row.get("Team", ""),
                defaults={
                    "link": row.get("Link", ""),
                    "side": safe_int(row.get("Side"), 1),
                    "role": row.get("Role", ""),
                    "champion": champion,
                    "kills": safe_int(row.get("Kills")),
                    "deaths": safe_int(row.get("Deaths")),
                    "assists": safe_int(row.get("Assists")),
                    "cs": safe_int(row.get("CS")),
                    "gold": safe_int(row.get("Gold")),
                    "damage_to_champions": safe_int(row.get("DamageToChampions")),
                    "trinket": trinket,
                    "summoner_spell_d": spell_d,
                    "summoner_spell_f": spell_f,
                    "keystone_rune": keystone,
                },
            )

            # M2M: items (semicolon-separated, with empty slots)
            items_raw = row.get("Items", "")
            item_names = [i.strip() for i in items_raw.split(";") if i.strip()]
            items = [obj for name in item_names if (obj := self.find_item(name))]
            perf.items.set(items)

            # M2M: runes (comma-separated)
            rune_names = parse_csv(row.get("Runes", ""))
            runes = [obj for name in rune_names if (obj := self.find_rune(name))]
            perf.runes.set(runes)

            # Log unmatched
            if not champion:
                self.stderr.write(self.style.WARNING(f"  ⚠ Champion not found: '{row.get('Champion')}'"))
            for name in item_names:
                if not self.find_item(name):
                    self.stderr.write(self.style.WARNING(f"  ⚠ Item not found: '{name}'"))
            for name in rune_names:
                if not self.find_rune(name):
                    self.stderr.write(self.style.WARNING(f"  ⚠ Rune not found: '{name}'"))

            created += 1 if was_created else 0
            updated += 0 if was_created else 1

        self.stdout.write(self.style.SUCCESS(
            f"Player Performances — created: {created}, updated: {updated}"
        ))