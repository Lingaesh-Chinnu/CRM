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

For a non-production Render test deployment that uses PostgreSQL as the
Rules-proof fallback:

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
RULES_DATABASE_FILE_BACKUPS=true
```

For the later custom-domain path:

```text
APP_BASE_PATH=/iie_crm
STATIC_URL=/iie_crm/static/
MEDIA_URL=/iie_crm/media/
```

Then redeploy so React is rebuilt with the new base paths.

## Database

Render uses PostgreSQL via `DATABASE_URL`. Local development can continue
using SQLite when `DATABASE_URL` is not set. Run every deployed migration
before accepting a Rules submission; the proof fallback requires the binary
columns introduced by CRM migrations `0036`, `0101`, and `0102`.

After the first deploy, run:

```bash
python manage.py migrate
```

## Rules & Regulations proof storage

Render's web-service filesystem is ephemeral. On the checked-in Free plan,
uploaded files in the application directory are lost when the service is
restarted, redeployed, or spun down. A Free Render web service cannot attach a
persistent disk.

The application has a deliberate Render fallback: when `USE_S3_STORAGE=false`
and the app is running on Render with its default local `MEDIA_ROOT`, it does
not rely on those local file paths. It stores the original selfie, original
signature, and signed PDF bytes in PostgreSQL `BinaryField` columns and serves
them through the protected Rules endpoints. A submission is not marked
submitted until those bytes and the repository document have been verified.

This fallback survives a web-service restart only while the PostgreSQL database
itself remains durable. It is not a substitute for a production storage and
backup policy. In particular, the checked-in `render.yaml` uses Free web and
database plans, which must not be represented as permanent document storage.
Before production, use one of the following and verify it in the Render
Dashboard:

1. Recommended: S3-compatible object storage (AWS S3, Cloudflare R2, or an
   equivalent durable bucket) with lifecycle and backup policy appropriate for
   signed records.
2. A paid Render service with an actual mounted persistent disk, with
   `MEDIA_ROOT` pointing inside that mount.
3. A durable, backed-up paid PostgreSQL service while retaining the database
   proof fallback. Confirm capacity and retention for the binary documents.

### Recommended S3/R2 configuration

Set these Render secrets/environment variables, then redeploy and perform an
upload plus authenticated download test:

```text
USE_S3_STORAGE=true
AWS_STORAGE_BUCKET_NAME=<private durable bucket>
AWS_ACCESS_KEY_ID=<bucket access key>
AWS_SECRET_ACCESS_KEY=<bucket secret>
AWS_S3_REGION_NAME=<region, or auto for R2>
AWS_S3_ENDPOINT_URL=<S3/R2 endpoint URL>
AWS_S3_ADDRESSING_STYLE=path
# Optional only when a suitable public/custom media domain is intentionally used:
AWS_S3_CUSTOM_DOMAIN=<custom domain>
```

`AWS_S3_ENDPOINT_URL` is required by the current settings validation, including
for native AWS S3. Use the provider's endpoint; do not put credentials in the
repository or browser bundle. With object storage enabled, verify that each
saved object can be read back before treating a submission as complete.

### Render persistent disk alternative

This option requires a paid web service and an actual disk mount created in
the Render Dashboard. Setting `MEDIA_ROOT` alone does not create durable
storage.

```text
MEDIA_ROOT=/path/to/persistent-disk/media
USE_S3_STORAGE=false
RULES_DATABASE_FILE_BACKUPS=true
RULES_PERSISTENT_MEDIA_ROOT=true
```

After changing any storage setting, redeploy (environment changes are not
proof of a live configuration), run migrations, submit a test document, and
verify its signed PDF, selfie, and signature after a service restart from a
separate authorized session.
