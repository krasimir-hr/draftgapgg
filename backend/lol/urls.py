from rest_framework.routers import DefaultRouter
from .views import ChampionViewSet, ItemViewSet, RunePathViewSet, SummonerSpellViewSet

router = DefaultRouter()
router.register('champions', ChampionViewSet, basename='champion')
router.register('items', ItemViewSet, basename='item')
router.register('rune-paths', RunePathViewSet, basename='runepath')
router.register('summoner-spells', SummonerSpellViewSet, basename='summonerspell')

urlpatterns = router.urls
