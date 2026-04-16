from django.contrib import admin
from .models import Champion, ChampionAbility, Item, RunePath, Rune, SummonerSpell

@admin.register(Champion)
class ChampionAdmin(admin.ModelAdmin):
    pass

@admin.register(ChampionAbility)
class ChampionAbilityAdmin(admin.ModelAdmin):
    pass

@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    pass

@admin.register(RunePath)
class RunePathAdmin(admin.ModelAdmin):
    pass

@admin.register(Rune)
class RuneAdmin(admin.ModelAdmin):
    pass

@admin.register(SummonerSpell)
class SummonerSpellAdmin(admin.ModelAdmin):
    pass