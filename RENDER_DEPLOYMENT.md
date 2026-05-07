# Render Deployment

Render test URL runs at the domain root by default:

```text
https://<your-service>.onrender.com/
```

Later custom-domain path support is controlled by:

```text
APP_BASE_PATH=/iie_crm
```

When `APP_BASE_PATH` is empty, Django and React use `/api`, `/static/`, and `/media/`.
When `APP_BASE_PATH=/iie_crm`, Django and React use `/iie_crm/api`, `/iie_crm/static/`, and `/iie_crm/media/`.

## Build

Use this Render build command:

```bash
bash build.sh
```

The script installs Python dependencies, installs frontend dependencies with `npm ci`, builds React, and runs:

```bash
python manage.py collectstatic --noinput --clear
```

## Start

Use this start command:

```bash
gunicorn wsgi:application
```

The `Procfile` also contains:

```text
web: gunicorn wsgi:application
```

## Environment Variables

For the first Render test deployment:

```text
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=<generate a long secret>
APP_BASE_PATH=
ALLOWED_HOSTS=.onrender.com,wingrootechnologies.com,www.wingrootechnologies.com
CSRF_TRUSTED_ORIGINS=https://*.onrender.com,https://wingrootechnologies.com,https://www.wingrootechnologies.com
CORS_ALLOWED_ORIGINS=https://wingrootechnologies.com,https://www.wingrootechnologies.com
CORS_ALLOWED_ORIGIN_REGEXES=^https://.*\.onrender\.com$
DATABASE_URL=<Render PostgreSQL internal database URL>
DB_SSL_REQUIRE=true
STATIC_URL=/static/
MEDIA_URL=/media/
USE_S3_STORAGE=false
```

For the later custom-domain path:

```text
APP_BASE_PATH=/iie_crm
STATIC_URL=/iie_crm/static/
MEDIA_URL=/iie_crm/media/
```

Then redeploy so React is rebuilt with the new base paths.

## Database

Render production uses PostgreSQL via `DATABASE_URL`. Local development can continue using SQLite when `DATABASE_URL` is not set.

After the first deploy, run:

```bash
python manage.py migrate
```

## Media Files

Render web service filesystems are ephemeral unless you attach a persistent disk. Free web services should not be treated as durable storage for uploaded signatures or signed PDFs.

For production media, use one of these:

```text
1. S3-compatible object storage via django-storages
2. A paid Render persistent disk mounted under the app and configured as MEDIA_ROOT
```

Without persistent media storage, rules signatures and generated PDFs can disappear after deploys/restarts.
