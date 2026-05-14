import os
import socket
import time
import requests

socket.setdefaulttimeout(15)

from django.core.management.base import BaseCommand
from django.core.files.base import ContentFile
from mwrogue.esports_client import EsportsClient
from mwrogue.auth_credentials import AuthCredentials
from core.models import Organization


IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}
FILE_BATCH = 50


def is_logo(filename: str) -> bool:
    ext = os.path.splitext(filename.lower())[1]
    return ext in IMAGE_EXTS and 'logo' in filename.lower()


def logo_score(filename: str) -> int:
    f = filename.lower()
    score = 0
    if 'profile' in f:
        score += 3
    elif 'square' in f:
        score += 2
    elif 'std' in f:
        score += 1
    if 'allmode' in f:
        score -= 5
    if 'old' in f or 'former' in f:
        score -= 3
    return score


class Command(BaseCommand):
    help = 'Fetches and saves org logos from Leaguepedia.'

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true',
                            help='Re-download logos for orgs that already have one.')
        parser.add_argument('--org', type=str, default=None,
                            help='Limit to a single org by short name (e.g. T1).')

    def handle(self, *args, **options):
        force = options['force']
        site = EsportsClient('lol', credentials=AuthCredentials(
            username='Witcher303!@draftgap-fanmade',
            password='73dc4l60kdq8a00o617fefvne7vpnr66',
        ))

        qs = Organization.objects.exclude(leaguepedia_page__isnull=True).exclude(leaguepedia_page='')
        if not force:
            qs = qs.filter(logo='')
        if options['org']:
            qs = qs.filter(short_name=options['org'])

        orgs = list(qs)
        self.stdout.write(f'Processing {len(orgs)} org(s)...\n')

        # ── Pass 1: allimages search by org-name prefix ───────────────────────────
        # Searches for files named "{LeaguepediaPage}logo*" — avoids picking up
        # unrelated logos (sponsors, opponents) that appear on the org's wiki page.
        best_logo: dict[int, str] = {}  # org.id → filename (underscores)

        total = len(orgs)
        for idx, org in enumerate(orgs, 1):
            if idx % 10 == 0:
                self.stdout.write(f'  [{idx}/{total}]')

            page_slug = org.leaguepedia_page.replace(' ', '_')
            prefix = f'{page_slug}logo'

            try:
                result = site.client.api(
                    'query', list='allimages',
                    aiprefix=prefix, aisort='name', aidir='ascending', ailimit=20,
                )
            except Exception as e:
                self.stdout.write(self.style.WARNING(f'  allimages failed for {org.name}: {e}'))
                continue
            time.sleep(0.1)

            candidates = [
                img['name'].replace(' ', '_')
                for img in result.get('query', {}).get('allimages', [])
                if is_logo(img['name'])
            ]

            if not candidates:
                self.stdout.write(self.style.WARNING(f'  no logo found  {org.name}  (prefix: {prefix})'))
                continue

            best = max(candidates, key=logo_score)
            best_logo[org.id] = best

        self.stdout.write(f'\nMatched {len(best_logo)} logo(s). Resolving CDN URLs...')

        # ── Pass 2: batch resolve CDN URLs ────────────────────────────────────────
        # Use spaces in title (MediaWiki normalises to spaces in responses).
        org_by_id = {org.id: org for org in orgs}
        pending = [
            (org_by_id[oid], 'File:' + fname.replace('_', ' '))
            for oid, fname in best_logo.items()
        ]
        file_titles = [ft for _, ft in pending]

        url_by_file: dict[str, str] = {}
        for i in range(0, len(file_titles), FILE_BATCH):
            chunk = file_titles[i:i + FILE_BATCH]
            try:
                info = site.client.api(
                    'query', prop='imageinfo',
                    titles='|'.join(chunk), iiprop='url',
                )
                for page in info.get('query', {}).get('pages', {}).values():
                    if page.get('imageinfo'):
                        url_by_file[page['title']] = page['imageinfo'][0]['url']
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'  imageinfo batch failed: {e}'))

        # ── Pass 3: download and save ─────────────────────────────────────────────
        ok = skip = fail = 0
        for org, file_title in pending:
            url = url_by_file.get(file_title)
            if not url:
                self.stdout.write(self.style.WARNING(f'  no URL  {org.name}  ({file_title})'))
                skip += 1
                continue
            try:
                resp = requests.get(url, timeout=15, headers={'User-Agent': 'draftgap-bot/1.0'})
                resp.raise_for_status()
                ext = os.path.splitext(file_title)[1] or '.png'
                if org.logo:
                    org.logo.delete(save=False)
                org.logo.save(f'{org.short_name}{ext}', ContentFile(resp.content), save=True)
                self.stdout.write(self.style.SUCCESS(f'  ✓  {org.name}  ({file_title})'))
                ok += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'  ✗  {org.name}: {e}'))
                fail += 1

        no_logo = len(orgs) - len(best_logo)
        self.stdout.write(
            f'\nDone — {ok} saved, {skip} URL missing, {fail} failed, {no_logo} no logo found.'
        )
