from rest_framework.routers import DefaultRouter
from .views import (
    LeagueViewSet, EventViewSet, OrganizationViewSet, PlayerViewSet,
    TeamRosterViewSet, MatchViewSet, GameViewSet, PlayerPerformanceViewSet,
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

urlpatterns = router.urls