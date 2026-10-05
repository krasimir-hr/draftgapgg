"""Download missing league crests using the existing LoL Esports API connection."""
from io import BytesIO
from urllib.parse import urlparse

import requests
from PIL import Image
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand

from core.models import League
from core.management.commands.sync_gold_graphs import _get, _GW


class Command(BaseCommand):
    help = 'Download missing league logos from LoL Esports.'

    def handle(self, *args, **options):
        rows = _get(f'{_GW}/getLeagues', params={'hl': 'en-US'})['data']['leagues']
        by_name = {row['name'].casefold(): row for row in rows}
        count = 0
        for league in League.objects.all():
            row = by_name.get((league.short_name or league.name).casefold())
            if league.logo or not row or not row.get('image'):
                continue
            url = row['image'].replace('http://', 'https://', 1)
            if urlparse(url).hostname not in {'static.lolesports.com', 'lolstatic-a.akamaihd.net'}:
                continue
            try:
                response = requests.get(url, timeout=20)
                response.raise_for_status()
                with Image.open(BytesIO(response.content)) as source:
                    source.thumbnail((256, 256))
                    output = BytesIO()
                    source.convert('RGBA').save(output, format='WEBP')
                league.logo.save(f'lolesports-{row["id"]}.webp', ContentFile(output.getvalue()))
                count += 1
            except (requests.RequestException, OSError, ValueError) as error:
                self.stderr.write(f'{league.short_name}: image unavailable ({type(error).__name__})')
        self.stdout.write(self.style.SUCCESS(f'Saved {count} league logos.'))
