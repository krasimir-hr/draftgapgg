"""
Merges child events (Playoffs, Placements, Qualifying Series) into their
parent event by:
  1. Creating EventStage records on the parent for each stage.
  2. Moving all child matches to the parent event and assigning them to
     the appropriate EventStage.
  3. Assigning the parent's existing matches to a "Regular Season" stage.

Run with --dry-run to preview changes without writing anything.
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from core.models import Event, EventStage, Match

# Suffix → (stage name, stage type, display order)
# Order: Qualifying Series comes first (play-in), then Regular Season (1),
# then Placements (2), then Playoffs (3).
SUFFIX_MAP = {
    ' Qualifying Series': ('Qualifying Series', 'play_in', 0),
    ' Placements':        ('Placements',        'league',  2),
    ' Playoffs':          ('Playoffs',          'playoff', 3),
}

REGULAR_SEASON_STAGE = ('Regular Season', 'league', 1)


class Command(BaseCommand):
    help = "Merge child (Playoffs / Placements / Qualifying Series) events into their parent and create EventStage records."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Preview changes without writing to the database.',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        # Collect all child events grouped by parent so we can create all
        # stages for a parent in one pass.
        parent_children: dict[int, list[tuple[Event, str, str, str, int]]] = {}

        for suffix, (stage_name, stage_type, stage_order) in SUFFIX_MAP.items():
            for child in Event.objects.filter(name__endswith=suffix).order_by('name'):
                parent_name = child.name[: -len(suffix)]
                parent = Event.objects.filter(name=parent_name).first()
                if not parent:
                    self.stdout.write(self.style.WARNING(
                        f'  ⚠ No parent found for {child.name!r} (expected {parent_name!r}) — skipping.'
                    ))
                    continue
                parent_children.setdefault(parent.id, []).append(
                    (child, stage_name, stage_type, stage_order, suffix)
                )

        for parent_id, children in parent_children.items():
            parent = Event.objects.get(id=parent_id)
            self.stdout.write(f'\n{"="*60}\nParent: {parent.name!r}\n{"="*60}')

            # --- Create / get the Regular Season stage on the parent ---
            rs_name, rs_type, rs_order = REGULAR_SEASON_STAGE
            if not dry_run:
                rs_stage, created = EventStage.objects.get_or_create(
                    event=parent, name=rs_name,
                    defaults={'type': rs_type, 'order': rs_order},
                )
            else:
                rs_stage = None
                created = not EventStage.objects.filter(event=parent, name=rs_name).exists()

            action = 'Created' if created else 'Already exists'
            self.stdout.write(f'  Stage: {rs_name!r} ({rs_type}) — {action}')

            # --- Assign unassigned parent matches to Regular Season ---
            unassigned = Match.objects.filter(event=parent, stage__isnull=True)
            count = unassigned.count()
            if not dry_run and rs_stage:
                unassigned.update(stage=rs_stage)
            self.stdout.write(f'  Assigned {count} existing matches → {rs_name!r}')

            # --- Process each child ---
            for child, stage_name, stage_type, stage_order, suffix in children:
                self.stdout.write(f'\n  Child: {child.name!r}  ({child.matches.count()} matches)')

                if not dry_run:
                    child_stage, created = EventStage.objects.get_or_create(
                        event=parent, name=stage_name,
                        defaults={
                            'type': stage_type,
                            'order': stage_order,
                            'leaguepedia_page': child.leaguepedia_page,
                        },
                    )
                else:
                    child_stage = None
                    created = not EventStage.objects.filter(event=parent, name=stage_name).exists()

                action = 'Created' if created else 'Already exists'
                self.stdout.write(f'  Stage: {stage_name!r} ({stage_type}) — {action}')

                child_matches = Match.objects.filter(event=child)
                mc = child_matches.count()
                if not dry_run and child_stage:
                    child_matches.update(event=parent, stage=child_stage)
                self.stdout.write(
                    self.style.SUCCESS(f'  Moved {mc} matches from {child.name!r} → parent + stage {stage_name!r}')
                )

        self.stdout.write(self.style.SUCCESS('\nDone!'))
        if dry_run:
            # Roll back everything so the atomic block is a no-op.
            transaction.set_rollback(True)
