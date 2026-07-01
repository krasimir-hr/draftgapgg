from rest_framework import viewsets, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from rest_framework import status as drf_status
from django.db.models import Count, Q, Sum, Case, When, IntegerField, F
from django.utils import timezone
from datetime import date

from .models import (League, Event, EventStage, Organization, Player, TeamRoster,
                     RosterPlayer, Match, Game, PlayerPerformance,
                     PerformanceRating)
from . import rating as rating_engine
from .filters import MatchFilter
from .serializers import (
    LeagueSerializer,
    EventListSerializer,
    OrganizationSerializer,
    PlayerSerializer,
    TeamRosterListSerializer, TeamRosterDetailSerializer,
    MatchListSerializer, MatchDetailSerializer, MatchBracketSerializer,
    GameListSerializer, GameDetailSerializer,
    PlayerPerformanceCompactSerializer, PlayerPerformanceSerializer,
)


def champion_icon_memo(request):
    """Return a memoised ``icon_url`` resolver for a single request.

    ``Champion.icon_url(request)`` builds an absolute URL, which is too costly to
    repeat across the tens of thousands of rows these aggregation views iterate.
    Many call sites also pass it as the default argument to ``dict.setdefault``,
    which Python evaluates on *every* call regardless of whether the key exists —
    so memoising per champion id turns those repeats into a cheap dict lookup.
    """
    cache: dict[int, str] = {}

    def icon_url(champ):
        url = cache.get(champ.id)
        if url is None:
            url = cache[champ.id] = champ.icon_url(request)
        return url

    return icon_url


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
    serializer_class = EventListSerializer
    filterset_fields = ['league', 'is_active', 'year']

    def get_queryset(self):
        # Events whose leaguepedia_page is referenced by an EventStage have been
        # merged into a parent event — exclude them so they don't appear as
        # separate entries in the dropdown.
        absorbed = (
            EventStage.objects
            .exclude(leaguepedia_page__isnull=True)
            .exclude(leaguepedia_page='')
            .values_list('leaguepedia_page', flat=True)
        )
        return (
            Event.objects
            .select_related('league')
            .prefetch_related('stages')
            .exclude(leaguepedia_page__in=absorbed)
            .order_by('-start_date')
        )

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        event = self.get_object()

        match_qs = Match.objects.filter(event=event)
        total_matches = match_qs.count()
        completed_matches = match_qs.exclude(winner__isnull=True).count()

        games = Game.objects.filter(match__event=event)
        games_played = games.count()

        total_seconds = 0
        counted = 0
        for gl in games.values_list('gamelength', flat=True):
            if not gl or ':' not in gl:
                continue
            try:
                mm, ss = gl.split(':')
                secs = int(mm) * 60 + int(ss)
            except (ValueError, TypeError):
                continue
            if secs <= 0:
                continue
            total_seconds += secs
            counted += 1

        avg_game_length = None
        if counted:
            avg = total_seconds // counted
            avg_game_length = f"{avg // 60}:{avg % 60:02d}"

        return Response({
            'prize_pool': event.prize_pool or None,
            'total_matches': total_matches,
            'completed_matches': completed_matches,
            'games_played': games_played,
            'avg_game_length': avg_game_length,
        })

    @action(detail=True, methods=['get'])
    def highlights(self, request, pk=None):
        event = self.get_object()
        now = timezone.now()
        thirty_days_ago = now - timezone.timedelta(days=30)

        # Pre-fetch all team logos for this event once
        team_logos_map = {}
        for roster in (TeamRoster.objects
                        .filter(event=event)
                        .select_related('org')
                        .exclude(name='TBD')):
            if roster.name and roster.org and roster.org.logo:
                team_logos_map[roster.name] = request.build_absolute_uri(roster.org.logo.url)

        # Player of the month — best KDA among players with ≥2 games in past 30 days
        recent_perfs = list(
            PlayerPerformance.objects
            .filter(game__match__event=event)
            .filter(
                Q(game__datetime_utc__gte=thirty_days_ago) |
                Q(game__datetime_utc__isnull=True, game__match__datetime_utc__gte=thirty_days_ago)
            )
            .select_related('game', 'game__match')
        )
        player_stats = {}
        for p in recent_perfs:
            s = player_stats.setdefault(p.name, {
                'name': p.name, 'team': p.team, 'role': p.role,
                'games': 0, 'kills': 0, 'deaths': 0, 'assists': 0,
            })
            s['games'] += 1
            s['kills'] += p.kills
            s['deaths'] += p.deaths
            s['assists'] += p.assists

        player_of_month = None
        eligible_players = [s for s in player_stats.values() if s['games'] >= 2]
        if eligible_players:
            def player_kda(s):
                return (s['kills'] + s['assists']) / max(s['deaths'], 1)
            best_player = max(eligible_players, key=player_kda)
            g = best_player['games']
            player_record = Player.objects.filter(name=best_player['name']).first()
            player_image = None
            if player_record and player_record.image:
                player_image = request.build_absolute_uri(player_record.image.url)
            elif player_record and player_record.leaguepedia_image:
                player_image = player_record.leaguepedia_image
            player_of_month = {
                'name': best_player['name'],
                'team': best_player['team'],
                'team_logo': team_logos_map.get(best_player['team']),
                'role': best_player['role'],
                'nationality': player_record.nationality if player_record else None,
                'games': g,
                'avg_kills': round(best_player['kills'] / g, 1),
                'avg_deaths': round(best_player['deaths'] / g, 1),
                'avg_assists': round(best_player['assists'] / g, 1),
                'kda': round(player_kda(best_player), 2),
                'image': player_image,
            }

        # Inform team — team with best form in their last 5 matches in the event
        all_completed = list(
            Match.objects
            .filter(event=event)
            .exclude(winner__isnull=True)
            .order_by('-datetime_utc')
        )
        team_matches = {}
        for m in all_completed:
            for team in [m.team1, m.team2]:
                team_matches.setdefault(team, []).append(m)

        inform_team = None
        team_form_scores = {}
        for team, t_matches in team_matches.items():
            last5 = t_matches[:5]
            wins = sum(
                1 for m in last5
                if (m.team1 == team and m.winner == 1) or (m.team2 == team and m.winner == 2)
            )
            team_form_scores[team] = {'team': team, 'wins': wins, 'played': len(last5)}

        if team_form_scores:
            best_team_data = max(team_form_scores.values(), key=lambda x: (x['wins'], x['played']))
            best_team = best_team_data['team']
            form_results = []
            for m in team_matches[best_team][:5]:
                won = (m.team1 == best_team and m.winner == 1) or (m.team2 == best_team and m.winner == 2)
                form_results.append('W' if won else 'L')
            inform_team = {
                'team': best_team,
                'logo': team_logos_map.get(best_team),
                'wins': best_team_data['wins'],
                'played': best_team_data['played'],
                'form': form_results,
            }

        # Must pick — champion with best win rate in past 30 days (≥2 picks)
        recent_champ_perfs = list(
            PlayerPerformance.objects
            .filter(game__match__event=event, champion__isnull=False)
            .filter(
                Q(game__datetime_utc__gte=thirty_days_ago) |
                Q(game__datetime_utc__isnull=True, game__match__datetime_utc__gte=thirty_days_ago)
            )
            .select_related('game', 'champion')
        )
        icon_url = champion_icon_memo(request)
        champ_stats = {}
        for p in recent_champ_perfs:
            c = p.champion
            s = champ_stats.setdefault(c.id, {
                'id': c.id, 'name': c.name, 'icon_url': icon_url(c),
                'splash_url': f'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/{c.riot_id}_0.jpg',
                'picks': 0, 'wins': 0,
            })
            s['picks'] += 1
            if p.side == p.game.winner:
                s['wins'] += 1

        must_pick = None
        eligible_champs = [s for s in champ_stats.values() if s['picks'] >= 2]
        if eligible_champs:
            best_champ = max(eligible_champs, key=lambda s: (s['wins'] / s['picks'], s['picks']))
            must_pick = {
                'id': best_champ['id'],
                'name': best_champ['name'],
                'icon_url': best_champ['icon_url'],
                'splash_url': best_champ['splash_url'],
                'picks': best_champ['picks'],
                'wins': best_champ['wins'],
                'win_rate': round(best_champ['wins'] / best_champ['picks'] * 100, 1),
            }

        # Standings positions — used to score match quality (lower rank sum = better matchup)
        pos_stats: dict[str, dict] = {}
        for m in all_completed:
            for team in (m.team1, m.team2):
                pos_stats.setdefault(team, {'wins': 0, 'losses': 0})
            if m.winner == 1:
                pos_stats[m.team1]['wins'] += 1
                pos_stats[m.team2]['losses'] += 1
            else:
                pos_stats[m.team2]['wins'] += 1
                pos_stats[m.team1]['losses'] += 1
        sorted_teams = sorted(pos_stats.items(), key=lambda x: (-x[1]['wins'], x[1]['losses']))
        team_pos = {t: i + 1 for i, (t, _) in enumerate(sorted_teams)}

        def match_rank_sum(m: Match) -> int:
            return team_pos.get(m.team1, 999) + team_pos.get(m.team2, 999)

        # Build a cross-event logos map for the same league (for MOTW/Banger teams in other events)
        cross_logos: dict[str, str] = dict(team_logos_map)
        for r in (TeamRoster.objects
                  .filter(event__league=event.league)
                  .select_related('org')
                  .exclude(name='TBD')):
            if r.name and r.name not in cross_logos and r.org and r.org.logo:
                cross_logos[r.name] = request.build_absolute_uri(r.org.logo.url)

        # Match of the week — best upcoming match across all league events (soonest on rank-sum tie)
        upcoming = list(
            Match.objects
            .filter(event__league=event.league, winner__isnull=True)
            .exclude(team1='TBD').exclude(team2='TBD')
            .order_by('datetime_utc')
        )
        match_of_week = None
        if upcoming:
            best_upcoming = min(upcoming, key=match_rank_sum)
            match_of_week = {
                'team1': best_upcoming.team1,
                'team2': best_upcoming.team2,
                'team1_logo': cross_logos.get(best_upcoming.team1),
                'team2_logo': cross_logos.get(best_upcoming.team2),
                'team1_pos': team_pos.get(best_upcoming.team1),
                'team2_pos': team_pos.get(best_upcoming.team2),
                'datetime_utc': best_upcoming.datetime_utc,
            }

        # Banger of the week — best completed match across all league events (most recent on rank-sum tie)
        banger_of_week = None
        cross_completed = list(
            Match.objects
            .filter(event__league=event.league)
            .exclude(winner__isnull=True)
            .exclude(team1='TBD').exclude(team2='TBD')
            .order_by('-datetime_utc')
        )
        if cross_completed:
            best_banger = min(cross_completed, key=match_rank_sum)
            games = list(Game.objects.filter(match=best_banger))
            t1_score = sum(1 for g in games if g.winner == 1)
            t2_score = sum(1 for g in games if g.winner == 2)
            banger_of_week = {
                'team1': best_banger.team1,
                'team2': best_banger.team2,
                'team1_logo': cross_logos.get(best_banger.team1),
                'team2_logo': cross_logos.get(best_banger.team2),
                'team1_pos': team_pos.get(best_banger.team1),
                'team2_pos': team_pos.get(best_banger.team2),
                'team1_score': t1_score,
                'team2_score': t2_score,
                'winner': best_banger.winner,
                'datetime_utc': best_banger.datetime_utc,
            }

        return Response({
            'player_of_month': player_of_month,
            'inform_team': inform_team,
            'must_pick': must_pick,
            'match_of_week': match_of_week,
            'banger_of_week': banger_of_week,
        })

    @action(detail=True, methods=['get'])
    def standings(self, request, pk=None):
        event = self.get_object()
        stage_id = request.query_params.get('stage')

        # Seed table from rostered teams (excludes TBD placeholders)
        rosters = (
            TeamRoster.objects
            .filter(event=event)
            .select_related('org')
            .exclude(name='TBD')
        )
        def blank():
            return {
                'wins': 0, 'losses': 0,
                'kills': 0, 'deaths': 0,
                'gold': 0,
                'towers': 0, 'dragons': 0, 'barons': 0,
                'games': 0,
                'game_wins': 0,
                'gamelength_secs': 0,
            }

        stats = {}
        team_logo = {}
        for roster in rosters:
            if not roster.name:
                continue
            stats.setdefault(roster.name, blank())
            if roster.org and roster.org.logo:
                team_logo[roster.name] = request.build_absolute_uri(roster.org.logo.url)

        # Wins / losses from completed matches (chronological, for form tracking)
        team_form = {}
        match_qs = Match.objects.filter(event=event)
        if stage_id:
            match_qs = match_qs.filter(stage_id=stage_id)
        completed = (
            match_qs
            .exclude(winner__isnull=True)
            .annotate(
                t1_score=Sum(Case(
                    When(games__winner=1, games__team1=F('team1'), then=1),
                    When(games__winner=2, games__team2=F('team1'), then=1),
                    default=0, output_field=IntegerField(),
                )),
                t2_score=Sum(Case(
                    When(games__winner=1, games__team1=F('team2'), then=1),
                    When(games__winner=2, games__team2=F('team2'), then=1),
                    default=0, output_field=IntegerField(),
                )),
            )
            .order_by('datetime_utc')
        )
        for match in completed:
            for team in (match.team1, match.team2):
                stats.setdefault(team, blank())
            winner_team = match.team1 if match.winner == 1 else match.team2
            loser_team = match.team2 if match.winner == 1 else match.team1
            stats[winner_team]['wins'] += 1
            stats[loser_team]['losses'] += 1
            for team, is_t1 in ((match.team1, True), (match.team2, False)):
                opponent = match.team2 if is_t1 else match.team1
                team_score = match.t1_score if is_t1 else match.t2_score
                opp_score = match.t2_score if is_t1 else match.t1_score
                won = (match.winner == 1) == is_t1
                team_form.setdefault(team, []).append({
                    'match_id': match.id,
                    'result': 'W' if won else 'L',
                    'opponent': opponent,
                    'opponent_logo': team_logo.get(opponent),
                    'score': f"{team_score}-{opp_score}",
                    'datetime_utc': match.datetime_utc.isoformat() if match.datetime_utc else None,
                    'tab': match.tab,
                })

        # Per-game stats
        def parse_secs(gamelength):
            if not gamelength or ':' not in gamelength:
                return 0
            try:
                mm, ss = gamelength.split(':')
                return int(mm) * 60 + int(ss)
            except (ValueError, AttributeError):
                return 0

        game_qs = Game.objects.filter(match__event=event)
        if stage_id:
            game_qs = game_qs.filter(match__stage_id=stage_id)
        for game in game_qs:
            secs = parse_secs(game.gamelength)
            for team_name, prefix, opp_prefix in (
                (game.team1, 'team1', 'team2'),
                (game.team2, 'team2', 'team1'),
            ):
                if team_name not in stats:
                    continue
                s = stats[team_name]
                s['kills']          += getattr(game, f'{prefix}_kills', 0)
                s['deaths']         += getattr(game, f'{opp_prefix}_kills', 0)
                s['gold']           += getattr(game, f'{prefix}_gold', 0)
                s['towers']         += getattr(game, f'{prefix}_towers', 0)
                s['dragons']        += getattr(game, f'{prefix}_dragons', 0)
                s['barons']         += getattr(game, f'{prefix}_barons', 0)
                s['games']          += 1
                s['gamelength_secs'] += secs
                if game.winner == (1 if prefix == 'team1' else 2):
                    s['game_wins']  += 1

        rows = []
        for t, s in stats.items():
            g = s['games'] or 1
            gl = s['gamelength_secs'] or 1
            total_matches = s['wins'] + s['losses']
            rows.append({
                'team': t,
                'logo': team_logo.get(t),
                'wins': s['wins'],
                'losses': s['losses'],
                'win_rate': round(s['wins'] / total_matches * 100, 1) if total_matches else 0,
                'form': team_form.get(t, [])[-5:],
                'kills': s['kills'],
                'deaths': s['deaths'],
                'kd_ratio': round(s['kills'] / s['deaths'], 2) if s['deaths'] else None,
                'kills_per_game': round(s['kills'] / g, 1),
                'deaths_per_game': round(s['deaths'] / g, 1),
                'gold_per_min': round(s['gold'] / (gl / 60), 0) if s['gold'] else 0,
                'towers': s['towers'],
                'towers_per_game': round(s['towers'] / g, 1),
                'dragons': s['dragons'],
                'dragons_per_game': round(s['dragons'] / g, 1),
                'barons': s['barons'],
                'barons_per_game': round(s['barons'] / g, 1),
                'games': g,
                'game_wins': s['game_wins'],
                'game_win_rate': round(s['game_wins'] / g * 100, 1) if g else 0,
                'avg_game_length': round(s['gamelength_secs'] / g / 60, 1) if s['gamelength_secs'] else 0,
            })

        rows.sort(key=lambda x: (-x['wins'], x['losses'], -x['kills']))
        for i, entry in enumerate(rows):
            entry['placement'] = i + 1

        return Response(rows)

    @action(detail=True, methods=['get'])
    def players(self, request, pk=None):
        event = self.get_object()
        stage_id = request.query_params.get('stage')
        qs = PlayerPerformance.objects.filter(game__match__event=event).select_related('game')
        if stage_id:
            qs = qs.filter(game__match__stage_id=stage_id)
        performances = qs

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
    def ratings(self, request, pk=None):
        """Performance-rating leaderboard for the event.

        Aggregates PerformanceRating per player: mean PR (for "best player"),
        total points (for "most valuable"), MVPs, contribution share. Supports
        ?role=<Top|Jungle|Mid|Bot|Support> and ?sort=<pr|points>.
        """
        event = self.get_object()
        role_filter = request.query_params.get('role')
        sort = request.query_params.get('sort', 'pr')
        if sort not in ('pr', 'points'):
            sort = 'pr'

        ratings = (
            PerformanceRating.objects
            .filter(performance__game__match__event=event)
            .select_related('performance', 'performance__game', 'performance__champion')
        )

        icon_url = champion_icon_memo(request)
        agg = {}
        for r in ratings:
            p = r.performance
            role = rating_engine.canonical_role(p.role)
            if not role:
                continue
            s = agg.setdefault(p.name, {
                'name': p.name, 'team': p.team, 'link': p.link,
                'games': 0, 'pr_sum': 0.0, 'points_sum': 0.0,
                'contrib_sum': 0.0, 'mvps': 0,
                'role_counts': {}, 'tier_counts': {'enriched': 0, 'basic': 0},
                'form_pts': [], 'champ_stats': {},
            })
            s['team'] = p.team
            s['games'] += 1
            s['pr_sum'] += r.pr
            s['points_sum'] += r.points
            s['contrib_sum'] += r.contribution_share
            s['mvps'] += 1 if r.is_mvp else 0
            s['role_counts'][role] = s['role_counts'].get(role, 0) + 1
            s['tier_counts'][r.tier] = s['tier_counts'].get(r.tier, 0) + 1
            g = p.game
            champ = p.champion
            if champ:
                cs = s['champ_stats'].setdefault(
                    champ.id, {'name': champ.name, 'icon': icon_url(champ), 'games': 0, 'pr_sum': 0.0}
                )
                cs['games'] += 1
                cs['pr_sum'] += r.pr
            s['form_pts'].append({
                'dt': g.datetime_utc,
                'gn': g.game_number,
                'pr': round(r.pr, 1),
                'win': (g.winner == p.side) if g.winner is not None else None,
                'opponent': g.team2 if p.side == 1 else g.team1,
                'champion': champ.name if champ else None,
                'champion_icon': icon_url(champ) if champ else None,
                'kills': p.kills,
                'deaths': p.deaths,
                'assists': p.assists,
            })

        if not agg:
            return Response([])

        player_info = {
            pl.name: {
                'image': request.build_absolute_uri(pl.image.url) if pl.image else None,
                'nationality': pl.nationality,
            }
            for pl in Player.objects.filter(name__in=list(agg.keys()))
        }

        result = []
        for s in agg.values():
            games = s['games']
            main_role = max(s['role_counts'], key=s['role_counts'].get)
            if role_filter and main_role != role_filter:
                continue
            info = player_info.get(s['name'], {})
            # Per-game form in chronological order (oldest → newest); games with no
            # timestamp sort first, ordered by game number. Last 10 drive the graph.
            form_sorted = sorted(
                s['form_pts'],
                key=lambda t: (1, t['dt'], t['gn']) if t['dt'] is not None else (0, t['gn']),
            )
            form = [
                {
                    'pr': e['pr'],
                    'win': e['win'],
                    'opponent': e['opponent'],
                    'champion': e['champion'],
                    'champion_icon': e['champion_icon'],
                    'kills': e['kills'],
                    'deaths': e['deaths'],
                    'assists': e['assists'],
                    'date': e['dt'].isoformat() if e['dt'] else None,
                }
                for e in form_sorted
            ][-10:]
            # Best 3 champions: shrink each champion's mean PR toward the player's
            # overall PR (empirical-Bayes prior, weight 2) so a single great game
            # can't outrank a champion with a real sample. Tie-break on games.
            overall_pr = s['pr_sum'] / games
            champ_ranked = sorted(
                (
                    {
                        'name': cs['name'],
                        'icon': cs['icon'],
                        'games': cs['games'],
                        'pr': round(cs['pr_sum'] / cs['games'], 1),
                        '_score': (cs['pr_sum'] + overall_pr * 2) / (cs['games'] + 2),
                    }
                    for cs in s['champ_stats'].values()
                ),
                key=lambda c: (-c['_score'], -c['games']),
            )
            champions = [
                {'name': c['name'], 'icon': c['icon'], 'games': c['games'], 'pr': c['pr']}
                for c in champ_ranked[:3]
            ]
            result.append({
                'name': s['name'],
                'team': s['team'],
                'role': main_role,
                'link': s['link'],
                'image': info.get('image'),
                'nationality': info.get('nationality'),
                'games_played': games,
                'avg_pr': round(s['pr_sum'] / games, 1),
                'total_points': round(s['points_sum'], 1),
                'avg_contribution': round(s['contrib_sum'] / games, 3),
                'mvps': s['mvps'],
                'tier': 'enriched' if s['tier_counts'].get('enriched', 0) >= s['tier_counts'].get('basic', 0) and s['tier_counts'].get('enriched', 0) > 0 else 'basic',
                'form': form,
                'champions': champions,
            })

        key = 'avg_pr' if sort == 'pr' else 'total_points'
        result.sort(key=lambda x: -x[key])
        for i, entry in enumerate(result):
            entry['placement'] = i + 1

        return Response(result)

    @action(detail=True, methods=['get'])
    def champions(self, request, pk=None):
        event = self.get_object()
        stage_id = request.query_params.get('stage')
        icon_url = champion_icon_memo(request)
        champ_data = {}

        perf_qs = PlayerPerformance.objects.filter(game__match__event=event, champion__isnull=False).select_related('game', 'champion')
        game_qs = Game.objects.filter(match__event=event).prefetch_related('team1_bans', 'team2_bans')
        if stage_id:
            perf_qs = perf_qs.filter(game__match__stage_id=stage_id)
            game_qs = game_qs.filter(match__stage_id=stage_id)

        # Picks and wins per role from PlayerPerformance (has role info)
        for perf in perf_qs:
            champ = perf.champion
            s = champ_data.setdefault(champ.id, {
                'id': champ.id, 'name': champ.name, 'icon_url': icon_url(champ),
                'bans': 0, 'picks_by_role': {}, 'wins_by_role': {},
                'kills': 0, 'deaths': 0, 'assists': 0, 'kda_by_role': {},
            })
            role = perf.role
            s['picks_by_role'][role] = s['picks_by_role'].get(role, 0) + 1
            s['kills'] += perf.kills
            s['deaths'] += perf.deaths
            s['assists'] += perf.assists
            rk = s['kda_by_role'].setdefault(role, {'kills': 0, 'deaths': 0, 'assists': 0})
            rk['kills'] += perf.kills
            rk['deaths'] += perf.deaths
            rk['assists'] += perf.assists
            if perf.side == perf.game.winner:
                s['wins_by_role'][role] = s['wins_by_role'].get(role, 0) + 1

        # Bans from Game M2M — total across all roles, unchanged by role filter
        for game in game_qs:
            for champ in [*game.team1_bans.all(), *game.team2_bans.all()]:
                s = champ_data.setdefault(champ.id, {
                    'id': champ.id, 'name': champ.name, 'icon_url': icon_url(champ),
                    'bans': 0, 'picks_by_role': {}, 'wins_by_role': {},
                    'kills': 0, 'deaths': 0, 'assists': 0, 'kda_by_role': {},
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
        else:
            qs = qs.select_related('event', 'event__league')
        return qs

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return MatchDetailSerializer
        return MatchListSerializer

    filterset_class = MatchFilter

    @action(detail=True, methods=['get'], url_path='h2h')
    def h2h(self, request, pk=None):
        match = self.get_object()
        t1, t2 = match.team1, match.team2
        qs = Match.objects.filter(
            Q(team1=t1, team2=t2) | Q(team1=t2, team2=t1),
            winner__isnull=False,
        ).exclude(pk=match.pk).select_related('event', 'event__league').annotate(
            s1=Sum(Case(
                When(games__winner=1, games__team1=F('team1'), then=1),
                When(games__winner=2, games__team2=F('team1'), then=1),
                default=0, output_field=IntegerField(),
            )),
            s2=Sum(Case(
                When(games__winner=1, games__team1=F('team2'), then=1),
                When(games__winner=2, games__team2=F('team2'), then=1),
                default=0, output_field=IntegerField(),
            )),
        ).order_by('-datetime_utc')[:20]

        # Build roster logo map for these matches
        team_names = {t1, t2}
        from .models import TeamRoster
        rosters = TeamRoster.objects.filter(name__in=team_names).select_related('org')
        logo_map = {}
        for r in rosters:
            if r.name and r.org and r.org.logo and r.name not in logo_map:
                logo_map[r.name] = request.build_absolute_uri(r.org.logo.url)

        results = []
        for m in qs:
            # Normalise so t1/t2 always refers to the current match's perspective
            if m.team1 == t1:
                score1, score2, winner_is_t1 = (m.s1 or 0), (m.s2 or 0), m.winner == 1
            else:
                score1, score2, winner_is_t1 = (m.s2 or 0), (m.s1 or 0), m.winner == 2
            results.append({
                'id': m.id,
                'datetime_utc': m.datetime_utc,
                'event_name': m.event.name,
                'event_id': m.event.id,
                'league': m.event.league.short_name or m.event.league.name,
                'league_logo': request.build_absolute_uri(m.event.league.logo.url) if m.event.league.logo else None,
                'tab': m.tab,
                'patch': m.patch,
                'best_of': m.best_of,
                'team1': t1,
                'team2': t2,
                'team1_score': score1,
                'team2_score': score2,
                'team1_logo': logo_map.get(t1),
                'team2_logo': logo_map.get(t2),
                'winner': 1 if winner_is_t1 else 2,
            })
        return Response({'results': results})

    @action(detail=True, methods=['patch'], url_path='bracket')
    def bracket(self, request, pk=None):
        match = self.get_object()
        ser = MatchBracketSerializer(match, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        updated = self.get_queryset().get(pk=match.pk)
        return Response(MatchListSerializer(updated, context={'request': request}).data)

    @action(detail=False, methods=['post'], url_path='rename-column')
    def rename_column(self, request):
        event_id = request.data.get('event')
        stage_id = request.data.get('stage')
        bracket_col = request.data.get('bracket_col')
        tab = request.data.get('tab', '')
        is_lower = request.data.get('is_lower_bracket')
        if not event_id or bracket_col is None:
            return Response({'error': 'event and bracket_col are required'}, status=drf_status.HTTP_400_BAD_REQUEST)
        qs = Match.objects.filter(event_id=event_id, bracket_col=bracket_col)
        if stage_id:
            qs = qs.filter(stage_id=stage_id)
        if is_lower is not None:
            qs = qs.filter(is_lower_bracket=bool(is_lower))
        qs.update(tab=tab)
        return Response({'ok': True})


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
                'performances__rating',
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

        # "Upcoming" = next unplayed matches, soonest first. We can't filter on
        # datetime_utc__gte=now: playoff bracket slots are folded into normal
        # events as unplayed matches but carry Leaguepedia placeholder dates that
        # can already be in the recent past, which would hide them here (and they
        # have no winner, so they're absent from "recent" too). Order by date so
        # the nearest matches surface first, with undated (TBD) matches last.
        upcoming = (
            Match.objects
            .annotate(**score_annotation)
            .select_related('event', 'event__league')
            .filter(winner__isnull=True)
            .order_by(F('datetime_utc').asc(nulls_last=True))[:5]
        )

        recent = (
            Match.objects
            .annotate(**score_annotation)
            .select_related('event', 'event__league')
            .exclude(winner__isnull=True)
            .order_by('-datetime_utc')[:5]
        )

        active_events = list(Event.objects.filter(is_active=True))
        icon_url = champion_icon_memo(request)
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
                    'icon_url': icon_url(champ),
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


class HomeMatchesView(APIView):
    """Flat, date-ordered window of matches for the FotMob-style home feed.

    Returns the most recent finished matches plus the next scheduled fixtures
    (only matches with a known kickoff time), sorted ascending by datetime so
    the client can group them by day and let the user page through dates.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        recent_n = max(1, min(int(request.query_params.get('recent', 60)), 200))
        upcoming_n = max(1, min(int(request.query_params.get('upcoming', 60)), 200))

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

        base = (
            Match.objects
            .annotate(**score_annotation)
            .select_related('event', 'event__league')
            .filter(datetime_utc__isnull=False)
        )
        now = timezone.now()
        recent = list(base.exclude(winner__isnull=True).order_by('-datetime_utc')[:recent_n])
        upcoming = list(base.filter(winner__isnull=True, datetime_utc__gte=now).order_by('datetime_utc')[:upcoming_n])

        matches = recent + upcoming
        matches.sort(key=lambda m: m.datetime_utc)

        # Resolve team crests and short names in one batched query.
        event_ids = {m.event_id for m in matches}
        logo_map = {}
        short_map = {}
        for r in (
            TeamRoster.objects
            .filter(event_id__in=event_ids, name__isnull=False)
            .select_related('org')
        ):
            key = (r.event_id, r.name)
            if r.org_id and r.org.logo:
                logo_map[key] = request.build_absolute_uri(r.org.logo.url)
            if r.org_id and r.org.short_name:
                short_map[key] = r.org.short_name

        data = MatchListSerializer(matches, many=True, context={'request': request}).data
        for d in data:
            ev = d['event']
            d['team1_logo'] = logo_map.get((ev, d['team1']))
            d['team2_logo'] = logo_map.get((ev, d['team2']))
            d['team1_short'] = short_map.get((ev, d['team1']))
            d['team2_short'] = short_map.get((ev, d['team2']))

        return Response({
            'server_time': now.isoformat(),
            'matches': data,
        })


class HomeStandingsView(APIView):
    """Top-3 standings per league for the home side rail.

    For every league we pick its current event (an active one if flagged, else
    its latest) and rank teams by wins from that event's completed matches.
    Leagues with no decided matches yet are skipped; active leagues sort first.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        active_events = list(Event.objects.filter(is_active=True).select_related('league'))
        active_by_league = {}
        for ev in active_events:
            active_by_league.setdefault(ev.league_id, ev)

        results = []
        for lg in League.objects.all():
            events = list(lg.events.all())
            if not events:
                continue
            current = active_by_league.get(lg.id)
            if current is None:
                current = max(events, key=lambda e: (e.year or 0, e.start_date or date.min))

            # Logos (and the valid team set) come from the event's rosters.
            team_logo = {}
            stats = {}
            for r in (
                TeamRoster.objects.filter(event=current).select_related('org').exclude(name='TBD')
            ):
                if not r.name:
                    continue
                stats.setdefault(r.name, {'wins': 0, 'losses': 0})
                if r.org and r.org.logo:
                    team_logo[r.name] = request.build_absolute_uri(r.org.logo.url)

            for m in Match.objects.filter(event=current).exclude(winner__isnull=True).only('team1', 'team2', 'winner'):
                winner = m.team1 if m.winner == 1 else m.team2
                loser = m.team2 if m.winner == 1 else m.team1
                stats.setdefault(winner, {'wins': 0, 'losses': 0})['wins'] += 1
                stats.setdefault(loser, {'wins': 0, 'losses': 0})['losses'] += 1

            rows = []
            for name, s in stats.items():
                gp = s['wins'] + s['losses']
                if gp == 0:
                    continue
                rows.append({
                    'team': name,
                    'logo': team_logo.get(name),
                    'wins': s['wins'],
                    'losses': s['losses'],
                    'win_rate': round(s['wins'] / gp * 100),
                })
            if not rows:
                continue
            rows.sort(key=lambda x: (-x['wins'], -x['win_rate'], x['losses']))
            top = rows[:3]
            for i, row in enumerate(top):
                row['placement'] = i + 1

            results.append({
                'league': {
                    'id': lg.id,
                    'name': lg.name,
                    'short_name': lg.short_name,
                    'logo': request.build_absolute_uri(lg.logo.url) if lg.logo else None,
                },
                'event_name': current.name,
                'is_active': lg.id in active_by_league,
                'standings': top,
            })

        results.sort(key=lambda x: (not x['is_active'], x['league']['name']))
        return Response({'leagues': results})


class ChampionStatsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        limit = int(request.query_params.get('limit', 6))

        champ_data = {}

        def champ_entry(champ):
            # icon_url() builds an absolute URL, which is too costly to recompute
            # for every one of the tens of thousands of rows below — so memoise it
            # per champion here rather than inside the hot setdefault() calls.
            s = champ_data.get(champ.id)
            if s is None:
                s = champ_data[champ.id] = {
                    'id': champ.id, 'name': champ.name,
                    'icon_url': champ.icon_url(request),
                    'picks': 0, 'wins': 0, 'bans': 0,
                }
            return s

        for perf in (
            PlayerPerformance.objects
            .filter(champion__isnull=False)
            .select_related('champion', 'game')
            .only('side', 'kills', 'deaths', 'assists',
                  'game__winner', 'champion__id', 'champion__name',
                  'champion__riot_id', 'champion__patch')
        ):
            s = champ_entry(perf.champion)
            s['picks'] += 1
            if perf.side == perf.game.winner:
                s['wins'] += 1

        for game in Game.objects.prefetch_related('team1_bans', 'team2_bans'):
            for champ in [*game.team1_bans.all(), *game.team2_bans.all()]:
                champ_entry(champ)['bans'] += 1

        for s in champ_data.values():
            s['win_rate'] = round(s['wins'] / s['picks'] * 100, 1) if s['picks'] else None

        champs = list(champ_data.values())

        top_picks = sorted(champs, key=lambda x: -x['picks'])[:limit]
        top_bans = sorted(champs, key=lambda x: -x['bans'])[:limit]
        min_picks = max(5, len(champs) // 20)
        top_wr = sorted(
            [c for c in champs if c['picks'] >= min_picks and c['win_rate'] is not None],
            key=lambda x: -x['win_rate'],
        )[:limit]

        return Response({
            'top_picks': top_picks,
            'top_bans': top_bans,
            'top_win_rate': top_wr,
        })


class ChampionProfileView(APIView):
    """Aggregated competitive profile for a single champion, optionally filtered
    by year. Mirrors the player profile: headline stats, best players, best
    regions, role split, side split and recent games — alongside the champion's
    static data (title, tags, abilities)."""

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

    def get(self, request, pk):
        from lol.models import Champion

        champion = (
            Champion.objects
            .prefetch_related('abilities')
            .filter(pk=pk)
            .first()
        )
        if not champion:
            return Response({'detail': 'Champion not found'},
                            status=drf_status.HTTP_404_NOT_FOUND)

        perf_qs = (
            PlayerPerformance.objects
            .filter(champion_id=pk)
            .select_related('game', 'game__match', 'game__match__event',
                            'game__match__event__league')
        )
        all_perfs = list(perf_qs)

        years = sorted(
            {p.game.match.event.year for p in all_perfs if p.game.match.event.year},
            reverse=True,
        )

        # Year filter (default: all years).
        year = request.query_params.get('year')
        sel_year = None
        if year == 'latest':
            sel_year = years[0] if years else None
        elif year:
            try:
                sel_year = int(year)
            except ValueError:
                sel_year = None
        perfs = (
            [p for p in all_perfs if p.game.match.event.year == sel_year]
            if sel_year is not None else all_perfs
        )

        # ── Bans (from Game.team1_bans / team2_bans), same year scope ──────────
        ban_games_qs = Game.objects.filter(
            Q(team1_bans=champion) | Q(team2_bans=champion)
        )
        if sel_year is not None:
            ban_games_qs = ban_games_qs.filter(match__event__year=sel_year)
        ban_game_ids = set(ban_games_qs.values_list('id', flat=True))
        bans = len(ban_game_ids)

        # Total games in scope → pick / ban / presence rates.
        total_games_qs = Game.objects.all()
        if sel_year is not None:
            total_games_qs = total_games_qs.filter(match__event__year=sel_year)
        total_games = total_games_qs.count()

        picked_game_ids = {p.game_id for p in perfs}
        presence_ids = picked_game_ids | ban_game_ids

        # ── Headline aggregate ────────────────────────────────────────────────
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

        # Blue / red side split.
        blue = [p for p in perfs if p.side == 1]
        red = [p for p in perfs if p.side == 2]
        blue_wins = sum(1 for p in blue if p.game.winner == 1)
        red_wins = sum(1 for p in red if p.game.winner == 2)

        stats = {
            'games': games,
            'wins': wins,
            'losses': losses,
            'win_rate': round(wins / games * 100, 1) if games else None,
            'bans': bans,
            'pick_rate': round(len(picked_game_ids) / total_games * 100, 1) if total_games else None,
            'ban_rate': round(bans / total_games * 100, 1) if total_games else None,
            'presence': round(len(presence_ids) / total_games * 100, 1) if total_games else None,
            'avg_kills': round(total_k / games, 1) if games else 0,
            'avg_deaths': round(total_d / games, 1) if games else 0,
            'avg_assists': round(total_a / games, 1) if games else 0,
            'kda': round((total_k + total_a) / max(total_d, 1), 2) if games else 0,
            'avg_cs': round(total_cs / games, 1) if games else 0,
            'avg_cs_per_min': round(sum(cs_per_min_vals) / len(cs_per_min_vals), 2) if cs_per_min_vals else None,
            'avg_gold': round(total_gold / games) if games else 0,
            'avg_damage': round(total_dmg / games) if games else 0,
            'blue_games': len(blue),
            'blue_win_rate': round(blue_wins / len(blue) * 100, 1) if blue else None,
            'red_games': len(red),
            'red_win_rate': round(red_wins / len(red) * 100, 1) if red else None,
        }

        # ── Role distribution ─────────────────────────────────────────────────
        role_map = {}
        for p in perfs:
            role = p.role or 'Unknown'
            r = role_map.setdefault(role, {'role': role, 'games': 0, 'wins': 0})
            r['games'] += 1
            if p.side == p.game.winner:
                r['wins'] += 1
        roles = sorted(role_map.values(), key=lambda x: -x['games'])
        for r in roles:
            r['win_rate'] = round(r['wins'] / r['games'] * 100, 1) if r['games'] else None
            r['share'] = round(r['games'] / games * 100, 1) if games else 0

        # ── Best players ──────────────────────────────────────────────────────
        player_map = {}
        for p in perfs:
            s = player_map.setdefault(p.name, {
                'name': p.name, 'team': p.team,
                'games': 0, 'wins': 0, 'kills': 0, 'deaths': 0, 'assists': 0,
            })
            s['games'] += 1
            s['team'] = p.team  # most recent wins (perfs unordered, fine)
            if p.side == p.game.winner:
                s['wins'] += 1
            s['kills'] += p.kills
            s['deaths'] += p.deaths
            s['assists'] += p.assists

        best_players = []
        for s in player_map.values():
            g = s['games']
            best_players.append({
                'name': s['name'],
                'team': s['team'],
                'games': g,
                'win_rate': round(s['wins'] / g * 100, 1),
                'kda': round((s['kills'] + s['assists']) / max(s['deaths'], 1), 2),
                'avg_kills': round(s['kills'] / g, 1),
                'avg_deaths': round(s['deaths'] / g, 1),
                'avg_assists': round(s['assists'] / g, 1),
            })
        best_players.sort(key=lambda x: (-x['games'], -x['win_rate']))
        best_players = best_players[:10]

        # Resolve player portraits + team logos for the shortlist.
        if best_players:
            names = [b['name'] for b in best_players]
            img_map = {}
            for pl in Player.objects.filter(name__in=names):
                src = None
                if pl.image:
                    src = request.build_absolute_uri(pl.image.url)
                elif pl.leaguepedia_image:
                    src = pl.leaguepedia_image
                img_map.setdefault(pl.name, src)
            team_names = {b['team'] for b in best_players if b['team']}
            logo_map = {}
            if team_names:
                for roster in (TeamRoster.objects.filter(name__in=team_names)
                               .select_related('org')):
                    if (roster.org and roster.org.logo and roster.name
                            and roster.name not in logo_map):
                        logo_map[roster.name] = request.build_absolute_uri(roster.org.logo.url)
            for b in best_players:
                b['image'] = img_map.get(b['name'])
                b['team_logo'] = logo_map.get(b['team'])

        # ── Best regions (grouped by league) ──────────────────────────────────
        region_map = {}
        for p in perfs:
            lg = p.game.match.event.league
            r = region_map.setdefault(lg.id, {
                'id': lg.id,
                'name': lg.short_name or lg.name,
                'full_name': lg.name,
                'logo': request.build_absolute_uri(lg.logo.url) if lg.logo else None,
                'games': 0, 'wins': 0,
            })
            r['games'] += 1
            if p.side == p.game.winner:
                r['wins'] += 1
        best_regions = []
        for r in region_map.values():
            g = r['games']
            best_regions.append({**r, 'win_rate': round(r['wins'] / g * 100, 1)})
        best_regions.sort(key=lambda x: (-x['games'], -x['win_rate']))

        # ── Recent games ──────────────────────────────────────────────────────
        recent_perfs = sorted(
            perfs,
            key=lambda p: p.game.datetime_utc or p.game.match.datetime_utc or timezone.now(),
            reverse=True,
        )[:30]
        team_names_set = {p.team for p in recent_perfs}
        for p in recent_perfs:
            team_names_set.add(p.game.team1)
            team_names_set.add(p.game.team2)
        recent_logos = {}
        if team_names_set:
            for roster in (TeamRoster.objects.filter(name__in=team_names_set)
                           .select_related('org')):
                if (roster.org and roster.org.logo and roster.name
                        and roster.name not in recent_logos):
                    recent_logos[roster.name] = request.build_absolute_uri(roster.org.logo.url)

        recent_games = []
        for p in recent_perfs:
            game = p.game
            match = game.match
            event = match.event
            opp = game.team2 if p.side == 1 else game.team1
            won = p.side == game.winner if game.winner else None
            recent_games.append({
                'game_id': game.id,
                'match_id': match.id,
                'datetime': (game.datetime_utc or match.datetime_utc).isoformat()
                            if (game.datetime_utc or match.datetime_utc) else None,
                'event': event.name,
                'league': event.league.short_name or event.league.name,
                'player': p.name,
                'role': p.role,
                'team': p.team,
                'team_logo': recent_logos.get(p.team),
                'opponent': opp,
                'opponent_logo': recent_logos.get(opp),
                'won': won,
                'kills': p.kills,
                'deaths': p.deaths,
                'assists': p.assists,
                'cs': p.cs,
            })

        abilities = [{
            'id': a.id,
            'ability_type': a.ability_type,
            'name': a.name,
            'description': a.description,
            'cooldown': a.cooldown,
            'cost': a.cost,
            'image_url': (f'https://ddragon.leagueoflegends.com/cdn/{champion.patch}/img/'
                          f'{"passive" if a.ability_type == "passive" else "spell"}/{a.image}'
                          if a.image and champion.patch else None),
        } for a in champion.abilities.all()]

        champion_data = {
            'id': champion.id,
            'name': champion.name,
            'title': champion.title,
            'tags': champion.tags,
            'resource_type': champion.resource_type,
            'icon_url': champion.icon_url(request),
            'splash_url': (f'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/'
                           f'{champion.riot_id}_0.jpg' if champion.riot_id else None),
            'patch': champion.patch,
        }

        return Response({
            'champion': champion_data,
            'abilities': abilities,
            'available_years': years,
            'stats': stats,
            'roles': roles,
            'best_players': best_players,
            'best_regions': best_regions,
            'recent_games': recent_games,
        })


class PlayerProfileView(APIView):
    """Aggregated profile for a player, optionally filtered by year/event."""

    permission_classes = [AllowAny]

    # Six role-relative percentile traits shown on the player page radar.
    # All are "higher is better" so percentile rank applies directly.
    TRAIT_DEFS = [
        ('kda', 'KDA'),
        ('cs_min', 'CS / min'),
        ('dmg_min', 'Damage / min'),
        ('gold_min', 'Gold / min'),
        ('kills', 'Kills / game'),
        ('vision_min', 'Vision / min'),
    ]
    TRAIT_FMT = {
        'kda': lambda v: f'{v:.2f}',
        'cs_min': lambda v: f'{v:.1f}',
        'dmg_min': lambda v: f'{v:,.0f}',
        'gold_min': lambda v: f'{v:,.0f}',
        'kills': lambda v: f'{v:.1f}',
        'vision_min': lambda v: f'{v:.2f}',
    }

    def _gamelength_minutes(self, gl):
        if not gl or ':' not in gl:
            return None
        try:
            mm, ss = gl.split(':')
            mins = int(mm) + int(ss) / 60
            return mins if mins > 0 else None
        except (ValueError, ZeroDivisionError):
            return None

    def _per_min_metrics(self, perf_iter, gl_getter):
        """Aggregate raw kills/deaths/assists + per-minute lists for one player."""
        agg = {'gp': 0, 'k': 0, 'd': 0, 'a': 0,
               'cs_m': [], 'dmg_m': [], 'gold_m': [], 'vis_m': []}
        for p in perf_iter:
            agg['gp'] += 1
            agg['k'] += p['kills']
            agg['d'] += p['deaths']
            agg['a'] += p['assists']
            mins = self._gamelength_minutes(gl_getter(p))
            if mins:
                agg['cs_m'].append(p['cs'] / mins)
                agg['dmg_m'].append(p['damage_to_champions'] / mins)
                agg['gold_m'].append(p['gold'] / mins)
                agg['vis_m'].append(p['vision_score'] / mins)
        return agg

    @staticmethod
    def _metric_values(agg):
        """Collapse an aggregate into the six trait metric values (or None)."""
        avg = lambda xs: sum(xs) / len(xs) if xs else None
        gp = agg['gp']
        return {
            'kda': (agg['k'] + agg['a']) / max(agg['d'], 1) if gp else None,
            'cs_min': avg(agg['cs_m']),
            'dmg_min': avg(agg['dmg_m']),
            'gold_min': avg(agg['gold_m']),
            'kills': agg['k'] / gp if gp else None,
            'vision_min': avg(agg['vis_m']),
        }

    def _compute_traits(self, perfs, role, cohort_year):
        """Percentile traits for the player vs every same-role player in the cohort."""
        if not perfs or not role:
            return None

        # The player's own metrics, restricted to performances in this role.
        own = [
            {'kills': p.kills, 'deaths': p.deaths, 'assists': p.assists,
             'cs': p.cs, 'gold': p.gold,
             'damage_to_champions': p.damage_to_champions,
             'vision_score': p.vision_score, '_gl': p.game.gamelength}
            for p in perfs if p.role == role
        ]
        if not own:
            return None
        me = self._metric_values(self._per_min_metrics(own, lambda p: p['_gl']))

        # Cohort: every same-role performance in the same year, aggregated per player.
        cohort_qs = (
            PlayerPerformance.objects
            .filter(role=role)
            .values('name', 'kills', 'deaths', 'assists', 'cs', 'gold',
                    'damage_to_champions', 'vision_score', 'game__gamelength')
        )
        if cohort_year is not None:
            cohort_qs = cohort_qs.filter(game__match__event__year=cohort_year)

        by_player = {}
        for row in cohort_qs:
            by_player.setdefault(row['name'], []).append(row)

        MIN_GP = 3
        dists = {key: [] for key, _ in self.TRAIT_DEFS}
        for rows in by_player.values():
            if len(rows) < MIN_GP:
                continue
            vals = self._metric_values(
                self._per_min_metrics(rows, lambda r: r['game__gamelength'])
            )
            for key, _ in self.TRAIT_DEFS:
                if vals[key] is not None:
                    dists[key].append(vals[key])

        def pct_rank(values, x):
            if not values or x is None:
                return None
            below = sum(1 for v in values if v <= x)
            return round(below / len(values) * 100)

        traits = [{
            'key': key,
            'label': label,
            'value': round(me[key], 2) if me[key] is not None else None,
            'display': self.TRAIT_FMT[key](me[key]) if me[key] is not None else '—',
            'percentile': pct_rank(dists[key], me[key]),
        } for key, label in self.TRAIT_DEFS]

        sample = max((len(dists[k]) for k, _ in self.TRAIT_DEFS), default=0)
        return {'role': role, 'sample': sample, 'traits': traits}

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
        icon_url = champion_icon_memo(request)
        champ_stats = {}
        for p in perfs:
            if not p.champion:
                continue
            s = champ_stats.setdefault(p.champion.id, {
                'id': p.champion.id,
                'name': p.champion.name,
                'icon_url': icon_url(p.champion),
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
                'champion_icon': icon_url(p.champion) if p.champion else None,
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

        # Percentile traits — vs every player in the same role + year cohort.
        cohort_year = None
        if year == 'latest':
            cohort_year = years[0] if years else None
        elif year:
            try:
                cohort_year = int(year)
            except ValueError:
                cohort_year = None
        from collections import Counter
        role_counts = Counter(p.role for p in perfs if p.role)
        traits_role = (
            role_counts.most_common(1)[0][0] if role_counts else current_role
        )
        traits = self._compute_traits(perfs, traits_role, cohort_year)

        # Upcoming matches for any team this player has appeared on.
        upcoming_matches = []
        player_team_names = {p.team for p in all_perfs if p.team}
        if player_team_names:
            now = timezone.now()
            up_qs = list(
                Match.objects
                .filter(Q(team1__in=player_team_names) | Q(team2__in=player_team_names))
                .filter(datetime_utc__gt=now, winner__isnull=True)
                .exclude(team1='TBD').exclude(team2='TBD')
                .select_related('event', 'event__league')
                .order_by('datetime_utc')[:6]
            )
            up_team_set = set()
            for m in up_qs:
                up_team_set.update([m.team1, m.team2])
            up_logos: dict[str, str] = {}
            if up_team_set:
                for roster in (
                    TeamRoster.objects
                    .filter(name__in=up_team_set)
                    .select_related('org')
                ):
                    if (roster.org and roster.org.logo and roster.name
                            and roster.name not in up_logos):
                        up_logos[roster.name] = request.build_absolute_uri(roster.org.logo.url)
            for m in up_qs:
                upcoming_matches.append({
                    'id': m.id,
                    'datetime': m.datetime_utc.isoformat() if m.datetime_utc else None,
                    'event': m.event.name,
                    'best_of': m.best_of,
                    'team1': m.team1,
                    'team2': m.team2,
                    'team1_logo': up_logos.get(m.team1),
                    'team2_logo': up_logos.get(m.team2),
                })

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
            'traits': traits,
            'best_champions': best_champions,
            'recent_games': recent_games,
            'upcoming_matches': upcoming_matches,
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

        # Aggregate match + game stats
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

        # Champion stats: picks, wins, bans (per team)
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

        icon_url = champion_icon_memo(request)
        champ_stats = {}
        for p in perfs:
            c = p.champion
            s = champ_stats.setdefault(c.id, {
                'id': c.id,
                'name': c.name,
                'icon_url': icon_url(c),
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
                            'id': c.id, 'name': c.name, 'icon_url': icon_url(c),
                            'picks': 0, 'wins': 0, 'bans': 0,
                            'kills': 0, 'deaths': 0, 'assists': 0,
                        })
                        s['bans'] += 1
                if we_are_t2:
                    for c in g.team2_bans.all():
                        s = champ_stats.setdefault(c.id, {
                            'id': c.id, 'name': c.name, 'icon_url': icon_url(c),
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

        # Player stats on this team
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

        # Current roster: latest event with players for this org
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

        # Recent matches
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
