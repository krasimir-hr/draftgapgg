from django.db import models
from lol.models import Champion, Item, Rune, SummonerSpell

PLAYER_ROLES = [
    ('Top', 'Top'),
    ('Jungle', 'Jungle'),
    ('Mid', 'Mid'),
    ('Bot', 'Bot'),
    ('Support', 'Support'),
    ('Coach', 'Coach'),
    ('Sub', 'Sub'),
]


# -------------------------
# REGION / LEAGUE
# -------------------------

class League(models.Model):
    name = models.CharField(max_length=100, unique=True)
    short_name = models.CharField(max_length=100, blank=True, null=True)
    logo = models.ImageField(upload_to='leagues/', blank=True, null=True)
    youtube = models.URLField(max_length=200, blank=True, default='')
    instagram = models.URLField(max_length=200, blank=True, default='')
    twitter = models.URLField(max_length=200, blank=True, default='')
    twitch = models.URLField(max_length=200, blank=True, default='')

    def __str__(self):
        return self.name

class Event(models.Model):
    name = models.CharField(max_length=100)
    league = models.ForeignKey(League, on_delete=models.CASCADE, related_name='events')
    year = models.PositiveIntegerField(null=True, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=False)
    logo = models.ImageField(upload_to='events/', blank=True, null=True)
    leaguepedia_page = models.CharField(max_length=200, blank=True, null=True)
    prize_pool = models.CharField(max_length=50, blank=True, default='')

    is_fully_synced = models.BooleanField(default=False)
    last_synced_at = models.DateTimeField(null=True, blank=True)


    def __str__(self):
        return self.name


class EventStage(models.Model):
    """A distinct stage within an Event (e.g. regular League stage, Playoffs,
    Swiss stage, group stage).

    Lets a single Event (e.g. "LPL 2026 Split 2") hold both its regular-season
    matches and its playoff matches, with each Match tagged to the stage it
    belongs to. Stages are user-editable so the admin can build custom stages
    where the Leaguepedia/OE sync can't infer them automatically.
    """

    STAGE_TYPES = [
        ('league', 'League'),       # regular season / round robin
        ('playoff', 'Playoff'),     # single/double elim bracket
        ('swiss', 'Swiss'),
        ('group', 'Group'),
        ('play_in', 'Play-In'),
    ]

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='stages')
    name = models.CharField(max_length=100)  # "Regular Season", "Playoffs"
    type = models.CharField(max_length=20, choices=STAGE_TYPES, default='league')
    # True when this stage contains a lower/loser's bracket (double-elim playoffs).
    has_lower_bracket = models.BooleanField(default=False)
    # Display / chronological order of stages within an event.
    order = models.PositiveIntegerField(default=0)
    # Optional Leaguepedia OverviewPage this stage's matches were synced from,
    # for stages that map to a separate source page (e.g. a Playoffs page).
    leaguepedia_page = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        ordering = ['order', 'id']
        constraints = [
            models.UniqueConstraint(fields=['event', 'name'], name='unique_stage_per_event')
        ]

    def __str__(self):
        return f"{self.event.name} — {self.name}"


class Organization(models.Model):
    name = models.CharField(max_length=100)
    short_name = models.CharField(max_length=50)
    logo = models.ImageField(upload_to='teams/', blank=True, null=True)
    color = models.CharField(max_length=7, blank=True, default='')
    leaguepedia_page = models.CharField(max_length=200, blank=True, null=True)
    region = models.CharField(max_length=100, blank=True, null=True)

    def __str__(self):
        return self.name
    
class Player(models.Model):
    name = models.CharField(max_length=100)
    leaguepedia_page = models.CharField(max_length=200, unique=True, null=True, blank=True)
    real_name = models.CharField(max_length=200, blank=True, null=True)
    image = models.ImageField(upload_to='players/', blank=True, null=True)
    leaguepedia_image = models.CharField(max_length=300, blank=True, default='')
    nationality = models.CharField(max_length=200, blank=True, null=True)
    birthdate = models.DateField(null=True, blank=True)
    age = models.CharField(max_length=10, blank=True, null=True)

    def __str__(self):
        return self.name
    
class TeamRoster(models.Model):
    name = models.CharField(max_length=200, blank=True, null=True)
    org = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='rosters', blank=True, null=True)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='rosters', blank=True, null=True)

    def __str__(self):
        return f"{self.name} ({self.org}) at {self.event}"

class RosterPlayer(models.Model):
    roster = models.ForeignKey(TeamRoster, on_delete=models.CASCADE, related_name='players')
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='roster_entries')
    # Scraped rosters can list combined roles, e.g. "Coach,Jungle".
    role = models.CharField(max_length=50, choices=PLAYER_ROLES)
    is_starter = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.player.name} ({self.role})"

# Add these to your existing core/models.py

class Match(models.Model):
    match_id = models.CharField(max_length=200, unique=True)  # "LCK/2026 Season/Rounds 1-2_Week 1_1"
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='matches')
    stage = models.ForeignKey(
        EventStage, on_delete=models.SET_NULL, null=True, blank=True, related_name='matches'
    )
    team1 = models.CharField(max_length=100)
    team2 = models.CharField(max_length=100)
    winner = models.IntegerField(null=True, blank=True)  # 1 or 2
    best_of = models.IntegerField(default=3)
    tab = models.CharField(max_length=100, blank=True)  # "Week 1"
    datetime_utc = models.DateTimeField(null=True, blank=True)
    patch = models.CharField(max_length=20, blank=True)

    # Playoff bracket wiring — self-referential FKs for bracket tree traversal.
    previous_match = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='next_matches',
    )
    next_match = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='previous_matches',
    )
    # Which bracket leg this match belongs to when the stage has_lower_bracket.
    is_lower_bracket = models.BooleanField(default=False)

    # Bracket layout — admin-controlled.
    # bracket_col:   which column (1, 2, 3…) this match belongs to.
    # bracket_order: vertical slot within that column (1 = topmost), unique per col.
    # is_final:      marks this match as a "grand final" — centered on full bracket height.
    bracket_col   = models.PositiveSmallIntegerField(null=True, blank=True)
    bracket_order = models.PositiveSmallIntegerField(null=True, blank=True)
    is_final      = models.BooleanField(default=False)

    class Meta:
        verbose_name_plural = "matches"
        constraints = [
            models.UniqueConstraint(
                fields=['event', 'bracket_col', 'bracket_order'],
                condition=models.Q(bracket_order__isnull=False, bracket_col__isnull=False),
                name='unique_bracket_order_per_col',
            )
        ]

    def __str__(self):
        return f"{self.team1} vs {self.team2} ({self.match_id})"


class Game(models.Model):
    game_id = models.CharField(max_length=200, unique=True)
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name='games')
    game_number = models.IntegerField(default=1)
    datetime_utc = models.DateTimeField(null=True, blank=True)
    patch = models.CharField(max_length=20, blank=True)
    gamelength = models.CharField(max_length=10, blank=True)
    winner = models.IntegerField(null=True, blank=True)
    vod = models.URLField(blank=True)

    # Team 1
    team1 = models.CharField(max_length=100)
    team1_picks = models.ManyToManyField(Champion, blank=True, related_name='team1_picks')
    team1_bans = models.ManyToManyField(Champion, blank=True, related_name='team1_bans')
    team1_kills = models.IntegerField(default=0)
    team1_gold = models.IntegerField(default=0)
    team1_towers = models.IntegerField(default=0)
    team1_dragons = models.IntegerField(default=0)
    team1_barons = models.IntegerField(default=0)
    team1_rift_heralds = models.IntegerField(default=0)

    # Team 2
    team2 = models.CharField(max_length=100)
    team2_picks = models.ManyToManyField(Champion, blank=True, related_name='team2_picks')
    team2_bans = models.ManyToManyField(Champion, blank=True, related_name='team2_bans')
    team2_kills = models.IntegerField(default=0)
    team2_gold = models.IntegerField(default=0)
    team2_towers = models.IntegerField(default=0)
    team2_dragons = models.IntegerField(default=0)
    team2_barons = models.IntegerField(default=0)
    team2_rift_heralds = models.IntegerField(default=0)

    # Riot API identifiers (for timeline sync)
    riot_platform_id = models.CharField(max_length=10, blank=True)
    riot_platform_game_id = models.CharField(max_length=30, blank=True)

    # True once a matching Oracle's Elixir row with datacompleteness='complete'
    # has been ingested, unlocking the Tier-2 (enriched) rating metrics.
    is_enriched = models.BooleanField(default=False)

    # Per-minute gold graph: [{minute, t1, t2}, ...]
    gold_graph = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ['game_number']

    def __str__(self):
        return f"Game {self.game_number} — {self.team1} vs {self.team2}"


class PlayerPerformance(models.Model):
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name='performances')
    name = models.CharField(max_length=100)
    link = models.CharField(max_length=200, blank=True)
    team = models.CharField(max_length=100)
    SIDES = [(1, 'Blue'), (2, 'Red')]
    side = models.IntegerField(default=1, choices=SIDES)
    role = models.CharField(max_length=50)
    champion = models.ForeignKey(Champion, on_delete=models.SET_NULL, null=True, blank=True)

    # Stats
    kills = models.IntegerField(default=0)
    deaths = models.IntegerField(default=0)
    assists = models.IntegerField(default=0)
    cs = models.IntegerField(default=0)
    gold = models.IntegerField(default=0)
    damage_to_champions = models.IntegerField(default=0)
    # Tier-1 advanced stat available from Leaguepedia ScoreboardPlayers.
    vision_score = models.IntegerField(default=0)

    # Build
    items = models.ManyToManyField(Item, blank=True, related_name='performances')
    trinket = models.ForeignKey(Item, on_delete=models.SET_NULL, null=True, blank=True, related_name='trinket_performances')
    summoner_spell_d = models.ForeignKey(SummonerSpell, on_delete=models.SET_NULL, null=True, blank=True, related_name='spell_d_performances')
    summoner_spell_f = models.ForeignKey(SummonerSpell, on_delete=models.SET_NULL, null=True, blank=True, related_name='spell_f_performances')
    keystone_rune = models.ForeignKey(Rune, on_delete=models.SET_NULL, null=True, blank=True, related_name='keystone_performances')
    runes = models.ManyToManyField(Rune, blank=True, related_name='performances')

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['game', 'name', 'team'], name='unique_player_game')
        ]
        ordering = ['side', 'role']

    def __str__(self):
        champ_name = self.champion.name if self.champion else "?"
        return f"{self.name} ({champ_name}) — {self.kills}/{self.deaths}/{self.assists}"


class PerformanceAdvanced(models.Model):
    """Tier-2 stats sourced from Oracle's Elixir (enriched games only).

    1:1 with PlayerPerformance. All fields nullable because they only exist for
    games whose OE row is datacompleteness='complete' (e.g. not LPL).
    """
    performance = models.OneToOneField(
        PlayerPerformance, on_delete=models.CASCADE, related_name='advanced'
    )

    # Laning (player minus lane opponent)
    golddiffat10 = models.FloatField(null=True, blank=True)
    golddiffat15 = models.FloatField(null=True, blank=True)
    csdiffat15 = models.FloatField(null=True, blank=True)
    xpdiffat15 = models.FloatField(null=True, blank=True)

    # Damage / economy shares (precomputed by OE)
    damageshare = models.FloatField(null=True, blank=True)
    earnedgoldshare = models.FloatField(null=True, blank=True)
    damagetakenperminute = models.FloatField(null=True, blank=True)
    damagemitigatedperminute = models.FloatField(null=True, blank=True)

    # Vision detail
    vspm = models.FloatField(null=True, blank=True)
    wpm = models.FloatField(null=True, blank=True)
    wardskilled = models.IntegerField(null=True, blank=True)
    controlwardsbought = models.IntegerField(null=True, blank=True)

    def __str__(self):
        return f"Advanced — {self.performance}"


class PerformanceRating(models.Model):
    """Computed Performance Rating for a single PlayerPerformance.

    Recomputed (idempotent) by the compute_ratings command per (event, role)
    cohort. See docs/player-rating-system.md.
    """
    TIERS = [('enriched', 'Enriched'), ('basic', 'Basic')]

    performance = models.OneToOneField(
        PlayerPerformance, on_delete=models.CASCADE, related_name='rating'
    )
    pr = models.FloatField(default=0)              # 0–100 composite
    points = models.FloatField(default=0)          # base + win + mvp
    tier = models.CharField(max_length=10, choices=TIERS, default='basic')
    is_mvp = models.BooleanField(default=False)
    contribution_share = models.FloatField(default=0)  # PR / Σ team PR that game
    metric_breakdown = models.JSONField(null=True, blank=True)  # {metric: 0–100}
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"PR {self.pr:.1f} ({self.tier}) — {self.performance}"