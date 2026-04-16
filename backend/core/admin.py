from django.contrib import admin
from .models import League, Event, Organization, Player, TeamRoster, RosterPlayer, Match, Game, PlayerPerformance

@admin.register(League)
class LeagueAdmin(admin.ModelAdmin):
    list_display = ["short_name"]

@admin.register(Event)
class SeasonAdmin(admin.ModelAdmin):
    list_display = ("name", "league__short_name", "start_date", "is_active")
    list_filter = ("league__short_name", "is_active", "year")
    search_fields = ("league", "league__name")

@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("short_name", "name", "region", "leaguepedia_page")
    list_filter = ["region"]

@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    pass

@admin.register(TeamRoster)
class TeamRosterAdmin(admin.ModelAdmin):
    list_display = ("name", "org", "event")
    list_filter = ["org", "event"]

@admin.register(RosterPlayer)
class RosterPlayerAdmin(admin.ModelAdmin):
    list_display = ("player", "roster", "role")

@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = ("team1", "team2", "event", "datetime_utc")
    list_filter = ["event", "event__league"]

@admin.register(Game)
class GameAdmin(admin.ModelAdmin):
    pass

@admin.register(PlayerPerformance)
class PlayerPerformanceAdmin(admin.ModelAdmin):
    pass
