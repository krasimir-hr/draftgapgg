from mwrogue.esports_client import EsportsClient
from mwrogue.auth_credentials import AuthCredentials

username = 'Witcher303!@draftgap-fanmade'
password = '73dc4l60kdq8a00o617fefvne7vpnr66'

credentials = AuthCredentials(username=username, password=password)
site = EsportsClient('lol', credentials=credentials)

# Check all available fields on TeamRedirects
print("=== TeamRedirects FIELDS ===")
for field in ["AllName", "OtherName", "UniqueLine", "OverviewPage", "Team", "Page", "FinalName"]:
    try:
        result = site.cargo_client.query(
            tables="TeamRedirects",
            fields=field,
            where="AllName = 'DRX' OR AllName = 'DN Freecs' OR AllName LIKE 'DN%'",
            limit=5
        )
        print(f"  ✅ {field}: {result}")
    except:
        print(f"  ❌ {field}: DOES NOT EXIST")

# Check what TeamRedirects has for DN Freecs / DN SOOPers
print("\n=== DN Freecs / SOOPers redirects ===")
result = site.cargo_client.query(
    tables="TeamRedirects",
    fields="AllName, OtherName, UniqueLine",
    where="AllName LIKE 'DN%' OR AllName LIKE 'Freecs%' OR AllName LIKE 'SOOP%'",
    limit=20
)
for r in result:
    print(r)

# Test: Can we join TeamRedirects to Teams via OverviewPage?
print("\n=== Join TR -> TeamRedirects -> Teams via OverviewPage ===")
try:
    result = site.cargo_client.query(
        tables="TournamentRosters=TR, TeamRedirects=Red, Teams=TM",
        fields="TR.OverviewPage, TR.Team, TM.Name, TM.Short, TM.Region, TM.OverviewPage=TeamOverviewPage, Red.AllName",
        where="TR.Team LIKE 'LYON%2024%' OR TR.Team LIKE 'DN%Freecs%'",
        join_on="TR.Team=Red.AllName, Red.AllName=TM.OverviewPage",
        limit=10
    )
    for r in result:
        print(r)
except Exception as e:
    print(f"Error: {e}")