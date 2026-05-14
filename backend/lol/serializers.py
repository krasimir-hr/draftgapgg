from rest_framework import serializers
from .models import Champion, ChampionAbility, Item, RunePath, Rune, SummonerSpell


class ChampionAbilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = ChampionAbility
        fields = ['id', 'ability_type', 'riot_id', 'name', 'description',
                  'cooldown', 'cost', 'max_rank', 'image']


class ChampionListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views — no abilities."""
    icon_url = serializers.SerializerMethodField()

    class Meta:
        model = Champion
        fields = ['id', 'riot_id', 'key', 'name', 'title', 'tags',
                  'resource_type', 'image', 'patch', 'icon_url']

    def get_icon_url(self, obj: Champion) -> str:
        return obj.icon_url()


class ChampionDetailSerializer(ChampionListSerializer):
    """Full serializer including nested abilities."""
    abilities = ChampionAbilitySerializer(many=True, read_only=True)

    class Meta(ChampionListSerializer.Meta):
        fields = [*ChampionListSerializer.Meta.fields, 'abilities']


class ItemSerializer(serializers.ModelSerializer):
    icon_url = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = ['id', 'riot_id', 'name', 'description', 'plaintext',
                  'gold_total', 'gold_base', 'purchasable', 'tags',
                  'image', 'patch', 'icon_url']

    def get_icon_url(self, obj: Item) -> str:
        return obj.icon_url()


class RuneSerializer(serializers.ModelSerializer):
    path_icon = serializers.CharField(source='path.icon', read_only=True)
    path_riot_id = serializers.IntegerField(source='path.riot_id', read_only=True)

    class Meta:
        model = Rune
        fields = ['id', 'riot_id', 'name', 'row', 'short_description',
                  'long_description', 'icon', 'patch', 'path_icon', 'path_riot_id']


class RunePathSerializer(serializers.ModelSerializer):
    runes = RuneSerializer(many=True, read_only=True)

    class Meta:
        model = RunePath
        fields = ['id', 'riot_id', 'name', 'icon', 'patch', 'runes']


class RunePathListSerializer(serializers.ModelSerializer):
    """Lightweight — no nested runes."""
    class Meta:
        model = RunePath
        fields = ['id', 'riot_id', 'name', 'icon', 'patch']


class SummonerSpellSerializer(serializers.ModelSerializer):
    icon_url = serializers.SerializerMethodField()

    class Meta:
        model = SummonerSpell
        fields = ['id', 'riot_id', 'key', 'name', 'description',
                  'cooldown', 'image', 'patch', 'icon_url']

    def get_icon_url(self, obj: SummonerSpell) -> str:
        return f"https://ddragon.leagueoflegends.com/cdn/{obj.patch}/img/spell/{obj.image}"
