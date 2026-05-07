# cPanel Deployment for `/iie_crm`

The editable source of truth is this project root plus `frontend/`. Do not edit files directly inside cPanel except for environment variables or emergency diagnostics; rebuild locally, then upload the generated files.

Final URL:

```text
https://www.wingrootechnologies.com/iie_crm/
```

## Local Development

Backend:

```bash
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173/
```

Local React uses `frontend/.env.development`:

```text
VITE_APP_BASE_PATH=
VITE_API_BASE_URL=/api
VITE_STATIC_BASE=/static/
```

Vite proxies `/api` to `http://127.0.0.1:8000`, so local development does not need cPanel paths.

## Production Environment

Set these in cPanel Python App environment variables, or place them in a server-side `.env` file in the app root:

```text
APP_BASE_PATH=/iie_crm
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=<long-random-secret>
ALLOWED_HOSTS=wingrootechnologies.com,www.wingrootechnologies.com
CSRF_TRUSTED_ORIGINS=https://wingrootechnologies.com,https://www.wingrootechnologies.com
CORS_ALLOWED_ORIGINS=https://wingrootechnologies.com,https://www.wingrootechnologies.com
STATIC_URL=/iie_crm/static/
MEDIA_URL=/iie_crm/media/

DB_ENGINE=mysql
DB_NAME=wingrcjh_new_crm
DB_USER=wingrcjh_new_crm
DB_PASSWORD=<set the provided cPanel MySQL password>
DB_HOST=localhost
DB_PORT=3306
```

Use `.env.cpanel.example` as the template. Rename it to `.env` only on the server and replace `DJANGO_SECRET_KEY` and `DB_PASSWORD` there.

If your host requires a Unix socket, also set:

```text
DB_UNIX_SOCKET=/path/to/mysql.sock
```

## Build Locally

From the project root:

```bash
cd frontend
npm run build:cpanel
cd ..
.\.venv\Scripts\python.exe manage.py collectstatic --noinput
```

The production React build uses `frontend/.env.production`:

```text
VITE_APP_BASE_PATH=/iie_crm
VITE_API_BASE_URL=/iie_crm/api
VITE_STATIC_BASE=/iie_crm/static/
```

For testing the built React app through local Django instead of the Vite dev server:

```bash
cd frontend
npm run build:django:local
cd ..
.\.venv\Scripts\python.exe manage.py collectstatic --noinput
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Local Django should then serve compiled assets from:

```text
http://127.0.0.1:8000/static/assets/
```

## cPanel Python App

Create the Python app with:

```text
Application root: iie_crm
Application URL: iie_crm
Startup file: passenger_wsgi.py
Application entry point: application
```

Then run in the activated cPanel virtualenv:

```bash
pip install -r requirements.txt
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py migrate
python manage.py collectstatic --noinput
```

## Upload These

Upload these source/runtime files and folders to the cPanel application root:

```text
automation.py
crm/
frontend/dist/
manage.py
media/                  only if you are moving existing uploaded files
passenger_wsgi.py
requirements.txt
serializers.py
settings.py
staticfiles/
urls.py
views.py
wsgi.py
.env.cpanel.example      template only; do not use as live .env without editing secrets
```

Also upload a production `.env` file if you are not using cPanel environment variables.

Do not upload:

```text
.venv/
.venv-py314-backup/
db.sqlite3
frontend/node_modules/
mobile/
mobile.tsx
frontend.js
models.py                 duplicate root snapshot; Django uses crm/models.py
package-lock.json         root placeholder lock file
cpanel_django_deploy/
cpanel_django_deploy.zip
logs/
__pycache__/
*.pyc
```

## Static and Media Paths

Django uses:

```text
STATIC_URL=/iie_crm/static/
STATIC_ROOT=staticfiles/
MEDIA_URL=/iie_crm/media/
MEDIA_ROOT=media/
```

WhiteNoise serves collected static files. Media uploads stay in `media/`; if cPanel does not route media through the Python app, create a public alias or symlink from `/iie_crm/media/` to the app `media/` folder.

## Data Migration

For a fresh production install, create the MySQL database/user in cPanel, set the DB environment variables, then run:

```bash
python manage.py migrate
```

To move existing local SQLite data:

```bash
python manage.py dumpdata --natural-foreign --natural-primary --exclude contenttypes --exclude auth.permission --output data.json
```

On cPanel after migrating MySQL:

```bash
python manage.py loaddata data.json
```
