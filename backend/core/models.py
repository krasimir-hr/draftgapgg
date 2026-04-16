from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator
from lol.models import Champion, Item, Rune, RunePath, SummonerSpell


# -------------------------
# REGION / LEAGUE
# -------------------------

class League(models.Model):
    name = models.CharField(max_length=100, unique=True)  # "LCK", "LPL", "Worlds", "MSI"
    short_name =  models.CharField(max_length=20, blank=True, null=True)  # "LCK", "LPL", "Worlds", "MSI"
    logo = models.ImageField(upload_to='leagues/', blank=True, null=True)

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

    is_fully_synced = models.BooleanField(default=False)
    last_synced_at = models.DateTimeField(null=True, blank=True)


    def __str__(self):
        return self.name
    

class Organization(models.Model):
    name = models.CharField(max_length=100)
    short_name = models.CharField(max_length=10)
    logo = models.ImageField(upload_to='teams/', blank=True, null=True)
    leaguepedia_page = models.CharField(max_length=200, blank=True, null=True)
    region = models.CharField(max_length=100, blank=True, null=True)

    def __str__(self):
        return self.name
    
class Player(models.Model):
    ROLES = [
        ('Top', 'Top'),
        ('Jungle', 'Jungle'),
        ('Mid', 'Mid'),
        ('Bot', 'Bot'),
        ('Support', 'Support'),
        ('Coach', 'Coach'),
        ('Sub', 'Sub'),
    ]
    name = models.CharField(max_length=100, unique=True)
    real_name = models.CharField(max_length=200, blank=True, null=True)
    image = models.ImageField(upload_to='players/', blank=True, null=True)
    nationality = models.CharField(max_length=200, blank=True, null=True)
    birthdate = models.CharField(max_length=200, blank=True, null=True)
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
    ROLES = [
        ('Top', 'Top'),
        ('Jungle', 'Jungle'),
        ('Mid', 'Mid'),
        ('Bot', 'Bot'),
        ('Support', 'Support'),
        ('Coach', 'Coach'),
        ('Sub', 'Sub'),
    ]

    roster = models.ForeignKey(TeamRoster, on_delete=models.CASCADE, related_name='players')
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='roster_entries')
    role = models.CharField(max_length=10, choices=ROLES)
    is_starter = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.player.name} ({self.role})"

# Add these to your existing core/models.py

class Match(models.Model):
    match_id = models.CharField(max_length=200, unique=True)  # "LCK/2026 Season/Rounds 1-2_Week 1_1"
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='matches')
    team1 = models.CharField(max_length=100)
    team2 = models.CharField(max_length=100)
    winner = models.IntegerField(null=True, blank=True)  # 1 or 2
    best_of = models.IntegerField(default=3)
    tab = models.CharField(max_length=100, blank=True)  # "Week 1"
    datetime_utc = models.DateTimeField(null=True, blank=True)
    patch = models.CharField(max_length=20, blank=True)

    class Meta:
        verbose_name_plural = "matches"
        ordering = ['datetime_utc']

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

    class Meta:
        ordering = ['game_number']

    def __str__(self):
        return f"Game {self.game_number} — {self.team1} vs {self.team2}"


class PlayerPerformance(models.Model):
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name='performances')
    name = models.CharField(max_length=100)
    link = models.CharField(max_length=200, blank=True)
    team = models.CharField(max_length=100)
    side = models.IntegerField(default=1)
    role = models.CharField(max_length=20)
    champion = models.ForeignKey(Champion, on_delete=models.SET_NULL, null=True, blank=True)

    # Stats
    kills = models.IntegerField(default=0)
    deaths = models.IntegerField(default=0)
    assists = models.IntegerField(default=0)
    cs = models.IntegerField(default=0)
    gold = models.IntegerField(default=0)
    damage_to_champions = models.IntegerField(default=0)

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