from django.contrib import admin
from .models import League, Event, EventStage, Organization, Player, TeamRoster, RosterPlayer, Match, Game, PlayerPerformance


class MatchLeagueFilter(admin.SimpleListFilter):
    title = 'League'
    parameter_name = 'league'

    def lookups(self, request, model_admin):
        leagues = League.objects.filter(events__matches__isnull=False).distinct().order_by('short_name')
        return [(l.pk, l.short_name) for l in leagues]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(event__league_id=self.value())
        return queryset


class MatchYearFilter(admin.SimpleListFilter):
    title = 'Year'
    parameter_name = 'year'

    def lookups(self, request, model_admin):
        qs = Event.objects.filter(matches__isnull=False)
        league_id = request.GET.get('league')
        if league_id:
            qs = qs.filter(league_id=league_id)
        years = qs.values_list('year', flat=True).distinct().order_by('-year')
        return [(y, str(y)) for y in years if y is not None]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(event__year=self.value())
        return queryset


class MatchEventFilter(admin.SimpleListFilter):
    title = 'Event'
    parameter_name = 'event'

    def lookups(self, request, model_admin):
        qs = Event.objects.filter(matches__isnull=False).distinct()
        league_id = request.GET.get('league')
        year = request.GET.get('year')
        if league_id:
            qs = qs.filter(league_id=league_id)
        if year:
            qs = qs.filter(year=year)
        return [(e.pk, e.name) for e in qs.order_by('-start_date')]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(event_id=self.value())
        return queryset

@admin.register(League)
class LeagueAdmin(admin.ModelAdmin):
    list_display = ["short_name"]

@admin.register(Event)
class SeasonAdmin(admin.ModelAdmin):
    list_display = ("name", "league__short_name", "start_date", "is_active")
    list_filter = ("league__short_name", "is_active", "year")
    search_fields = ("league", "league__name")

@admin.register(EventStage)
class EventStageAdmin(admin.ModelAdmin):
    list_display = ("name", "event", "type", "has_lower_bracket", "order")
    list_filter = ("type", "has_lower_bracket", "event__league")
    search_fields = ("name", "event__name")


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
    list_display = ("team1", "team2", "event", "stage", "is_lower_bracket", "datetime_utc")
    list_filter = [MatchLeagueFilter, MatchYearFilter, MatchEventFilter, "stage__type", "is_lower_bracket"]

@admin.register(Game)
class GameAdmin(admin.ModelAdmin):
    pass

@admin.register(PlayerPerformance)
class PlayerPerformanceAdmin(admin.ModelAdmin):
    pass
