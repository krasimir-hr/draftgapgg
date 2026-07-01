#!/bin/bash
cd "$(dirname "$0")"

(cd backend && source venv/bin/activate && python manage.py runserver) &
DJANGO_PID=$!

(cd frontend && npm run dev) &
VITE_PID=$!

trap "kill $DJANGO_PID $VITE_PID" INT TERM
wait
