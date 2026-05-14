from rest_framework import viewsets, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from rest_framework import status as drf_status
from django.db.models import Count, Q, Sum, Case, When, IntegerField, F
from django.utils import timezone

from .models import (League, Event, Organization, Player, TeamRoster,
                     RosterPlayer, Match, Game, PlayerPerformance)
from .filters import MatchFilter
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

    @action(detail=True, methods=['get'])
    def standings(self, request, pk=None):
        event = self.get_object()

        # Seed table from rostered teams (excludes TBD placeholders)
        rosters = (
            TeamRoster.objects
            .filter(event=event)
            .select_related('org')
            .exclude(name='TBD')
        )
        stats = {}
        team_logo = {}
        for roster in rosters:
            if not roster.name:
                continue
            stats.setdefault(roster.name, {'wins': 0, 'losses': 0, 'kills': 0})
            if roster.org and roster.org.logo:
                team_logo[roster.name] = request.build_absolute_uri(roster.org.logo.url)

        # Wins / losses from completed matches
        for match in Match.objects.filter(event=event).exclude(winner__isnull=True):
            for team in (match.team1, match.team2):
                stats.setdefault(team, {'wins': 0, 'losses': 0, 'kills': 0})
            if match.winner == 1:
                stats[match.team1]['wins'] += 1
                stats[match.team2]['losses'] += 1
            else:
                stats[match.team2]['wins'] += 1
                stats[match.team1]['losses'] += 1

        # Kills from games
        for game in Game.objects.filter(match__event=event):
            if game.team1 in stats:
                stats[game.team1]['kills'] += game.team1_kills
            if game.team2 in stats:
                stats[game.team2]['kills'] += game.team2_kills

        result = sorted(
            [{'team': t, 'logo': team_logo.get(t), **s} for t, s in stats.items()],
            key=lambda x: (-x['wins'], x['losses'], -x['kills']),
        )
        for i, entry in enumerate(result):
            entry['placement'] = i + 1

        return Response(result)

    @action(detail=True, methods=['get'])
    def players(self, request, pk=None):
        event = self.get_object()
        performances = (
            PlayerPerformance.objects
            .filter(game__match__event=event)
            .select_related('game')
        )

        stats = {}
        for p in performances:
            s = stats.setdefault(p.name, {
                'name': p.name,
                'team': p.team,
                'role': p.role,
                'link': p.link,
                'games': 0,
                'kills': 0,
                'deaths': 0,
                'assists': 0,
                'cs_per_min_sum': 0.0,
                'cs_per_min_count': 0,
            })
            s['team'] = p.team
            s['games'] += 1
            s['kills'] += p.kills
            s['deaths'] += p.deaths
            s['assists'] += p.assists

            gl = p.game.gamelength
            if gl and ':' in gl:
                try:
                    mm, ss = gl.split(':')
                    mins = int(mm) + int(ss) / 60
                    if mins > 0:
                        s['cs_per_min_sum'] += p.cs / mins
                        s['cs_per_min_count'] += 1
                except (ValueError, ZeroDivisionError):
                    pass

        if not stats:
            return Response([])

        player_info = {
            pl.name: {
                'image': request.build_absolute_uri(pl.image.url) if pl.image else None,
                'nationality': pl.nationality,
            }
            for pl in Player.objects.filter(name__in=list(stats.keys()))
        }

        result = []
        for s in stats.values():
            games = s['games']
            cpm_count = s['cs_per_min_count']
            info = player_info.get(s['name'], {})
            result.append({
                'name': s['name'],
                'team': s['team'],
                'role': s['role'],
                'link': s['link'],
                'image': info.get('image'),
                'nationality': info.get('nationality'),
                'games_played': games,
                'avg_kills': round(s['kills'] / games, 1),
                'avg_deaths': round(s['deaths'] / games, 1),
                'avg_assists': round(s['assists'] / games, 1),
                'avg_cs_per_min': round(s['cs_per_min_sum'] / cpm_count, 2) if cpm_count > 0 else None,
            })

        result.sort(key=lambda x: (-x['games_played'], -x['avg_kills']))
        for i, entry in enumerate(result):
            entry['placement'] = i + 1

        return Response(result)

    @action(detail=True, methods=['get'])
    def champions(self, request, pk=None):
        event = self.get_object()
        champ_data = {}

        # Picks and wins per role from PlayerPerformance (has role info)
        for perf in (PlayerPerformance.objects
                     .filter(game__match__event=event, champion__isnull=False)
                     .select_related('game', 'champion')):
            champ = perf.champion
            s = champ_data.setdefault(champ.id, {
                'id': champ.id, 'name': champ.name, 'icon_url': champ.icon_url(),
                'bans': 0, 'picks_by_role': {}, 'wins_by_role': {},
            })
            role = perf.role
            s['picks_by_role'][role] = s['picks_by_role'].get(role, 0) + 1
            if perf.side == perf.game.winner:
                s['wins_by_role'][role] = s['wins_by_role'].get(role, 0) + 1

        # Bans from Game M2M — total across all roles, unchanged by role filter
        for game in (Game.objects.filter(match__event=event)
                     .prefetch_related('team1_bans', 'team2_bans')):
            for champ in [*game.team1_bans.all(), *game.team2_bans.all()]:
                s = champ_data.setdefault(champ.id, {
                    'id': champ.id, 'name': champ.name, 'icon_url': champ.icon_url(),
                    'bans': 0, 'picks_by_role': {}, 'wins_by_role': {},
                })
                s['bans'] += 1

        result = sorted(
            champ_data.values(),
            key=lambda x: (-sum(x['picks_by_role'].values()), -x['bans']),
        )
        for i, entry in enumerate(result):
            entry['placement'] = i + 1

        return Response(result)


class OrganizationViewSet(ReadOnlyModelViewSet):
    queryset = Organization.objects.all().order_by('name')
    serializer_class = OrganizationSerializer


class PlayerViewSet(ReadOnlyModelViewSet):
    queryset = Player.objects.all().order_by('name')
    serializer_class = PlayerSerializer


class TeamRosterViewSet(ReadOnlyModelViewSet):
    filterset_fields = ['event']

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
        qs = Match.objects.annotate(
            team1_score=Sum(Case(
                When(games__winner=1, games__team1=F('team1'), then=1),
                When(games__winner=2, games__team2=F('team1'), then=1),
                default=0, output_field=IntegerField(),
            )),
            team2_score=Sum(Case(
                When(games__winner=1, games__team1=F('team2'), then=1),
                When(games__winner=2, games__team2=F('team2'), then=1),
                default=0, output_field=IntegerField(),
            )),
        ).order_by('-datetime_utc')
        if self.action == 'retrieve':
            qs = qs.select_related('event', 'event__league').prefetch_related('games')
        return qs

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return MatchDetailSerializer
        return MatchListSerializer

    filterset_class = MatchFilter


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


class OverviewView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        now = timezone.now()
        score_annotation = dict(
            team1_score=Sum(Case(
                When(games__winner=1, games__team1=F('team1'), then=1),
                When(games__winner=2, games__team2=F('team1'), then=1),
                default=0, output_field=IntegerField(),
            )),
            team2_score=Sum(Case(
                When(games__winner=1, games__team1=F('team2'), then=1),
                When(games__winner=2, games__team2=F('team2'), then=1),
                default=0, output_field=IntegerField(),
            )),
        )

        upcoming = (
            Match.objects
            .annotate(**score_annotation)
            .select_related('event', 'event__league')
            .filter(winner__isnull=True, datetime_utc__gte=now)
            .order_by('datetime_utc')[:5]
        )

        recent = (
            Match.objects
            .annotate(**score_annotation)
            .select_related('event', 'event__league')
            .exclude(winner__isnull=True)
            .order_by('-datetime_utc')[:5]
        )

        active_events = list(Event.objects.filter(is_active=True))
        champ_data = {}
        player_data = {}

        if active_events:
            for perf in (
                PlayerPerformance.objects
                .filter(game__match__event__in=active_events, champion__isnull=False)
                .select_related('champion', 'game')
                .only('name', 'team', 'role', 'kills', 'deaths', 'assists',
                      'side', 'game__winner', 'champion__id', 'champion__name',
                      'champion__patch', 'champion__riot_id')
            ):
                champ = perf.champion
                s = champ_data.setdefault(champ.id, {
                    'id': champ.id, 'name': champ.name,
                    'icon_url': champ.icon_url(),
                    'picks': 0, 'wins': 0,
                })
                s['picks'] += 1
                if perf.side == perf.game.winner:
                    s['wins'] += 1

                ps = player_data.setdefault(perf.name, {
                    'name': perf.name, 'team': perf.team, 'role': perf.role,
                    'games': 0, 'kills': 0, 'deaths': 0, 'assists': 0,
                })
                ps['games'] += 1
                ps['kills'] += perf.kills
                ps['deaths'] += perf.deaths
                ps['assists'] += perf.assists

        top_champs = sorted(champ_data.values(), key=lambda x: -x['picks'])[:5]
        for c in top_champs:
            c['win_rate'] = round(c['wins'] / c['picks'] * 100, 1) if c['picks'] else None

        def kda_score(s):
            return (s['kills'] + s['assists']) / max(s['deaths'], 1)

        eligible = [s for s in player_data.values() if s['games'] >= 3]
        top_players_raw = sorted(eligible, key=kda_score, reverse=True)[:5]
        top_players = []
        for p in top_players_raw:
            g = p['games']
            top_players.append({
                'name': p['name'], 'team': p['team'], 'role': p['role'],
                'games': g,
                'avg_kills': round(p['kills'] / g, 1),
                'avg_deaths': round(p['deaths'] / g, 1),
                'avg_assists': round(p['assists'] / g, 1),
                'kda': round(kda_score(p), 2),
            })

        return Response({
            'upcoming_matches': MatchListSerializer(upcoming, many=True).data,
            'recent_results': MatchListSerializer(recent, many=True).data,
            'top_champions': top_champs,
            'top_players': top_players,
        })


class PlayerProfileView(APIView):
    """Aggregated profile for a player, optionally filtered by year/event."""

    permission_classes = [AllowAny]

    def _gamelength_minutes(self, gl):
        if not gl or ':' not in gl:
            return None
        try:
            mm, ss = gl.split(':')
            mins = int(mm) + int(ss) / 60
            return mins if mins > 0 else None
        except (ValueError, ZeroDivisionError):
            return None

    def get(self, request, name):
        player = Player.objects.filter(name=name).first()

        perf_qs = (
            PlayerPerformance.objects
            .filter(name=name)
            .select_related('game', 'game__match', 'game__match__event',
                            'game__match__event__league', 'champion')
        )

        # Build year/event option lists from ALL performances (so the dropdowns
        # don't shrink after the user picks a filter).
        all_perfs = list(perf_qs)
        years = sorted(
            {p.game.match.event.year for p in all_perfs if p.game.match.event.year},
            reverse=True,
        )
        events_seen = {}
        for p in all_perfs:
            ev = p.game.match.event
            events_seen.setdefault(ev.id, ev)
        available_events = [
            {
                'id': ev.id,
                'name': ev.name,
                'year': ev.year,
                'league': ev.league.short_name or ev.league.name,
            }
            for ev in sorted(
                events_seen.values(),
                key=lambda e: (e.year or 0, e.start_date or timezone.now().date()),
                reverse=True,
            )
        ]

        # Apply filters
        year = request.query_params.get('year')
        event_id = request.query_params.get('event')
        perfs = all_perfs
        if year == 'latest':
            yr = years[0] if years else None
            if yr is not None:
                perfs = [p for p in perfs if p.game.match.event.year == yr]
        elif year:
            try:
                yr = int(year)
                perfs = [p for p in perfs if p.game.match.event.year == yr]
            except ValueError:
                pass
        if event_id:
            try:
                eid = int(event_id)
                perfs = [p for p in perfs if p.game.match.event.id == eid]
            except ValueError:
                pass

        # Aggregate stats
        games = len(perfs)
        wins = sum(1 for p in perfs if p.side == p.game.winner)
        losses = games - wins
        total_k = sum(p.kills for p in perfs)
        total_d = sum(p.deaths for p in perfs)
        total_a = sum(p.assists for p in perfs)
        total_cs = sum(p.cs for p in perfs)
        total_gold = sum(p.gold for p in perfs)
        total_dmg = sum(p.damage_to_champions for p in perfs)

        cs_per_min_vals = []
        for p in perfs:
            mins = self._gamelength_minutes(p.game.gamelength)
            if mins:
                cs_per_min_vals.append(p.cs / mins)

        stats = {
            'games': games,
            'wins': wins,
            'losses': losses,
            'win_rate': round(wins / games * 100, 1) if games else None,
            'avg_kills': round(total_k / games, 1) if games else 0,
            'avg_deaths': round(total_d / games, 1) if games else 0,
            'avg_assists': round(total_a / games, 1) if games else 0,
            'kda': round((total_k + total_a) / max(total_d, 1), 2) if games else 0,
            'avg_cs': round(total_cs / games, 1) if games else 0,
            'avg_cs_per_min': round(sum(cs_per_min_vals) / len(cs_per_min_vals), 2) if cs_per_min_vals else None,
            'avg_gold': round(total_gold / games) if games else 0,
            'avg_damage': round(total_dmg / games) if games else 0,
        }

        # Best champions
        champ_stats = {}
        for p in perfs:
            if not p.champion:
                continue
            s = champ_stats.setdefault(p.champion.id, {
                'id': p.champion.id,
                'name': p.champion.name,
                'icon_url': p.champion.icon_url(),
                'games': 0, 'wins': 0,
                'kills': 0, 'deaths': 0, 'assists': 0,
            })
            s['games'] += 1
            if p.side == p.game.winner:
                s['wins'] += 1
            s['kills'] += p.kills
            s['deaths'] += p.deaths
            s['assists'] += p.assists

        best_champions = []
        for s in champ_stats.values():
            g = s['games']
            best_champions.append({
                **s,
                'win_rate': round(s['wins'] / g * 100, 1),
                'avg_kills': round(s['kills'] / g, 1),
                'avg_deaths': round(s['deaths'] / g, 1),
                'avg_assists': round(s['assists'] / g, 1),
                'kda': round((s['kills'] + s['assists']) / max(s['deaths'], 1), 2),
            })
        best_champions.sort(key=lambda x: (-x['games'], -x['win_rate']))

        # Recent games — newest first (cap to avoid huge payloads)
        recent_perfs = sorted(
            perfs,
            key=lambda p: p.game.datetime_utc or p.game.match.datetime_utc or timezone.now(),
            reverse=True,
        )[:200]

        # Resolve team logos for every team referenced in this view.
        team_names_set = set()
        for p in recent_perfs:
            team_names_set.add(p.team)
            team_names_set.add(p.game.team1)
            team_names_set.add(p.game.team2)
        team_logos_map: dict[str, str] = {}
        if team_names_set:
            for roster in (
                TeamRoster.objects
                .filter(name__in=team_names_set)
                .select_related('org')
            ):
                if (
                    roster.org and roster.org.logo
                    and roster.name and roster.name not in team_logos_map
                ):
                    team_logos_map[roster.name] = request.build_absolute_uri(roster.org.logo.url)

        # Pre-compute series scores per match (counted from match.team1/team2
        # perspective, not blue/red side which swaps between games).
        match_ids = {p.game.match_id for p in recent_perfs}
        match_meta_map: dict[int, dict] = {}
        if match_ids:
            for m in (
                Match.objects
                .filter(id__in=match_ids)
                .prefetch_related('games')
            ):
                t1_wins = t2_wins = 0
                for g in m.games.all():
                    if g.winner == 1:
                        winner_team = g.team1
                    elif g.winner == 2:
                        winner_team = g.team2
                    else:
                        continue
                    if winner_team == m.team1:
                        t1_wins += 1
                    elif winner_team == m.team2:
                        t2_wins += 1
                match_meta_map[m.id] = {
                    'team1': m.team1,
                    'team2': m.team2,
                    'team1_wins': t1_wins,
                    'team2_wins': t2_wins,
                    'best_of': m.best_of,
                    'winner': m.winner,
                }

        recent_games = []
        for p in recent_perfs:
            game = p.game
            match = game.match
            event = match.event
            opp = game.team2 if p.side == 1 else game.team1
            won = p.side == game.winner if game.winner else None
            mins = self._gamelength_minutes(game.gamelength)
            meta = match_meta_map.get(match.id, {})
            recent_games.append({
                'game_id': game.id,
                'match_id': match.id,
                'datetime': (game.datetime_utc or match.datetime_utc).isoformat() if (game.datetime_utc or match.datetime_utc) else None,
                'event': event.name,
                'event_id': event.id,
                'event_logo': request.build_absolute_uri(event.logo.url) if event.logo else None,
                'league': event.league.short_name or event.league.name,
                'league_logo': request.build_absolute_uri(event.league.logo.url) if event.league.logo else None,
                'opponent': opp,
                'opponent_logo': team_logos_map.get(opp),
                'team': p.team,
                'team_logo': team_logos_map.get(p.team),
                'won': won,
                'role': p.role,
                'champion': p.champion.name if p.champion else None,
                'champion_icon': p.champion.icon_url() if p.champion else None,
                'kills': p.kills,
                'deaths': p.deaths,
                'assists': p.assists,
                'cs': p.cs,
                'cs_per_min': round(p.cs / mins, 2) if mins else None,
                'gamelength': game.gamelength,
                'best_of': meta.get('best_of', 1),
                'match_team1': meta.get('team1'),
                'match_team2': meta.get('team2'),
                'match_team1_wins': meta.get('team1_wins', 0),
                'match_team2_wins': meta.get('team2_wins', 0),
                'match_winner': meta.get('winner'),
            })

        # Current team — most recent roster entry overall
        current_team = None
        current_role = None
        if player:
            latest_rp = (
                RosterPlayer.objects
                .filter(player=player, roster__org__isnull=False)
                .select_related('roster', 'roster__org', 'roster__event')
                .order_by(
                    F('roster__event__start_date').desc(nulls_last=True),
                    '-roster__event__year',
                    '-id',
                )
                .first()
            )
            if latest_rp and latest_rp.roster.org:
                org = latest_rp.roster.org
                current_team = {
                    'name': org.name,
                    'short_name': org.short_name,
                    'logo': request.build_absolute_uri(org.logo.url) if org.logo else None,
                    'color': org.color or None,
                }
                current_role = latest_rp.role

        # Fallback: derive team from most recent performance
        if current_team is None and recent_perfs:
            recent_team_name = recent_perfs[0].team
            org = (
                Organization.objects
                .filter(rosters__name=recent_team_name)
                .first()
            )
            if org:
                current_team = {
                    'name': org.name,
                    'short_name': org.short_name,
                    'logo': request.build_absolute_uri(org.logo.url) if org.logo else None,
                    'color': org.color or None,
                }
            else:
                current_team = {'name': recent_team_name, 'short_name': recent_team_name, 'logo': None, 'color': None}
            current_role = current_role or recent_perfs[0].role

        if not player and not all_perfs:
            return Response({'detail': 'Player not found'}, status=drf_status.HTTP_404_NOT_FOUND)

        player_data = {
            'name': name,
            'real_name': player.real_name if player else None,
            'image': request.build_absolute_uri(player.image.url) if player and player.image else None,
            'leaguepedia_image': player.leaguepedia_image if player else '',
            'nationality': player.nationality if player else None,
            'birthdate': player.birthdate.isoformat() if player and player.birthdate else None,
            'age': player.age if player else None,
        }

        return Response({
            'player': player_data,
            'current_team': current_team,
            'current_role': current_role,
            'available_years': years,
            'available_events': available_events,
            'stats': stats,
            'best_champions': best_champions,
            'recent_games': recent_games,
        })


class TeamProfileView(APIView):
    """Aggregated profile for a team (Organization), optionally filtered by year/event.

    The URL `name` parameter matches a Match.team1/team2 string. We resolve it to
    an Organization by looking through its TeamRoster.name variants — teams can
    rebrand across events (e.g. BRION ↔ OKSavingsBank BRION).
    """

    permission_classes = [AllowAny]

    def _gamelength_minutes(self, gl):
        if not gl or ':' not in gl:
            return None
        try:
            mm, ss = gl.split(':')
            mins = int(mm) + int(ss) / 60
            return mins if mins > 0 else None
        except (ValueError, ZeroDivisionError):
            return None

    def _resolve_org(self, name):
        # 1. Try exact roster name match
        rp = (
            TeamRoster.objects
            .filter(name__iexact=name, org__isnull=False)
            .select_related('org')
            .first()
        )
        if rp and rp.org:
            return rp.org
        # 2. Try short_name match
        org = Organization.objects.filter(short_name__iexact=name).first()
        if org:
            return org
        # 3. Try organization name match
        return Organization.objects.filter(name__iexact=name).first()

    def get(self, request, name):
        org = self._resolve_org(name)
        if not org:
            return Response({'detail': 'Team not found'}, status=drf_status.HTTP_404_NOT_FOUND)

        # All roster names this org has used (handles rebrands)
        roster_names = list(
            TeamRoster.objects
            .filter(org=org)
            .exclude(name__isnull=True)
            .exclude(name='')
            .exclude(name='TBD')
            .values_list('name', flat=True)
            .distinct()
        )
        if not roster_names:
            roster_names = [org.name]

        all_matches = list(
            Match.objects
            .filter(Q(team1__in=roster_names) | Q(team2__in=roster_names))
            .select_related('event', 'event__league')
            .prefetch_related('games')
        )

        # Year/event option lists from ALL matches (so dropdowns stay stable
        # under filtering)
        years = sorted(
            {m.event.year for m in all_matches if m.event.year},
            reverse=True,
        )
        events_seen = {}
        for m in all_matches:
            events_seen.setdefault(m.event.id, m.event)
        available_events = [
            {
                'id': ev.id,
                'name': ev.name,
                'year': ev.year,
                'league': ev.league.short_name or ev.league.name,
            }
            for ev in sorted(
                events_seen.values(),
                key=lambda e: (e.year or 0, e.start_date or timezone.now().date()),
                reverse=True,
            )
        ]

        # Apply filters
        year = request.query_params.get('year')
        event_id = request.query_params.get('event')
        matches = all_matches
        if year == 'latest':
            yr = years[0] if years else None
            if yr is not None:
                matches = [m for m in matches if m.event.year == yr]
        elif year:
            try:
                yr = int(year)
                matches = [m for m in matches if m.event.year == yr]
            except ValueError:
                pass
        if event_id:
            try:
                eid = int(event_id)
                matches = [m for m in matches if m.event.id == eid]
            except ValueError:
                pass

        # ── Aggregate match + game stats ──
        match_wins = match_losses = 0
        games_played = game_wins = game_losses = 0
        kills_for = kills_against = 0
        towers_for = dragons_for = barons_for = 0
        gamelength_minutes = []

        for m in matches:
            if m.winner is not None:
                we_are_t1 = m.team1 in roster_names
                we_are_t2 = m.team2 in roster_names
                if we_are_t1 and m.winner == 1:
                    match_wins += 1
                elif we_are_t2 and m.winner == 2:
                    match_wins += 1
                elif m.winner in (1, 2) and (we_are_t1 or we_are_t2):
                    match_losses += 1

            for g in m.games.all():
                we_are_t1 = g.team1 in roster_names
                we_are_t2 = g.team2 in roster_names
                if not (we_are_t1 or we_are_t2):
                    continue
                games_played += 1
                won = (we_are_t1 and g.winner == 1) or (we_are_t2 and g.winner == 2)
                if g.winner is not None:
                    if won:
                        game_wins += 1
                    elif g.winner in (1, 2):
                        game_losses += 1

                if we_are_t1:
                    kills_for += g.team1_kills
                    kills_against += g.team2_kills
                    towers_for += g.team1_towers
                    dragons_for += g.team1_dragons
                    barons_for += g.team1_barons
                else:
                    kills_for += g.team2_kills
                    kills_against += g.team1_kills
                    towers_for += g.team2_towers
                    dragons_for += g.team2_dragons
                    barons_for += g.team2_barons

                mins = self._gamelength_minutes(g.gamelength)
                if mins:
                    gamelength_minutes.append(mins)

        decided_matches = match_wins + match_losses
        decided_games = game_wins + game_losses

        def avg_gametime(mins_list):
            if not mins_list:
                return None
            avg = sum(mins_list) / len(mins_list)
            mm = int(avg)
            ss = int(round((avg - mm) * 60))
            return f"{mm}:{ss:02d}"

        stats = {
            'matches': len(matches),
            'match_wins': match_wins,
            'match_losses': match_losses,
            'match_win_rate': round(match_wins / decided_matches * 100, 1) if decided_matches else None,
            'games': games_played,
            'game_wins': game_wins,
            'game_losses': game_losses,
            'game_win_rate': round(game_wins / decided_games * 100, 1) if decided_games else None,
            'avg_kills_for': round(kills_for / games_played, 1) if games_played else 0,
            'avg_kills_against': round(kills_against / games_played, 1) if games_played else 0,
            'avg_game_length': avg_gametime(gamelength_minutes),
            'avg_towers': round(towers_for / games_played, 1) if games_played else 0,
            'avg_dragons': round(dragons_for / games_played, 1) if games_played else 0,
            'avg_barons': round(barons_for / games_played, 1) if games_played else 0,
        }

        # ── Champion stats: picks, wins, bans (per team) ──
        filtered_match_ids = [m.id for m in matches]
        perfs = list(
            PlayerPerformance.objects
            .filter(
                game__match_id__in=filtered_match_ids,
                team__in=roster_names,
                champion__isnull=False,
            )
            .select_related('game', 'champion')
        )

        champ_stats = {}
        for p in perfs:
            c = p.champion
            s = champ_stats.setdefault(c.id, {
                'id': c.id,
                'name': c.name,
                'icon_url': c.icon_url(),
                'picks': 0, 'wins': 0, 'bans': 0,
                'kills': 0, 'deaths': 0, 'assists': 0,
            })
            s['picks'] += 1
            if p.side == p.game.winner:
                s['wins'] += 1
            s['kills'] += p.kills
            s['deaths'] += p.deaths
            s['assists'] += p.assists

        # Bans BY this team — need to know which team did the ban; use Game M2M
        for m in matches:
            for g in m.games.all():
                we_are_t1 = g.team1 in roster_names
                we_are_t2 = g.team2 in roster_names
                if we_are_t1:
                    for c in g.team1_bans.all():
                        s = champ_stats.setdefault(c.id, {
                            'id': c.id, 'name': c.name, 'icon_url': c.icon_url(),
                            'picks': 0, 'wins': 0, 'bans': 0,
                            'kills': 0, 'deaths': 0, 'assists': 0,
                        })
                        s['bans'] += 1
                if we_are_t2:
                    for c in g.team2_bans.all():
                        s = champ_stats.setdefault(c.id, {
                            'id': c.id, 'name': c.name, 'icon_url': c.icon_url(),
                            'picks': 0, 'wins': 0, 'bans': 0,
                            'kills': 0, 'deaths': 0, 'assists': 0,
                        })
                        s['bans'] += 1

        top_champions = []
        for s in champ_stats.values():
            g = s['picks']
            top_champions.append({
                **s,
                'win_rate': round(s['wins'] / g * 100, 1) if g else None,
                'kda': round((s['kills'] + s['assists']) / max(s['deaths'], 1), 2) if g else None,
            })
        top_champions.sort(key=lambda x: (-x['picks'], -(x['bans']), -(x['win_rate'] or 0)))

        # ── Player stats on this team ──
        player_stats = {}
        for p in perfs:
            s = player_stats.setdefault(p.name, {
                'name': p.name,
                'role': p.role,
                'games': 0,
                'wins': 0,
                'kills': 0, 'deaths': 0, 'assists': 0,
            })
            s['games'] += 1
            if p.side == p.game.winner:
                s['wins'] += 1
            s['kills'] += p.kills
            s['deaths'] += p.deaths
            s['assists'] += p.assists

        # Resolve player images
        player_records = {
            pl.name: pl
            for pl in Player.objects.filter(name__in=list(player_stats.keys()))
        }
        ROLE_ORDER = {'Top': 0, 'Jungle': 1, 'Mid': 2, 'Bot': 3, 'Support': 4}
        top_players = []
        for s in player_stats.values():
            g = s['games']
            pl = player_records.get(s['name'])
            top_players.append({
                **s,
                'image': request.build_absolute_uri(pl.image.url) if pl and pl.image else None,
                'nationality': pl.nationality if pl else None,
                'avg_kills': round(s['kills'] / g, 1),
                'avg_deaths': round(s['deaths'] / g, 1),
                'avg_assists': round(s['assists'] / g, 1),
                'kda': round((s['kills'] + s['assists']) / max(s['deaths'], 1), 2),
                'win_rate': round(s['wins'] / g * 100, 1) if g else None,
            })
        top_players.sort(key=lambda x: (ROLE_ORDER.get(x['role'], 99), -x['games']))

        # ── Current roster: latest event with players for this org ──
        latest_roster = (
            TeamRoster.objects
            .filter(org=org)
            .exclude(name='TBD')
            .select_related('event', 'event__league')
            .prefetch_related('players__player')
            .annotate(_player_count=Count('players'))
            .filter(_player_count__gt=0)
            .order_by(
                F('event__start_date').desc(nulls_last=True),
                '-event__year',
                '-id',
            )
            .first()
        )

        current_roster = []
        current_event = None
        if latest_roster:
            current_event = {
                'id': latest_roster.event.id,
                'name': latest_roster.event.name,
                'year': latest_roster.event.year,
                'league': latest_roster.event.league.short_name or latest_roster.event.league.name,
            }
            # Dedupe roster slots — the underlying data sometimes has two
            # RosterPlayer rows per slot (e.g. "Rich " and "Rich"), and only
            # one of them carries a usable Player.image. Prefer the entry with
            # an image; otherwise keep the first one we saw.
            roster_by_slot: dict[tuple[str, str], dict] = {}
            for rp in latest_roster.players.all():
                pl = rp.player
                clean_name = pl.name.strip()
                key = (clean_name.lower(), rp.role)
                entry = {
                    'player_id': pl.id,
                    'name': clean_name,
                    'role': rp.role,
                    'image': request.build_absolute_uri(pl.image.url) if pl.image else None,
                    'nationality': pl.nationality,
                    'is_starter': rp.is_starter,
                }
                existing = roster_by_slot.get(key)
                if existing is None:
                    roster_by_slot[key] = entry
                elif existing['image'] is None and entry['image'] is not None:
                    roster_by_slot[key] = entry
            current_roster = list(roster_by_slot.values())
            current_roster.sort(key=lambda r: (
                0 if r['is_starter'] else 1,
                ROLE_ORDER.get(r['role'], 99),
            ))

        # ── Recent matches ──
        recent_matches_sorted = sorted(
            matches,
            key=lambda m: m.datetime_utc or timezone.now(),
            reverse=True,
        )[:200]

        # Pre-fetch team logos for opponents (and ourselves)
        opp_names = set()
        for m in recent_matches_sorted:
            opp_names.add(m.team1)
            opp_names.add(m.team2)
        logos_map: dict[str, str] = {}
        for r in (
            TeamRoster.objects
            .filter(name__in=opp_names)
            .select_related('org')
        ):
            if r.org and r.org.logo and r.name and r.name not in logos_map:
                logos_map[r.name] = request.build_absolute_uri(r.org.logo.url)

        recent_matches = []
        for m in recent_matches_sorted:
            we_are_t1 = m.team1 in roster_names
            our_name = m.team1 if we_are_t1 else m.team2
            opp_name = m.team2 if we_are_t1 else m.team1
            t1_wins = t2_wins = 0
            for g in m.games.all():
                if g.winner == 1:
                    w_team = g.team1
                elif g.winner == 2:
                    w_team = g.team2
                else:
                    continue
                if w_team == m.team1:
                    t1_wins += 1
                elif w_team == m.team2:
                    t2_wins += 1
            our_score = t1_wins if we_are_t1 else t2_wins
            opp_score = t2_wins if we_are_t1 else t1_wins
            won = None
            if m.winner is not None:
                won = (we_are_t1 and m.winner == 1) or (not we_are_t1 and m.winner == 2)
            ev = m.event
            recent_matches.append({
                'match_id': m.id,
                'datetime': m.datetime_utc.isoformat() if m.datetime_utc else None,
                'event': ev.name,
                'event_id': ev.id,
                'event_logo': request.build_absolute_uri(ev.logo.url) if ev.logo else None,
                'league': ev.league.short_name or ev.league.name,
                'league_logo': request.build_absolute_uri(ev.league.logo.url) if ev.league.logo else None,
                'team': our_name,
                'team_logo': logos_map.get(our_name),
                'opponent': opp_name,
                'opponent_logo': logos_map.get(opp_name),
                'best_of': m.best_of,
                'tab': m.tab,
                'patch': m.patch,
                'team_score': our_score,
                'opponent_score': opp_score,
                'won': won,
            })

        return Response({
            'team': {
                'id': org.id,
                'name': org.name,
                'short_name': org.short_name,
                'logo': request.build_absolute_uri(org.logo.url) if org.logo else None,
                'color': org.color or None,
                'region': org.region,
                'leaguepedia_page': org.leaguepedia_page,
            },
            'current_event': current_event,
            'current_roster': current_roster,
            'available_years': years,
            'available_events': available_events,
            'stats': stats,
            'top_champions': top_champions,
            'top_players': top_players,
            'recent_matches': recent_matches,
        })
