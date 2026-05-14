import os
import re
import socket
import time
import requests

socket.setdefaulttimeout(15)

from collections import defaultdict
from django.core.management.base import BaseCommand
from django.core.files.base import ContentFile
from mwrogue.esports_client import EsportsClient
from mwrogue.auth_credentials import AuthCredentials
from django.utils import timezone
from core.models import Player, RosterPlayer, League

FILE_BATCH  = 50
IMAGE_EXTS  = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}
SKIP_TERMS  = {'logo', 'square', 'std', 'icon', 'flag', 'banner', 'wordmark', 'silhouette', 'disambig'}


def year_of(title: str) -> int:
    years = re.findall(r'(?<!\d)(20\d{2})(?!\d)', title)
    return max(int(y) for y in years) if years else 0


def name_pattern(player_name: str) -> re.Pattern:
    slug = re.escape(player_name.lower().replace(' ', '_'))
    return re.compile(r'(?:^|_)' + slug + r'(?:_|\.)', re.IGNORECASE)


def is_photo(filename: str) -> bool:
    ext = os.path.splitext(filename.lower())[1]
    return ext in IMAGE_EXTS and not any(t in filename.lower() for t in SKIP_TERMS)


class Command(BaseCommand):
    help = 'Fetches and saves the latest player images from Leaguepedia.'

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true',
                            help='Re-download images for players who already have one.')
        parser.add_argument('--league', type=str, default=None,
                            help='Limit to players in this league short name (e.g. LCK).')
        parser.add_argument('--active', action='store_true',
                            help='Limit to players active in the current year across all leagues. '
                                 'Use with --force for periodic updates.')

    def handle(self, *args, **options):
        force    = options['force']
        site     = EsportsClient('lol', credentials=AuthCredentials(
            username='Witcher303!@draftgap-fanmade',
            password='73dc4l60kdq8a00o617fefvne7vpnr66',
        ))

        qs = Player.objects.all() if force else Player.objects.filter(image='')
        qs = qs.exclude(leaguepedia_page__isnull=True).exclude(leaguepedia_page='')

        # leaguepedia_page → [org_short, ...] — ordered most-recent-first
        player_orgs: dict[str, list[str]] = defaultdict(list)

        if options['league']:
            try:
                league = League.objects.get(short_name=options['league'])
            except League.DoesNotExist:
                self.stdout.write(self.style.ERROR(f"League '{options['league']}' not found."))
                return

            # Only use players from THIS league's CURRENT year — avoids querying
            # stale team prefixes for players who have since moved elsewhere.
            current_year = timezone.now().year
            rps = (
                RosterPlayer.objects
                .filter(roster__event__league=league, roster__event__year=current_year)
                .select_related('player', 'roster__org', 'roster__event')
                .order_by('-roster__event__start_date')
            )
            current_player_ids = set()
            for rp in rps:
                current_player_ids.add(rp.player_id)
                short = (rp.roster.org.short_name if rp.roster.org else None) or ''
                lp = rp.player.leaguepedia_page or ''
                if lp and short and short not in player_orgs[lp]:
                    player_orgs[lp].append(short)

            qs = qs.filter(id__in=current_player_ids)

        elif options['active']:
            # All players active in the current year, across every league.
            # Queries only current-year org prefixes — ideal for periodic photo updates.
            current_year = timezone.now().year
            rps = (
                RosterPlayer.objects
                .filter(roster__event__year=current_year)
                .select_related('player', 'roster__org', 'roster__event')
                .order_by('-roster__event__start_date')
            )
            current_player_ids = set()
            for rp in rps:
                current_player_ids.add(rp.player_id)
                short = (rp.roster.org.short_name if rp.roster.org else None) or ''
                lp = rp.player.leaguepedia_page or ''
                if lp and short and short not in player_orgs[lp]:
                    player_orgs[lp].append(short)

            qs = qs.filter(id__in=current_player_ids)

        else:
            # Initial full sync: all players without images, all historical orgs.
            roster_qs = (
                RosterPlayer.objects
                .filter(player__in=qs)
                .select_related('player', 'roster__org', 'roster__event')
                .order_by('-roster__event__start_date')
            )
            for rp in roster_qs:
                short = (rp.roster.org.short_name if rp.roster.org else None) or ''
                lp = rp.player.leaguepedia_page or ''
                if lp and short and short not in player_orgs[lp]:
                    player_orgs[lp].append(short)

        players          = list(qs)
        player_by_lp     = {p.leaguepedia_page: p for p in players}
        self.stdout.write(f'Processing {len(players)} player(s)...\n')

        # Pattern keyed by leaguepedia_page; uses display name for filename matching.
        patterns = {p.leaguepedia_page: name_pattern(p.name) for p in players}
        best_image: dict[str, str] = {}   # leaguepedia_page → filename (underscores)

        def update_best(lp: str, fname: str) -> None:
            fname_u = fname.replace(' ', '_')
            if not is_photo(fname_u):
                return
            prev = best_image.get(lp)
            if prev is None or year_of(fname_u) > year_of(prev):
                best_image[lp] = fname_u

        # ── Pass 1: allimages by org prefix, fully paginated ─────────────────────
        # Fetches every file starting with "{OrgShort} " so no images are missed
        # due to the 500-per-request cap (ascending avoids needing a second pass
        # to pick up number-year filenames that sort below letter-named ones).
        org_shorts = {s for shorts in player_orgs.values() for s in shorts}
        self.stdout.write(f'Pass 1 — allimages for {len(org_shorts)} org prefix(es)...')
        for org in sorted(org_shorts):
            for sep in (' ', '_'):
                params: dict = dict(list='allimages', aiprefix=org + sep,
                                    aisort='name', aidir='ascending', ailimit=500)
                while True:
                    try:
                        result = site.client.api('query', **params)
                    except Exception as e:
                        self.stdout.write(self.style.WARNING(f'  allimages failed ({org}{sep!r}): {e}'))
                        break
                    for img in result.get('query', {}).get('allimages', []):
                        fname_u = img['name'].replace(' ', '_')
                        for lp, pat in patterns.items():
                            if pat.search(fname_u):
                                update_best(lp, img['name'])
                    if 'continue' not in result:
                        break
                    params.update(result['continue'])

        self.stdout.write(f'  After Pass 1: {len(best_image)} player(s) matched')

        # ── Pass 2: action=parse for ALL players ─────────────────────────────────
        # Uses leaguepedia_page for exact page lookup — handles disambiguation like
        # "Zeka (Kim Geon-woo)" correctly. Purge forces fresh Lua rendering.
        self.stdout.write(f'Pass 2 — page-parse for all {len(players)} player(s)...')
        total = len(players)
        for idx, player in enumerate(players, 1):
            if idx % 20 == 0:
                self.stdout.write(f'  [{idx}/{total}]')
            lp = player.leaguepedia_page
            try:
                site.client.api('purge', titles=lp)
            except Exception:
                pass
            try:
                result = site.client.api('parse', page=lp, prop='images')
            except Exception:
                continue
            time.sleep(0.1)
            pat = patterns[lp]
            for img in result.get('parse', {}).get('images', []):
                if pat.search(img):
                    update_best(lp, img)

        self.stdout.write(f'  After Pass 2: {len(best_image)} player(s) matched')

        # ── Pass 3: batch-resolve CDN URLs ───────────────────────────────────────
        pending = [(player_by_lp[lp], 'File:' + fn.replace('_', ' '))
                   for lp, fn in best_image.items()]

        self.stdout.write(f'\nResolving URLs for {len(pending)} player(s)...')
        url_by_file: dict[str, str] = {}
        file_titles = [ft for _, ft in pending]

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

        # ── Pass 4: download and save ─────────────────────────────────────────
        ok = skip = unchanged = fail = 0
        for player, file_title in pending:
            if player.leaguepedia_image == file_title:
                unchanged += 1
                continue

            url = url_by_file.get(file_title)
            if not url:
                self.stdout.write(self.style.WARNING(f'  no URL  {player.name}  ({file_title})'))
                skip += 1
                continue
            try:
                resp = requests.get(url, timeout=15, headers={'User-Agent': 'draftgap-bot/1.0'})
                resp.raise_for_status()
                ext = os.path.splitext(file_title)[1] or '.png'
                if player.image:
                    player.image.delete(save=False)
                player.image.save(f'{player.name}{ext}', ContentFile(resp.content), save=True)
                player.leaguepedia_image = file_title
                player.save(update_fields=['leaguepedia_image'])
                self.stdout.write(self.style.SUCCESS(f'  ✓  {player.name}  ({file_title})'))
                ok += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'  ✗  {player.name}: {e}'))
                fail += 1

        no_photo = len(players) - len(best_image)
        self.stdout.write(
            f'\nDone — {ok} saved, {unchanged} unchanged, {skip} URL missing, '
            f'{fail} failed, {no_photo} no photo found.'
        )
