#!/usr/bin/env bash
set -o errexit

python -m pip install --upgrade pip
pip install -r requirements.txt

cd frontend
npm ci

APP_BASE_PATH="${APP_BASE_PATH:-}"
if [ -n "$APP_BASE_PATH" ] && [ "$APP_BASE_PATH" != "/" ]; then
  APP_BASE_PATH="/${APP_BASE_PATH#/}"
  APP_BASE_PATH="${APP_BASE_PATH%/}"
  export VITE_APP_BASE_PATH="$APP_BASE_PATH"
  export VITE_API_BASE_URL="$APP_BASE_PATH/api"
  export VITE_STATIC_BASE="$APP_BASE_PATH/static/"
else
  export VITE_APP_BASE_PATH=""
  export VITE_API_BASE_URL="/api"
  export VITE_STATIC_BASE="/static/"
fi

npm run build
cd ..

python manage.py collectstatic --noinput --clear
