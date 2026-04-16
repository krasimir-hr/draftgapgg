import requests
from django.core.management.base import BaseCommand
from lol.models import Champion, ChampionAbility, Item, RunePath, Rune, SummonerSpell


DDRAGON_BASE = "https://ddragon.leagueoflegends.com"
LANG = "en_US"


class Command(BaseCommand):
    help = "Sync League of Legends data from Data Dragon"

    def get_latest_version(self):
        resp = requests.get(f"{DDRAGON_BASE}/api/versions.json")
        resp.raise_for_status()
        return resp.json()[0]

    def handle(self, *args, **options):
        version = self.get_latest_version()
        self.stdout.write(f"Syncing Data Dragon version: {version}")
        base = f"{DDRAGON_BASE}/cdn/{version}/data/{LANG}"

        self.sync_champions(base, version)
        self.sync_items(base, version)
        self.sync_runes(base, version)
        self.sync_summoner_spells(base, version)

        self.stdout.write(self.style.SUCCESS("\nDone!"))

    # ── Champions + Abilities ──────────────────────────────────────

    def sync_champions(self, base, version):
        self.stdout.write("\n=== Syncing Champions ===")

        # Get champion list
        data = requests.get(f"{base}/champion.json").json()["data"]
        created, updated = 0, 0

        for champ_id, champ in data.items():
            obj, was_created = Champion.objects.update_or_create(
                riot_id=champ_id,
                defaults={
                    "key": int(champ["key"]),
                    "name": champ["name"],
                    "title": champ.get("title", ""),
                    "tags": champ.get("tags", []),
                    "resource_type": champ.get("partype", ""),
                    "image": champ["image"]["full"],
                    "patch": version,
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1

            # Fetch individual champion page for abilities
            detail = requests.get(f"{base}/champion/{champ_id}.json").json()
            champ_detail = detail["data"][champ_id]
            self.sync_abilities(obj, champ_detail)

        self.stdout.write(self.style.SUCCESS(
            f"Champions — created: {created}, updated: {updated}"
        ))

    def sync_abilities(self, champion, detail):
        SPELL_KEYS = ['Q', 'W', 'E', 'R']

        # Passive
        passive = detail["passive"]
        ChampionAbility.objects.update_or_create(
            champion=champion,
            ability_type=ChampionAbility.AbilityType.PASSIVE,
            defaults={
                "riot_id": "",
                "name": passive["name"],
                "description": passive.get("description", ""),
                "cooldown": [],
                "cost": [],
                "max_rank": 1,
                "image": passive["image"]["full"],
            },
        )

        # Q, W, E, R
        for i, spell in enumerate(detail["spells"]):
            ChampionAbility.objects.update_or_create(
                champion=champion,
                ability_type=SPELL_KEYS[i],
                defaults={
                    "riot_id": spell.get("id", ""),
                    "name": spell["name"],
                    "description": spell.get("description", ""),
                    "cooldown": spell.get("cooldown", []),
                    "cost": spell.get("cost", []),
                    "max_rank": spell.get("maxrank", 5),
                    "image": spell["image"]["full"],
                },
            )

    # ── Items ──────────────────────────────────────────────────────

    def sync_items(self, base, version):
        self.stdout.write("\n=== Syncing Items ===")

        data = requests.get(f"{base}/item.json").json()["data"]
        created, updated = 0, 0

        for item_id, item in data.items():
            gold = item.get("gold", {})
            obj, was_created = Item.objects.update_or_create(
                riot_id=int(item_id),
                defaults={
                    "name": item["name"],
                    "description": item.get("description", ""),
                    "plaintext": item.get("plaintext", ""),
                    "gold_total": gold.get("total", 0),
                    "gold_base": gold.get("base", 0),
                    "purchasable": gold.get("purchasable", True),
                    "tags": item.get("tags", []),
                    "image": item["image"]["full"],
                    "patch": version,
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1

        self.stdout.write(self.style.SUCCESS(
            f"Items — created: {created}, updated: {updated}"
        ))

    # ── Runes ──────────────────────────────────────────────────────

    def sync_runes(self, base, version):
        self.stdout.write("\n=== Syncing Runes ===")

        data = requests.get(f"{base}/runesReforged.json").json()
        paths_count, runes_created, runes_updated = 0, 0, 0

        for path_data in data:
            path, _ = RunePath.objects.update_or_create(
                riot_id=path_data["id"],
                defaults={
                    "name": path_data["name"],
                    "icon": path_data.get("icon", ""),
                    "patch": version,
                },
            )
            paths_count += 1

            for row_idx, slot in enumerate(path_data["slots"]):
                for rune_data in slot["runes"]:
                    _, was_created = Rune.objects.update_or_create(
                        riot_id=rune_data["id"],
                        defaults={
                            "name": rune_data["name"],
                            "path": path,
                            "row": row_idx,
                            "short_description": rune_data.get("shortDesc", ""),
                            "long_description": rune_data.get("longDesc", ""),
                            "icon": rune_data.get("icon", ""),
                            "patch": version,
                        },
                    )
                    if was_created:
                        runes_created += 1
                    else:
                        runes_updated += 1

                # ── Stat Shards (not in runesReforged.json) ──────────────
            stat_shards_path, _ = RunePath.objects.get_or_create(
                riot_id=0,
                defaults={"name": "Stat Shards", "icon": "", "patch": version},
    )

        STAT_SHARDS = {
            "Adaptive Force": 5008,
            "Attack Speed": 5005,
            "Ability Haste": 5007,
            "Armor": 5002,
            "Magic Resist": 5003,
            "Health": 5001,
            "Health Scaling": 5011,
            "Tenacity and Slow Resist": 5013,
            "Move Speed": 5010,
        }

        for name, riot_id in STAT_SHARDS.items():
            Rune.objects.update_or_create(
                riot_id=riot_id,
                defaults={
                    "name": name,
                    "path": stat_shards_path,
                    "row": 4,
                    "short_description": name,
                    "long_description": "",
                    "icon": "",
                    "patch": version,
                },
            )

            self.stdout.write(self.style.SUCCESS(
                f"Rune paths: {paths_count}, Runes — created: {runes_created}, updated: {runes_updated}, "
                f"+ {len(STAT_SHARDS)} stat shards seeded"
            ))

    # ── Summoner Spells ────────────────────────────────────────────

    def sync_summoner_spells(self, base, version):
        self.stdout.write("\n=== Syncing Summoner Spells ===")

        data = requests.get(f"{base}/summoner.json").json()["data"]
        created, updated = 0, 0

        for spell_id, spell in data.items():
            cooldowns = spell.get("cooldown", [0])
            _, was_created = SummonerSpell.objects.update_or_create(
                riot_id=spell_id,
                defaults={
                    "key": int(spell["key"]),
                    "name": spell["name"],
                    "description": spell.get("description", ""),
                    "cooldown": int(cooldowns[0]) if cooldowns else 0,
                    "image": spell["image"]["full"],
                    "patch": version,
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1

        self.stdout.write(self.style.SUCCESS(
            f"Summoner Spells — created: {created}, updated: {updated}"
        ))