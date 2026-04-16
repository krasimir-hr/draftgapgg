# from mwrogue.esports_client import EsportsClient
# from mwrogue.auth_credentials import AuthCredentials

# username = 'Witcher303!@draftgap-fanmade'
# password = '73dc4l60kdq8a00o617fefvne7vpnr66'

# credentials = AuthCredentials(username=username, password=password)
# site = EsportsClient('lol', credentials=credentials)

# # --- Step 1: Get all official primary events from 2025 onward ---
# event_data = site.cargo_client.query(
#     tables="MatchSchedule",
#     fields="MatchId, Team1, Team2, BestOf, Tab, Winner",
#     where="OverviewPage='LCK/2026 Season/Rounds 1-2'",
#     limit=500
# )

# for event in event_data:
#     print(event)




# #### MATCH SCHEDULE

# for match in event_data:
#     id = match.get('MatchId')
#     team1 = match.get('Team1')
#     team2 = match.get('Team2')
#     best_of = match.get('BestOf')
#     stage = match.get('Tab')
#     try:
#         winner = match.get('Winner')
#     except:
#         winner = 'TBD'
#     print(f'{team1} vs {team2} - {winner}')
##################################################



# events = [e["OverviewPage"] for e in event_data if e.get("OverviewPage")]

# print(f"Found {len(events)} events from 2025 onward:")
# for e in event_data:
#     print(f"  - [{e.get('Region', 'N/A')}] {e.get('Name')} ({e.get('DateStart')})")
# print()

# # --- Step 2: Query teams + rosters in batches ---
# BATCH_SIZE = 20

# all_teams = []
# all_rosters = []

# for i in range(0, len(events), BATCH_SIZE):
#     batch = events[i:i + BATCH_SIZE]
#     where_clause = " OR ".join(f'TR.OverviewPage="{e}"' for e in batch)

#     teams = site.cargo_client.query(
#         tables="TournamentRosters=TR, Teams=TM, PageRedirects=PR",
#         fields="TR.OverviewPage, TR.Team, TM.Short, TM.Region, TM.OverviewPage=TeamOverviewPage",
#         where=where_clause,
#         join_on="TR.Team=TM.Name",
#         limit=500
#     )
#     all_teams.extend(teams)

#     rosters = site.cargo_client.query(
#         tables="TournamentRosters=TR",
#         fields="TR.OverviewPage, TR.Team, TR.RosterLinks, TR.Roles",
#         where=where_clause,
#         limit=500
#     )
#     all_rosters.extend(rosters)

# # --- Step 3: Print teams ---
# print(f"Found {len(all_teams)} teams across all events:\n")
# for team in all_teams:
#     print(f"[{team.get('Region', 'N/A')}] {team.get('Team')} ({team.get('Short', '')}) — {team.get('OverviewPage')} - {team.get('TeamOverviewPage')}")

# print()

# # --- Step 4: Print rosters ---
# print("=== ROSTERS ===\n")
# for roster in all_rosters:
#     event = roster.get("OverviewPage", "")
#     team = roster.get("Team", "")
#     players = roster.get("RosterLinks", "")
#     roles = roster.get("Roles", "")

#     player_list = [p.strip() for p in players.split(";;") if p.strip()] if players else []
#     role_list = [r.strip() for r in roles.split(";;") if r.strip()] if roles else []

#     print(f"📌 {team} — {event}")
#     for player, role in zip(player_list, role_list):
#         print(f"   {role}: {player}")
#     for player in player_list[len(role_list):]:
#         print(f"   Sub: {player}")
#     print()

from mwrogue.esports_client import EsportsClient
from mwrogue.auth_credentials import AuthCredentials

username = 'Witcher303!@draftgap-fanmade'
password = '73dc4l60kdq8a00o617fefvne7vpnr66'

credentials = AuthCredentials(username=username, password=password)
site = EsportsClient('lol', credentials=credentials)

print("=== Finding player name field ===")
for field in ["Name", "Link", "PlayerName", "PlayerLink", "Summoner", "IGN", "IngameRole", "GameTeamId"]:
    try:
        result = site.cargo_client.query(
            tables="ScoreboardPlayers",
            fields=field,
            where="OverviewPage='LCK/2026 Season/Rounds 1-2'",
            limit=1
        )
        print(f"  ✅ {field}: {result}")
    except:
        print(f"  ❌ {field}")

# Also check GameTime alternatives on ScoreboardGames
print("\n=== Finding game time field ===")
for field in ["Gamelength", "GameLength", "Duration", "Length", "Gametime"]:
    try:
        result = site.cargo_client.query(
            tables="ScoreboardGames",
            fields=field,
            where="OverviewPage='LCK/2026 Season/Rounds 1-2'",
            limit=1
        )
        print(f"  ✅ {field}: {result}")
    except:
        print(f"  ❌ {field}")