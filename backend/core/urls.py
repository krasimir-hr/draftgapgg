from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import (
    LeagueViewSet, EventViewSet, OrganizationViewSet, PlayerViewSet,
    TeamRosterViewSet, MatchViewSet, GameViewSet, PlayerPerformanceViewSet,
    OverviewView, HomeMatchesView, HomeStandingsView, PlayerProfileView, TeamProfileView,
    ChampionStatsView, ChampionProfileView,
)

router = DefaultRouter()
router.register('leagues', LeagueViewSet, basename='league')
router.register('events', EventViewSet, basename='event')
router.register('organizations', OrganizationViewSet, basename='organization')
router.register('players', PlayerViewSet, basename='player')
router.register('rosters', TeamRosterViewSet, basename='roster')
router.register('matches', MatchViewSet, basename='match')
router.register('games', GameViewSet, basename='game')
router.register('performances', PlayerPerformanceViewSet, basename='performance')

urlpatterns = router.urls + [
    path('overview/', OverviewView.as_view()),
    path('home-matches/', HomeMatchesView.as_view(), name='home-matches'),
    path('home-standings/', HomeStandingsView.as_view(), name='home-standings'),
    path('champion-stats/', ChampionStatsView.as_view(), name='champion-stats'),
    path('champions/profile/<int:pk>/', ChampionProfileView.as_view(), name='champion-profile'),
    path('players/profile/<str:name>/', PlayerProfileView.as_view(), name='player-profile'),
    path('teams/profile/<str:name>/', TeamProfileView.as_view(), name='team-profile'),
]