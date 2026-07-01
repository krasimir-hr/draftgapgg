import socket

socket.setdefaulttimeout(15)

import requests
from django.core.management.base import BaseCommand
from django.core.files.base import ContentFile

from lol.models import Champion


DDRAGON_BASE = "https://ddragon.leagueoflegends.com"


class Command(BaseCommand):
    help = ("Download champion square icons from Data Dragon into local media. "
            "Run convert_media_webp afterwards to shrink them to webp.")

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true',
                            help='Re-download icons for champions that already have one.')
        parser.add_argument('--champion', type=str, default=None,
                            help='Limit to a single champion by riot_id (e.g. Aatrox).')

    def handle(self, *args, **options):
        qs = Champion.objects.exclude(image='')
        if not options['force']:
            qs = qs.filter(icon='')
        if options['champion']:
            qs = qs.filter(riot_id=options['champion'])

        champs = list(qs)
        self.stdout.write(f'Processing {len(champs)} champion(s)...\n')

        ok = skip = fail = 0
        for champ in champs:
            if not champ.patch:
                self.stdout.write(self.style.WARNING(f'  no patch  {champ.name}'))
                skip += 1
                continue

            url = (f'{DDRAGON_BASE}/cdn/{champ.patch}/img/champion/{champ.image}')
            try:
                resp = requests.get(url, timeout=15, headers={'User-Agent': 'draftgap-bot/1.0'})
                resp.raise_for_status()
                if champ.icon:
                    champ.icon.delete(save=False)
                champ.icon.save(champ.image, ContentFile(resp.content), save=True)
                self.stdout.write(self.style.SUCCESS(f'  ✓  {champ.name}'))
                ok += 1
            except Exception as e:  # noqa: BLE001
                self.stdout.write(self.style.ERROR(f'  ✗  {champ.name}: {e}'))
                fail += 1

        self.stdout.write(
            f'\nDone — {ok} saved, {skip} skipped, {fail} failed. '
            f'Now run: python manage.py convert_media_webp'
        )
