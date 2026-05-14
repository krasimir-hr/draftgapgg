from django.core.management.base import BaseCommand
from mwrogue.esports_client import EsportsClient
from mwrogue.auth_credentials import AuthCredentials
from core.models import Event, League, Organization, Player, TeamRoster, RosterPlayer
import os
from django.utils import timezone
from datetime import datetime

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

    def handle(self, *args, **options):
        username = 'Witcher303!@draftgap-fanmade'
        password = '73dc4l60kdq8a00o617fefvne7vpnr66'

        credentials = AuthCredentials(username=username, password=password)
        site = EsportsClient('lol', credentials=credentials)


        # --- Step 1: Get all official primary events from 2025 onward ---
        event_data = site.cargo_client.query(
            tables="Tournaments",
            fields="Name, Region, DateStart, Date, OverviewPage, League, TournamentLevel, IsOfficial",
            where="TournamentLevel = 'Primary' AND IsOfficial = '1' AND DateStart >= '2025-01-01'",
            limit=500
        )

        events = [e["OverviewPage"] for e in event_data if e.get("OverviewPage")]

        leagues_created_count = 0
        leagues_updated_count = 0

        events_created_count = 0
        events_updated_count = 0



        for data in event_data:
            overview_page = data.get('OverviewPage')
            short_name = ''
            year = ''
            
            if 'Season Opening' in overview_page:
                continue
            elif 'First Stand' in overview_page or 'Mid-Season' in overview_page:
                league_data = overview_page.split(' ')
                short_name = f'{league_data[1]} {league_data[2]}'
                year = league_data[0]
            elif 'World Championship' in overview_page:
                league_data = overview_page.split('/')[0]
                short_name = 'Worlds'
                year = league_data.split(' ')[0]
            else:
                league_data = overview_page.split('/')
                short_name = league_data[0]
                year = league_data[1].split(' ')[0]

            league_name = LEAGUE_REDIRECTS.get(data.get("League", ""), data.get("League", ""))
            league, _ = League.objects.get_or_create(
                name=league_name,
                defaults={
                    "short_name": short_name,
                }
            )

            start_date = datetime.strptime(data.get("DateStart"), "%Y-%m-%d").date()
            end_date = datetime.strptime(data.get("Date"), "%Y-%m-%d").date()

            is_active = start_date <= timezone.now().date() <= end_date

            event, event_created = Event.objects.update_or_create(
                leaguepedia_page=data.get("OverviewPage"),
                create_defaults={
                    "name": data.get("Name", ""),
                },
                defaults={
                    "league": league,
                    "start_date": data.get("DateStart") or None,
                    "end_date": data.get("Date") or None,
                    "is_active": is_active,
                    "year": int(year),
                }
            )

        BATCH_SIZE = 20

        all_teams = []
        all_rosters = []



        for i in range(0, len(events), BATCH_SIZE):
            batch = events[i:i + BATCH_SIZE]
            where_clause = " OR ".join(f'TR.OverviewPage="{e}"' for e in batch)

            teams = site.cargo_client.query(
                tables="TournamentRosters=TR, Teams=TM",
                fields="TR.OverviewPage, TR.Team, TM.Short, TM.Region, TM.OverviewPage=TeamOverviewPage, ",
                where=where_clause,
                join_on="TR.Team=TM.OverviewPage",
                limit=500
            )
            all_teams.extend(teams)

            rosters = site.cargo_client.query(
                tables="TournamentRosters=TR",
                fields="TR.OverviewPage, TR.Team, TR.RosterLinks, TR.Roles, TR.Flags",
                where=where_clause,
                limit=500
            )
            all_rosters.extend(rosters)
    
        for team_data in all_teams:

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
                event = Event.objects.get(leaguepedia_page=team_data.get("OverviewPage"))
            except Event.DoesNotExist:
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
            try:
                event = Event.objects.get(leaguepedia_page=roster_data.get("OverviewPage"))
            except Event.DoesNotExist:
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

            player_list = [p.strip() for p in players.split(";;") if p.strip()] if players else []
            role_list = [r.strip() for r in roles.split(";;") if r.strip()] if roles else []
            flag_list = [f.strip() for f in flags.split(";;") if f.strip()] if roles else []

            for lp_page, role, flag in zip(player_list, role_list, flag_list):
                display_name = lp_page.split('(')[0].strip()

                player, _ = Player.objects.update_or_create(
                    leaguepedia_page=lp_page,
                    defaults={
                        "name": display_name,
                        "nationality": flag,
                    }
                )

                roster_player, _ = RosterPlayer.objects.get_or_create(
                    roster=team_roster,
                    player=player,
                    defaults={
                        "role": role,
                    }
                )

            


