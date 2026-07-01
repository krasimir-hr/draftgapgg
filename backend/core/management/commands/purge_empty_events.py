from datetime import date
from django.core.management.base import BaseCommand
from core.models import Event


class Command(BaseCommand):
    help = 'Delete past events that have no matches (dry run by default; pass --apply to delete).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Actually perform the deletion (default is a dry run).',
        )

    def handle(self, *args, **options):
        today = date.today()
        qs = Event.objects.filter(end_date__lt=today).exclude(matches__isnull=False).order_by('end_date')

        count = qs.count()
        if count == 0:
            self.stdout.write(self.style.SUCCESS('No empty past events found.'))
            return

        self.stdout.write(f'Found {count} empty past event(s):')
        for event in qs:
            stage_pages = list(event.stages.exclude(leaguepedia_page='').values_list('leaguepedia_page', flat=True))
            stage_info = f'  stages: {stage_pages}' if stage_pages else ''
            self.stdout.write(f'  [{event.end_date}] {event.name} (id={event.pk}){stage_info}')

        if options['apply']:
            deleted, breakdown = qs.delete()
            self.stdout.write(self.style.SUCCESS(f'Deleted {deleted} record(s): {breakdown}'))
        else:
            self.stdout.write(self.style.WARNING('Dry run — pass --apply to actually delete.'))
