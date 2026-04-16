from django.db import models


class Champion(models.Model):
    riot_id = models.CharField(max_length=50, unique=True)       # "Aatrox"
    key = models.IntegerField(unique=True)                        # 266
    name = models.CharField(max_length=100)                       # "Aatrox"
    title = models.CharField(max_length=200, blank=True)          # "the Darkin Blade"
    tags = models.JSONField(default=list, blank=True)             # ["Fighter", "Tank"]
    resource_type = models.CharField(max_length=50, blank=True)   # "Blood Well"
    image = models.CharField(max_length=200, blank=True)          # "Aatrox.png"
    patch = models.CharField(max_length=20, blank=True)

    def icon_url(self, version=None):
        v = version or self.patch
        return f"https://ddragon.leagueoflegends.com/cdn/{v}/img/champion/{self.image}"

    def __str__(self):
        return self.name


class ChampionAbility(models.Model):
    class AbilityType(models.TextChoices):
        PASSIVE = 'passive', 'Passive'
        Q = 'Q', 'Q'
        W = 'W', 'W'
        E = 'E', 'E'
        R = 'R', 'R'

    champion = models.ForeignKey(Champion, on_delete=models.CASCADE, related_name='abilities')
    ability_type = models.CharField(max_length=10, choices=AbilityType.choices)
    riot_id = models.CharField(max_length=100, blank=True)        # "AatroxQ"
    name = models.CharField(max_length=200)                        # "The Darkin Blade"
    description = models.TextField(blank=True)
    cooldown = models.JSONField(default=list, blank=True)          # [14, 12, 10, 8, 6]
    cost = models.JSONField(default=list, blank=True)              # [0, 0, 0, 0, 0]
    max_rank = models.IntegerField(default=5)
    image = models.CharField(max_length=200, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['champion', 'ability_type'], name='unique_champion_ability')
        ]

    def __str__(self):
        return f"{self.champion.name} - {self.ability_type}: {self.name}"


class Item(models.Model):
    riot_id = models.IntegerField(unique=True)                     # 3153
    name = models.CharField(max_length=200)                        # "Blade of the Ruined King"
    description = models.TextField(blank=True)                     # raw HTML description
    plaintext = models.CharField(max_length=500, blank=True)       # short text
    gold_total = models.IntegerField(default=0)
    gold_base = models.IntegerField(default=0)
    purchasable = models.BooleanField(default=True)
    tags = models.JSONField(default=list, blank=True)              # ["Damage", "AttackSpeed", "LifeSteal"]
    image = models.CharField(max_length=200, blank=True)
    patch = models.CharField(max_length=20, blank=True)

    def icon_url(self, version=None):
        v = version or self.patch
        return f"https://ddragon.leagueoflegends.com/cdn/{v}/img/item/{self.image}"

    def __str__(self):
        return self.name


class RunePath(models.Model):
    """Precision, Domination, Sorcery, etc."""
    riot_id = models.IntegerField(unique=True)
    name = models.CharField(max_length=100)
    icon = models.CharField(max_length=200, blank=True)
    patch = models.CharField(max_length=20, blank=True)

    def __str__(self):
        return self.name


class Rune(models.Model):
    riot_id = models.IntegerField(unique=True)
    name = models.CharField(max_length=200)
    path = models.ForeignKey(RunePath, on_delete=models.CASCADE, related_name='runes')
    row = models.IntegerField(default=0)              # 0=keystone, 1/2/3=minor rows
    short_description = models.TextField(blank=True)
    long_description = models.TextField(blank=True)
    icon = models.CharField(max_length=200, blank=True)
    patch = models.CharField(max_length=20, blank=True)

    def __str__(self):
        return f"{self.path.name} - {self.name}"


class SummonerSpell(models.Model):
    riot_id = models.CharField(max_length=50, unique=True)        # "SummonerFlash"
    key = models.IntegerField(unique=True)                         # 4
    name = models.CharField(max_length=100)                        # "Flash"
    description = models.TextField(blank=True)
    cooldown = models.IntegerField(default=0)
    image = models.CharField(max_length=200, blank=True)
    patch = models.CharField(max_length=20, blank=True)

    def __str__(self):
        return self.name