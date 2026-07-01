from rest_framework import serializers
from . import rating as rating_engine
from .models import (
    League,
    Event,
    EventStage,
    Organization,
    Player,
    TeamRoster,
    RosterPlayer,
    Match,
    Game,
    PlayerPerformance,
    PerformanceRating,
)
from lol.serializers import (
    ChampionListSerializer,
    ItemSerializer,
    SummonerSpellSerializer,
    RuneSerializer,
)


# ---------------------
# Lightweight / nested
# ---------------------


class LeagueSerializer(serializers.ModelSerializer):
    class Meta:
        model = League
        fields = ["id", "name", "short_name", "logo", "youtube", "instagram", "twitter", "twitch"]


class EventStageSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventStage
        fields = ["id", "name", "type", "order", "has_lower_bracket"]


class EventListSerializer(serializers.ModelSerializer):
    league = LeagueSerializer(read_only=True)
    stages = EventStageSerializer(many=True, read_only=True)

    class Meta:
        model = Event
        fields = [
            "id",
            "name",
            "league",
            "year",
            "start_date",
            "end_date",
            "is_active",
            "logo",
            "leaguepedia_page",
            "prize_pool",
            "stages",
        ]


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ["id", "name", "short_name", "logo", "color", "leaguepedia_page", "region"]


class PlayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = ["id", "name", "real_name", "image", "nationality", "birthdate", "age"]


class RosterPlayerSerializer(serializers.ModelSerializer):
    player = PlayerSerializer(read_only=True)

    class Meta:
        model = RosterPlayer
        fields = ["id", "player", "role", "is_starter"]


class TeamRosterListSerializer(serializers.ModelSerializer):
    org = OrganizationSerializer(read_only=True)

    class Meta:
        model = TeamRoster
        fields = ["id", "name", "org", "event"]


class TeamRosterDetailSerializer(TeamRosterListSerializer):
    players = RosterPlayerSerializer(many=True, read_only=True)
    event = EventListSerializer(read_only=True)

    class Meta(TeamRosterListSerializer.Meta):
        fields = [*TeamRosterListSerializer.Meta.fields, "players"]


# ---------------------
# Match / Game
# ---------------------


class MatchListSerializer(serializers.ModelSerializer):
    team1_score = serializers.IntegerField(read_only=True)
    team2_score = serializers.IntegerField(read_only=True)
    league_logo = serializers.SerializerMethodField()
    league_short_name = serializers.CharField(source='event.league.short_name', read_only=True, default=None)

    def get_league_logo(self, obj):
        logo = obj.event.league.logo
        if not logo:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(logo.url) if request else logo.url

    class Meta:
        model = Match
        fields = [
            "id",
            "match_id",
            "event",
            "team1",
            "team2",
            "winner",
            "best_of",
            "tab",
            "datetime_utc",
            "patch",
            "team1_score",
            "team2_score",
            "next_match",
            "bracket_col",
            "bracket_order",
            "is_lower_bracket",
            "is_final",
            "league_logo",
            "league_short_name",
        ]


class MatchBracketSerializer(serializers.ModelSerializer):
    """Write-only serializer for admin bracket wiring (per-match)."""
    class Meta:
        model = Match
        fields = ["bracket_col", "bracket_order", "next_match", "is_lower_bracket", "is_final"]


class GameListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Game
        fields = [
            "id",
            "game_id",
            "match",
            "game_number",
            "datetime_utc",
            "patch",
            "gamelength",
            "winner",
            "vod",
            "team1",
            "team2",
            "team1_kills",
            "team1_gold",
            "team1_towers",
            "team1_dragons",
            "team1_barons",
            "team1_rift_heralds",
            "team2_kills",
            "team2_gold",
            "team2_towers",
            "team2_dragons",
            "team2_barons",
            "team2_rift_heralds",
        ]


class PlayerPerformanceSerializer(serializers.ModelSerializer):
    champion = ChampionListSerializer(read_only=True)
    items = ItemSerializer(many=True, read_only=True)
    trinket = ItemSerializer(read_only=True)
    summoner_spell_d = SummonerSpellSerializer(read_only=True)
    summoner_spell_f = SummonerSpellSerializer(read_only=True)
    keystone_rune = RuneSerializer(read_only=True)
    runes = RuneSerializer(many=True, read_only=True)
    rating = serializers.SerializerMethodField()

    def get_rating(self, obj):
        try:
            r = obj.rating
        except PerformanceRating.DoesNotExist:
            return None
        breakdown = r.metric_breakdown or {}
        role = rating_engine.canonical_role(obj.role)
        eff = rating_engine.effective_weights(role, set(breakdown.keys()), r.tier == "enriched") if role else {}
        # One entry per metric: 0–100 score + how much it counts for this role.
        metrics = sorted(
            ({"key": k, "score": round(v, 1), "weight": round(eff.get(k, 0.0), 3)} for k, v in breakdown.items()),
            key=lambda m: m["weight"], reverse=True,
        )
        # Recover the win bonus so the UI can explain the points total.
        base = r.pr / 10.0
        won = (r.points - base - (1.0 if r.is_mvp else 0.0)) > 1.0
        return {
            "pr": round(r.pr, 1),
            "points": round(r.points, 1),
            "tier": r.tier,
            "is_mvp": r.is_mvp,
            "won": won,
            "contribution": round(r.contribution_share, 3),
            "metrics": metrics,
        }

    class Meta:
        model = PlayerPerformance
        fields = [
            "id",
            "name",
            "link",
            "team",
            "side",
            "role",
            "champion",
            "kills",
            "deaths",
            "assists",
            "cs",
            "gold",
            "damage_to_champions",
            "vision_score",
            "rating",
            "items",
            "trinket",
            "summoner_spell_d",
            "summoner_spell_f",
            "keystone_rune",
            "runes",
        ]


class PlayerPerformanceCompactSerializer(serializers.ModelSerializer):
    """Lighter serializer — IDs only for FK/M2M, used in game list views."""

    champion_name = serializers.CharField(source="champion.name", default=None)

    class Meta:
        model = PlayerPerformance
        fields = [
            "id",
            "name",
            "team",
            "side",
            "role",
            "champion_name",
            "kills",
            "deaths",
            "assists",
            "cs",
            "gold",
            "damage_to_champions",
        ]


class GameDetailSerializer(GameListSerializer):
    team1_picks = ChampionListSerializer(many=True, read_only=True)
    team1_bans = ChampionListSerializer(many=True, read_only=True)
    team2_picks = ChampionListSerializer(many=True, read_only=True)
    team2_bans = ChampionListSerializer(many=True, read_only=True)
    performances = PlayerPerformanceSerializer(many=True, read_only=True)

    class Meta(GameListSerializer.Meta):
        fields = [
            *GameListSerializer.Meta.fields,
            "team1_picks",
            "team1_bans",
            "team2_picks",
            "team2_bans",
            "performances",
            "gold_graph",
        ]


class MatchDetailSerializer(MatchListSerializer):
    event = EventListSerializer(read_only=True)
    games = GameListSerializer(many=True, read_only=True)

    class Meta(MatchListSerializer.Meta):
        fields = [*MatchListSerializer.Meta.fields, "games"]
