from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from mwrogue.esports_client import EsportsClient
from mwrogue.auth_credentials import AuthCredentials
from core.models import Event, EventStage, League, Organization, Player, TeamRoster, RosterPlayer
from django.utils import timezone
from datetime import datetime
from itertools import zip_longest
import re

# Page name suffixes that mark a child stage rather than a standalone event.
# Maps suffix → (stage name, stage type, display order within the parent event).
CHILD_STAGE_SUFFIXES = {
    ' Playoffs':          ('Playoffs',          'playoff', 3),
    ' Placements':        ('Placements',        'league',  2),
    ' Qualifying Series': ('Qualifying Series', 'play_in', 0),
}

# Leaguepedia league name → our canonical league name.
# Events whose Leaguepedia League field matches a key are assigned to the
# value league instead. Add entries here whenever a league is renamed or
# merged without changing the Leaguepedia source data.
LEAGUE_REDIRECTS = {
    "League of Legends Championship of The Americas North": "League of Legends Championship Series",
    "League of Legends Championship of The Americas South": "Circuit Brazilian League of Legends",
}


class Command(BaseCommand):
    help = 'Syncs events data from Leaguepedia.'

    def add_arguments(self, parser):
        parser.add_argument('--year', type=int, help='Import a single year (default: 2025 onward).')

    def handle(self, *args, **options):
        if not settings.LEAGUEPEDIA_USERNAME or not settings.LEAGUEPEDIA_PASSWORD:
            raise CommandError('Set LEAGUEPEDIA_USERNAME and LEAGUEPEDIA_PASSWORD in backend/.env before syncing.')
        credentials = AuthCredentials(
            username=settings.LEAGUEPEDIA_USERNAME,
            password=settings.LEAGUEPEDIA_PASSWORD,
        )
        site = EsportsClient('lol', credentials=credentials)


        # --- Step 1: Get all official primary events from 2025 onward ---
        # EWC is IsOfficial='0' in Leaguepedia despite being a major international
        # tournament, so we include it via an explicit League filter.
        date_filter = (f"DateStart >= '{options['year']}-01-01' AND DateStart < '{options['year'] + 1}-01-01'"
                       if options.get('year') else "DateStart >= '2025-01-01'")
        event_data = site.cargo_client.query(
            tables="Tournaments",
            fields="Name, Region, DateStart, Date, OverviewPage, League, TournamentLevel, IsOfficial, Prizepool",
            where=f"TournamentLevel = 'Primary' AND (IsOfficial = '1' OR League = 'Esports World Cup') AND {date_filter}",
            order_by="DateStart, OverviewPage"
        )

        events = [e["OverviewPage"] for e in event_data if e.get("OverviewPage")]

        for data in event_data:
            overview_page = data.get('OverviewPage')
            if not overview_page:
                continue
            short_name = ''
            year = ''

            if 'Season Opening' in overview_page:
                continue
            elif 'Online Qualifier' in overview_page or 'Online Qualifiers' in overview_page:
                continue

            # --- Child-stage detection ---
            # If this page is a child of another event (e.g. "LPL/2026 Season/Split 2 Playoffs"),
            # create/update an EventStage on the parent instead of a standalone Event.
            child_stage_match = None
            for suffix, (stage_name, stage_type, stage_order) in CHILD_STAGE_SUFFIXES.items():
                if overview_page.endswith(suffix):
                    child_stage_match = (suffix, stage_name, stage_type, stage_order)
                    break

            if child_stage_match:
                suffix, stage_name, stage_type, stage_order = child_stage_match
                # Derive parent page by stripping the suffix from the last path segment.
                parent_page = overview_page[: -len(suffix)]
                parent_event = Event.objects.filter(leaguepedia_page=parent_page).first()
                if parent_event:
                    # Ensure parent has a Regular Season stage.
                    EventStage.objects.get_or_create(
                        event=parent_event, name='Regular Season',
                        defaults={'type': 'league', 'order': 1},
                    )
                    EventStage.objects.update_or_create(
                        event=parent_event, name=stage_name,
                        defaults={
                            'type': stage_type,
                            'order': stage_order,
                            'leaguepedia_page': overview_page,
                        },
                    )
                    self.stdout.write(f"  Stage {stage_name!r} → {parent_event.name!r}")
                else:
                    self.stdout.write(self.style.WARNING(
                        f"  ⚠ Parent event not found for {overview_page!r} (expected {parent_page!r})"
                        " — creating standalone event as fallback."
                    ))
                    # Fall through to normal event creation below.
                    child_stage_match = None

            if child_stage_match:
                continue  # Successfully handled as a stage; skip standalone event creation.

            elif 'Esports World Cup' in overview_page and '/' not in overview_page:
                year = overview_page.split(' ')[-1]
                short_name = 'EWC'
            elif 'First Stand' in overview_page or 'Mid-Season' in overview_page:
                short_name = 'MSI' if 'Mid-Season' in overview_page else 'First Stand'
                year = overview_page.split(' ')[0]
            elif 'World Championship' in overview_page:
                league_data = overview_page.split('/')[0]
                short_name = 'Worlds'
                year = league_data.split(' ')[0]
            else:
                league_data = overview_page.split('/')
                short_name = league_data[0]
                year_match = re.search(r'\b(20\d{2})\b', overview_page)
                if not year_match:
                    self.stdout.write(self.style.WARNING(f'No year found: {overview_page}; skipping.'))
                    continue
                year = year_match.group(1)

            league_name = LEAGUE_REDIRECTS.get(data.get("League", ""), data.get("League", ""))
            # Regional Worlds qualifiers remain in their regional league. Cargo
            # sometimes tags them World Championship before the actual Worlds event.
            if league_name == 'World Championship' and '/' in overview_page and 'World Championship' not in overview_page:
                regional = League.objects.filter(short_name=short_name).first()
                if regional:
                    league_name = regional.name
            league, _ = League.objects.update_or_create(
                name=league_name,
                defaults={
                    "short_name": short_name,
                }
            )

            # Future events often do not have a final date yet.
            start_date = datetime.strptime(data['DateStart'], '%Y-%m-%d').date() if data.get('DateStart') else None
            end_date = datetime.strptime(data['Date'], '%Y-%m-%d').date() if data.get('Date') else None
            is_active = bool(start_date and end_date and start_date <= timezone.now().date() <= end_date)

            event, event_created = Event.objects.update_or_create(
                leaguepedia_page=data.get("OverviewPage"),
                defaults={
                    "name": data.get("Name", ""),
                    "league": league,
                    "start_date": data.get("DateStart") or None,
                    "end_date": data.get("Date") or None,
                    "is_active": is_active,
                    "year": int(year),
                    "prize_pool": (data.get("Prizepool") or "").strip(),
                }
            )

        # Fold each "Road to MSI" event into its "Rounds 1-2" parent as a stage.
        # Road to MSI lives on its own Leaguepedia page, but for us it's a stage
        # of the Rounds 1-2 tournament (its parent can't be derived by stripping a
        # suffix — they differ in the last path segment — so it's handled here
        # rather than via CHILD_STAGE_SUFFIXES). We attach a "Road to MSI" stage
        # to the parent pointing at the Road to MSI page (so sync_matches pulls
        # its matches straight into the parent under that stage), migrate any
        # already-synced matches over, propagate the end date, and drop the now
        # redundant standalone event.
        today = timezone.now().date()
        for road_to_msi in Event.objects.filter(name__icontains='Road to MSI'):
            parent = Event.objects.filter(
                league=road_to_msi.league,
                year=road_to_msi.year,
                name__icontains='Rounds 1-2',
            ).first()
            if not parent:
                continue

            # Parent's own matches belong to a Regular Season stage.
            rs_stage, _ = EventStage.objects.get_or_create(
                event=parent, name='Regular Season',
                defaults={'type': 'league', 'order': 1},
            )
            parent.matches.filter(stage__isnull=True).update(stage=rs_stage)

            # The Road to MSI stage, sourced from the Road to MSI page.
            rtm_stage, _ = EventStage.objects.update_or_create(
                event=parent, name='Road to MSI',
                defaults={
                    'type': 'playoff',
                    'order': 4,
                    'leaguepedia_page': road_to_msi.leaguepedia_page,
                },
            )

            # Move any matches already synced under the standalone event.
            road_to_msi.matches.update(event=parent, stage=rtm_stage)

            # Propagate end date / active state onto the parent.
            if road_to_msi.end_date and (not parent.end_date or road_to_msi.end_date > parent.end_date):
                parent.end_date = road_to_msi.end_date
            if parent.start_date and parent.end_date:
                parent.is_active = parent.start_date <= today <= parent.end_date
            parent.save(update_fields=['end_date', 'is_active'])

            # The standalone event is now redundant — its matches live on the parent.
            road_to_msi.delete()

        # Resolve child-page rosters to the parent that owns their matches.
        event_by_page = {event.leaguepedia_page: event for event in Event.objects.all()}
        event_by_page.update({stage.leaguepedia_page: stage.event for stage in
                             EventStage.objects.exclude(leaguepedia_page__isnull=True)
                             .exclude(leaguepedia_page='').select_related('event')})
        events = [page for page in events if page in event_by_page]
        BATCH_SIZE = 20

        all_teams = []
        all_rosters = []



        for i in range(0, len(events), BATCH_SIZE):
            batch = events[i:i + BATCH_SIZE]
            where_clause = " OR ".join(f'TR.OverviewPage="{e}"' for e in batch)

            teams = site.cargo_client.query(
                tables="TournamentRosters=TR, Teams=TM",
                fields="TR.OverviewPage, TR.Team, TM.Short, TM.Region, TM.OverviewPage=TeamOverviewPage",
                where=where_clause,
                join_on="TR.Team=TM.OverviewPage",
            )
            all_teams.extend(teams)

            rosters = site.cargo_client.query(
                tables="TournamentRosters=TR",
                fields="TR.OverviewPage, TR.Team, TR.RosterLinks, TR.Roles, TR.Flags",
                where=where_clause,
            )
            all_rosters.extend(rosters)
    
        for team_data in all_teams:
            if team_data.get("Team") == "TBD":
                continue

            ### -- Orgs creation -- ###
            org, org_created = Organization.objects.update_or_create(
                leaguepedia_page=team_data.get("TeamOverviewPage"),
                    defaults={
                        "name": team_data.get("Team", ""),
                        "short_name": team_data.get("Short", ""),
                        "region": team_data.get("Region", ""),
                    }
            )

            ### -- Team Rosters creation -- ###

            try:
                event = event_by_page[team_data.get("OverviewPage")]
            except KeyError:
                self.stdout.write(self.style.ERROR(
                    f"Event not found for: {team_data.get('OverviewPage')} — skipping roster"
                ))
                continue
            
            if org.name == "TBD":
                continue

            team_roster, team_roster_created = TeamRoster.objects.update_or_create(
                name=team_data.get("Team"),
                event=event,
                    defaults={
                        "org": org,
                    }
            )

        for roster_data in all_rosters:
            if roster_data.get("Team") == "TBD":
                continue
            try:
                event = event_by_page[roster_data.get("OverviewPage")]
            except KeyError:
                self.stdout.write(self.style.ERROR(
                    f"Event not found for: {roster_data.get('OverviewPage')} — skipping player."
                ))
                continue

            try:
                team_roster = TeamRoster.objects.get(
                    name=roster_data.get("Team"),
                    event=event,
                )
            except TeamRoster.DoesNotExist:
                self.stdout.write(self.style.ERROR(
                    f"Team not found for: {roster_data.get('Team')} — skipping player."
                ))
                continue

            players = roster_data.get("RosterLinks", "")
            roles = roster_data.get("Roles", "")
            flags = roster_data.get("Flags", "")

            player_list = [p.strip() for p in players.split(";;")] if players else []
            role_list = [r.strip() for r in roles.split(";;")] if roles else []
            flag_list = [f.strip() for f in flags.split(";;")] if flags else []

            for lp_page, role, flag in zip_longest(player_list, role_list, flag_list, fillvalue=""):
                if not lp_page:
                    continue
                display_name = lp_page.split('(')[0].strip()

                player, _ = Player.objects.update_or_create(
                    leaguepedia_page=lp_page,
                    defaults={
                        "name": display_name,
                        "nationality": flag,
                    }
                )

                roster_player, _ = RosterPlayer.objects.update_or_create(
                    roster=team_roster,
                    player=player,
                    defaults={
                        "role": role or "Sub",
                    }
                )

            


