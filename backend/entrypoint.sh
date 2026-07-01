#!/bin/sh
set -e

# Apply DB migrations and gather static files into the shared volume that Caddy
# serves. Both are idempotent, so they are safe to run on every container start.
python manage.py migrate --noinput
python manage.py collectstatic --noinput

exec "$@"
