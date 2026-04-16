from rest_framework import viewsets, mixins
from rest_framework.permissions import AllowAny

from .models import (League, Event, Organization, Player, TeamRoster,
                     Match, Game, PlayerPerformance)
from .serializers import (
    LeagueSerializer,
    EventListSerializer,
    OrganizationSerializer,
    PlayerSerializer,
    TeamRosterListSerializer, TeamRosterDetailSerializer,
    MatchListSerializer, MatchDetailSerializer,
    GameListSerializer, GameDetailSerializer,
    PlayerPerformanceCompactSerializer, PlayerPerformanceSerializer,
)


class ReadOnlyModelViewSet(
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [AllowAny]


class LeagueViewSet(ReadOnlyModelViewSet):
    queryset = League.objects.all().order_by('name')
    serializer_class = LeagueSerializer


class EventViewSet(ReadOnlyModelViewSet):
    queryset = (
        Event.objects
        .select_related('league')
        .order_by('-start_date')
    )
    serializer_class = EventListSerializer
    filterset_fields = ['league', 'is_active', 'year']


class OrganizationViewSet(ReadOnlyModelViewSet):
    queryset = Organization.objects.all().order_by('name')
    serializer_class = OrganizationSerializer


class PlayerViewSet(ReadOnlyModelViewSet):
    queryset = Player.objects.all().order_by('name')
    serializer_class = PlayerSerializer


class TeamRosterViewSet(ReadOnlyModelViewSet):
    def get_queryset(self):
        qs = TeamRoster.objects.select_related('org').order_by('id')
        if self.action == 'retrieve':
            qs = qs.select_related('event', 'event__league').prefetch_related(
                'players__player',
            )
        return qs

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return TeamRosterDetailSerializer
        return TeamRosterListSerializer


class MatchViewSet(ReadOnlyModelViewSet):
    def get_queryset(self):
        qs = Match.objects.all().order_by('-datetime_utc')
        if self.action == 'retrieve':
            qs = qs.select_related('event', 'event__league').prefetch_related('games')
        return qs

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return MatchDetailSerializer
        return MatchListSerializer

    filterset_fields = ['event', 'team1', 'team2']


class GameViewSet(ReadOnlyModelViewSet):
    def get_queryset(self):
        qs = Game.objects.select_related('match').order_by('-datetime_utc')
        if self.action == 'retrieve':
            qs = qs.prefetch_related(
                'team1_picks', 'team1_bans',
                'team2_picks', 'team2_bans',
                'performances__champion',
                'performances__items',
                'performances__trinket',
                'performances__summoner_spell_d',
                'performances__summoner_spell_f',
                'performances__keystone_rune',
                'performances__runes',
            )
        return qs

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return GameDetailSerializer
        return GameListSerializer

    filterset_fields = ['match', 'team1', 'team2']


class PlayerPerformanceViewSet(ReadOnlyModelViewSet):
    def get_queryset(self):
        qs = PlayerPerformance.objects.select_related('champion').order_by('id')
        if self.action == 'retrieve':
            qs = qs.select_related(
                'trinket', 'summoner_spell_d', 'summoner_spell_f',
                'keystone_rune',
            ).prefetch_related('items', 'runes')
        return qs

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return PlayerPerformanceSerializer
        return PlayerPerformanceCompactSerializer

    filterset_fields = ['game', 'team', 'name', 'role']
