from rest_framework import viewsets, mixins
from rest_framework.permissions import AllowAny

from .models import Champion, Item, RunePath, SummonerSpell
from .serializers import (
    ChampionListSerializer, ChampionDetailSerializer,
    ItemSerializer,
    RunePathSerializer, RunePathListSerializer,
    SummonerSpellSerializer,
)


class ReadOnlyModelViewSet(
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """Base read-only viewset used for all static game-data endpoints."""
    permission_classes = [AllowAny]


class ChampionViewSet(ReadOnlyModelViewSet):
    def get_queryset(self):
        qs = Champion.objects.all().order_by('name')
        if self.action == 'retrieve':
            qs = qs.prefetch_related('abilities')
        return qs

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ChampionDetailSerializer
        return ChampionListSerializer


class ItemViewSet(ReadOnlyModelViewSet):
    queryset = Item.objects.all().order_by('name')
    serializer_class = ItemSerializer


class RunePathViewSet(ReadOnlyModelViewSet):
    def get_queryset(self):
        qs = RunePath.objects.all().order_by('name')
        if self.action == 'retrieve':
            qs = qs.prefetch_related('runes')
        return qs

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return RunePathSerializer
        return RunePathListSerializer


class SummonerSpellViewSet(ReadOnlyModelViewSet):
    queryset = SummonerSpell.objects.all().order_by('name')
    serializer_class = SummonerSpellSerializer
