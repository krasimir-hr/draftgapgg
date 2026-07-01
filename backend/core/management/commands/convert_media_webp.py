"""Convert all DB-referenced ImageField media to lossy WebP.

For each image field, the original file (.png/.jpg/.jpeg) is re-encoded as a
lossy .webp next to it, the DB value is repointed to the new file, and (with
--delete-originals) the original file is removed.

Run without --delete-originals first to keep the originals as a safety net.
"""

import os
from concurrent.futures import ThreadPoolExecutor

from django.conf import settings
from django.core.management.base import BaseCommand
from PIL import Image

from core.models import League, Event, Organization, Player
from lol.models import Champion

# (Model, field_name) for every ImageField we want to convert.
# (Model, field_name, kind) — kind selects which max-size cap applies.
IMAGE_FIELDS = [
    (League, 'logo', 'logo'),
    (Event, 'logo', 'logo'),
    (Organization, 'logo', 'logo'),
    (Player, 'image', 'player'),
    (Champion, 'icon', 'champion'),
]

CONVERTIBLE_EXTS = {'.png', '.jpg', '.jpeg'}


def encode_webp(src_abs: str, dst_abs: str, quality: int, max_size: int = 0) -> None:
    with Image.open(src_abs) as im:
        # Lossy WebP supports alpha; flatten palette/other modes to RGB(A).
        if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
            im = im.convert('RGBA')
        elif im.mode != 'RGB':
            im = im.convert('RGB')
        # Downscale so the longest side is at most max_size (never upscale).
        if max_size and max(im.size) > max_size:
            im.thumbnail((max_size, max_size), Image.LANCZOS)
        im.save(dst_abs, 'WEBP', quality=quality, method=6)


def find_source(media_root: str, rel: str) -> str:
    """Prefer an original PNG/JPG sibling over an already-converted .webp,
    so re-encoding doesn't stack a second lossy pass."""
    base = os.path.join(media_root, os.path.splitext(rel)[0])
    for ext in ('.png', '.jpg', '.jpeg', '.PNG', '.JPG', '.JPEG'):
        if os.path.exists(base + ext):
            return base + ext
    return os.path.join(media_root, rel)


class Command(BaseCommand):
    help = 'Convert DB-referenced media images to lossy WebP and update the DB.'

    def add_arguments(self, parser):
        parser.add_argument('--quality', type=int, default=80,
                            help='WebP lossy quality (default 80).')
        parser.add_argument('--max-logo', type=int, default=256,
                            help='Cap longest side of league/team/event logos (default 256).')
        parser.add_argument('--max-player', type=int, default=512,
                            help='Cap longest side of player images (default 512).')
        parser.add_argument('--max-champion', type=int, default=96,
                            help='Cap longest side of champion icons (default 96).')
        parser.add_argument('--delete-originals', action='store_true',
                            help='Delete the original files after converting.')
        parser.add_argument('--workers', type=int, default=os.cpu_count() or 4,
                            help='Parallel encode workers.')
        parser.add_argument('--kinds', type=str, default=None,
                            help='Comma-separated kinds to convert (logo,player,champion). '
                                 'Default: all. Use to avoid re-encoding already-converted media.')

    def handle(self, *args, **opts):
        quality = opts['quality']
        delete = opts['delete_originals']
        media_root = settings.MEDIA_ROOT
        caps = {'logo': opts['max_logo'], 'player': opts['max_player'],
                'champion': opts['max_champion']}
        only_kinds = {k.strip() for k in opts['kinds'].split(',')} if opts['kinds'] else None

        # Collect jobs: (obj, field, src_rel, dst_rel, max_size)
        jobs = []
        for model, field, kind in IMAGE_FIELDS:
            if only_kinds and kind not in only_kinds:
                continue
            for obj in model.objects.exclude(**{field: ''}).exclude(**{f'{field}__isnull': True}):
                rel = getattr(obj, field).name
                if not rel:
                    continue
                # Re-encode from the original sibling if it's still around.
                src_rel = os.path.relpath(find_source(media_root, rel), media_root)
                if os.path.splitext(src_rel)[1].lower() not in (CONVERTIBLE_EXTS | {'.webp'}):
                    continue
                if not os.path.exists(os.path.join(media_root, src_rel)):
                    self.stderr.write(f'  missing file, skipping: {rel}')
                    continue
                dst_rel = os.path.splitext(rel)[0] + '.webp'
                jobs.append((obj, field, src_rel, dst_rel, caps[kind]))

        self.stdout.write(f'Converting {len(jobs)} images at q={quality} '
                          f'(logo<={opts["max_logo"]}px, player<={opts["max_player"]}px, '
                          f'champion<={opts["max_champion"]}px, {opts["workers"]} workers)...')

        before = after = 0
        errors = 0

        def work(job):
            nonlocal before, after, errors
            obj, field, src_rel, dst_rel, max_size = job
            src_abs = os.path.join(media_root, src_rel)
            dst_abs = os.path.join(media_root, dst_rel)
            try:
                b = os.path.getsize(src_abs)
                encode_webp(src_abs, dst_abs, quality, max_size)
                a = os.path.getsize(dst_abs)
            except Exception as e:  # noqa: BLE001
                self.stderr.write(f'  ERROR {src_rel}: {e}')
                errors += 1
                return None
            before += b
            after += a
            return job

        with ThreadPoolExecutor(max_workers=opts['workers']) as pool:
            done = [j for j in pool.map(work, jobs) if j]

        # Update DB + optionally delete originals (main thread, sequential).
        for obj, field, src_rel, dst_rel, _max in done:
            setattr(obj, field, dst_rel)
            obj.save(update_fields=[field])
            if delete:
                src_abs = os.path.join(media_root, src_rel)
                if os.path.exists(src_abs) and src_rel != dst_rel:
                    os.remove(src_abs)

        mb = 1024 * 1024
        self.stdout.write(self.style.SUCCESS(
            f'Done: {len(done)} converted, {errors} errors. '
            f'{before / mb:.1f} MB -> {after / mb:.1f} MB '
            f'({100 * (1 - after / before):.0f}% smaller)'
            if before else 'Done: nothing to convert.'))
        if not delete and done:
            self.stdout.write('Originals kept. Re-run with --delete-originals '
                              'once you have verified the result.')
