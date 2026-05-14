from collections import Counter

from django.core.management.base import BaseCommand
from PIL import Image

from core.models import Organization


def dominant_color(image_field) -> str:
    with image_field.open('rb') as f:
        img = Image.open(f).convert('RGBA')
        img = img.resize((80, 80), Image.LANCZOS)
        img.load()

    pixels = []
    for r, g, b, a in img.getdata():
        if a < 128:
            continue
        if r > 235 and g > 235 and b > 235:
            continue
        if r < 20 and g < 20 and b < 20:
            continue
        if max(r, g, b) - min(r, g, b) < 30:
            continue
        pixels.append((r // 16 * 16, g // 16 * 16, b // 16 * 16))

    if not pixels:
        return ''

    r, g, b = Counter(pixels).most_common(1)[0][0]
    return '#{:02x}{:02x}{:02x}'.format(r, g, b)


class Command(BaseCommand):
    help = 'Extract dominant color from org logos and store in org.color'

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true', help='Re-extract even if color already set')

    def handle(self, *args, **options):
        orgs = Organization.objects.exclude(logo='').exclude(logo__isnull=True)
        if not options['force']:
            orgs = orgs.filter(color='')

        updated = skipped = errors = 0
        for org in orgs:
            try:
                color = dominant_color(org.logo)
                if color:
                    org.color = color
                    org.save(update_fields=['color'])
                    self.stdout.write(f'  {org.name}: {color}')
                    updated += 1
                else:
                    self.stdout.write(self.style.WARNING(f'  {org.name}: no usable color found'))
                    skipped += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'  {org.name}: {e}'))
                errors += 1

        self.stdout.write(self.style.SUCCESS(f'\nDone — {updated} updated, {skipped} skipped, {errors} errors'))
