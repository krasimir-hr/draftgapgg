"""One-time migration of local media files into the configured storage backend.

When R2 (or any S3-compatible) storage is configured, the ImageField values in
the DB (e.g. ``players/Faker.webp``) resolve to remote URLs — but the actual
bytes still only exist under the local MEDIA_ROOT until they're uploaded. This
walks MEDIA_ROOT and uploads every file to the default storage under the same
key, so existing image paths keep working.

Idempotent: files already present in the target storage are skipped unless
--force is passed. Run this once after switching to R2.
"""

import os

from django.conf import settings
from django.core.files.base import File
from django.core.files.storage import FileSystemStorage, default_storage
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Upload all files under MEDIA_ROOT to the configured (remote) storage backend."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force", action="store_true",
            help="Re-upload even if the key already exists in the target storage.",
        )
        parser.add_argument(
            "--dry-run", action="store_true",
            help="List what would be uploaded without transferring anything.",
        )

    def handle(self, *args, **opts):
        if isinstance(default_storage, FileSystemStorage):
            raise CommandError(
                "Default storage is the local filesystem — nothing to upload. "
                "Set R2_BUCKET (and the R2_* creds) so the default storage points "
                "at remote object storage, then re-run."
            )

        root = str(settings.MEDIA_ROOT)
        if not os.path.isdir(root):
            raise CommandError(f"MEDIA_ROOT does not exist: {root}")

        uploaded = skipped = 0
        for dirpath, _dirs, files in os.walk(root):
            for name in files:
                abspath = os.path.join(dirpath, name)
                key = os.path.relpath(abspath, root).replace(os.sep, "/")

                if not opts["force"] and default_storage.exists(key):
                    skipped += 1
                    continue

                if opts["dry_run"]:
                    self.stdout.write(f"  would upload: {key}")
                    uploaded += 1
                    continue

                # Overwrite deterministically at the same key (S3Storage has
                # file_overwrite=True, so save() won't mangle the name).
                if opts["force"] and default_storage.exists(key):
                    default_storage.delete(key)
                with open(abspath, "rb") as fh:
                    default_storage.save(key, File(fh))
                self.stdout.write(f"  uploaded: {key}")
                uploaded += 1

        verb = "would upload" if opts["dry_run"] else "uploaded"
        self.stdout.write(self.style.SUCCESS(
            f"Done — {verb} {uploaded}, skipped {skipped} (already present)."
        ))
