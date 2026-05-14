import django_filters
from .models import Match


class MatchFilter(django_filters.FilterSet):
    has_result = django_filters.BooleanFilter(method='filter_has_result')

    def filter_has_result(self, queryset, name, value):
        if value:
            return queryset.exclude(winner__isnull=True)
        return queryset.filter(winner__isnull=True)

    class Meta:
        model = Match
        fields = ['event', 'team1', 'team2']
