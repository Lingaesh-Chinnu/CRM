# ============================================================
# backend/core/settings.py
# Production-ready Django settings for CRM ERP
# ============================================================

import os
import sys
from pathlib import Path
from datetime import timedelta

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIST_DIR = BASE_DIR / 'frontend' / 'dist'
LOG_DIR = BASE_DIR / 'logs'
LOG_DIR.mkdir(exist_ok=True)

ENV_FILE = BASE_DIR / '.env'
if ENV_FILE.exists():
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

try:
    import pymysql  # type: ignore  # noqa: F401
except ImportError:
    pass
else:
    pymysql.install_as_MySQLdb()


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {'1', 'true', 'yes', 'on'}


def env_list(name: str, default: str = '') -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(',') if item.strip()]


def normalize_base_path(value: str | None) -> str:
    path = (value or '').strip()
    if not path or path == '/':
        return ''
    return '/' + path.strip('/')


def prefixed_url(path: str) -> str:
    path = '/' + path.strip('/') + '/'
    return f'{APP_BASE_PATH}{path}' if APP_BASE_PATH else path


REQUESTED_APP_BASE_PATH = normalize_base_path(os.environ.get('APP_BASE_PATH', ''))

# ── Security ─────────────────────────────────────────────────
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'dev-only-insecure-key-change-me')
DEBUG = env_bool('DJANGO_DEBUG', False)
APP_BASE_PATH: str = (
    REQUESTED_APP_BASE_PATH
    if (not DEBUG or env_bool('ENABLE_APP_BASE_PATH_IN_DEBUG', False))
    else ''
)
ALLOWED_HOSTS = env_list(
    'ALLOWED_HOSTS',
    '.onrender.com,localhost,127.0.0.1,testserver,wingrootechnologies.com,www.wingrootechnologies.com',
)
CSRF_TRUSTED_ORIGINS = env_list(
    'CSRF_TRUSTED_ORIGINS',
    'https://*.onrender.com,https://wingrootechnologies.com,https://www.wingrootechnologies.com,https://indrainstitute.com,https://www.indrainstitute.com',
)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SECURE = env_bool('SESSION_COOKIE_SECURE', not DEBUG)
CSRF_COOKIE_SECURE = env_bool('CSRF_COOKIE_SECURE', not DEBUG)
default_secure_ssl_redirect = not DEBUG
if os.environ.get('SECURE_SSL_REDIRECT') is None and any(arg.endswith('runserver') for arg in sys.argv):
    default_secure_ssl_redirect = False
SECURE_SSL_REDIRECT = env_bool('SECURE_SSL_REDIRECT', default_secure_ssl_redirect)
SECURE_HSTS_SECONDS = int(os.environ.get('SECURE_HSTS_SECONDS', '31536000' if not DEBUG else '0'))
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool('SECURE_HSTS_INCLUDE_SUBDOMAINS', not DEBUG)
SECURE_HSTS_PRELOAD = env_bool('SECURE_HSTS_PRELOAD', False)
FORCE_SCRIPT_NAME = APP_BASE_PATH or None
USE_X_FORWARDED_HOST = env_bool('USE_X_FORWARDED_HOST', not DEBUG)

# ── Installed Apps ────────────────────────────────────────────
DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_filters',
    'celery',
    'django_celery_beat',    # Periodic tasks stored in DB
    'django_celery_results',
]

HAS_DRF_SPECTACULAR: bool = False
try:
    import drf_spectacular as _  # noqa: F401  # type: ignore
    HAS_DRF_SPECTACULAR = True  # type: ignore
except ImportError:
    pass

if HAS_DRF_SPECTACULAR:
    THIRD_PARTY_APPS.append('drf_spectacular')  # OpenAPI docs

LOCAL_APPS = [
    'crm',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# ── Middleware ────────────────────────────────────────────────
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    # 'apps.accounts.middleware.AuditLogMiddleware',   # custom audit log - commented out as middleware not present
]

ROOT_URLCONF     = 'urls'
AUTH_USER_MODEL  = 'crm.User'
WSGI_APPLICATION = 'wsgi.application'

# ── Templates ─────────────────────────────────────────────────
TEMPLATES: list = [  # type: ignore
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates', FRONTEND_DIST_DIR],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# ── Database — MySQL ──────────────────────────────────────────
DATABASE_URL = os.environ.get('DATABASE_URL')
DB_ENGINE = os.environ.get('DB_ENGINE', 'sqlite').strip().lower()

DATABASES: dict[str, dict] = {}  # type: ignore

if DATABASE_URL:
    database_url_is_sqlite = DATABASE_URL.lower().startswith('sqlite')
    DATABASES = {  # type: ignore
        'default': dj_database_url.parse(
            DATABASE_URL,
            conn_max_age=int(os.environ.get('DB_CONN_MAX_AGE', '600')),
            ssl_require=env_bool('DB_SSL_REQUIRE', not DEBUG and not database_url_is_sqlite),
        )
    }
elif DB_ENGINE == 'mysql':
    mysql_options = {
        'charset': 'utf8mb4',
        'init_command': "SET sql_mode='STRICT_TRANS_TABLES'",
    }
    if os.environ.get('DB_UNIX_SOCKET'):
        mysql_options['unix_socket'] = os.environ['DB_UNIX_SOCKET']

    DATABASES = {  # type: ignore
        'default': {
            'ENGINE': 'django.db.backends.mysql',
            'NAME': os.environ.get('DB_NAME', os.environ.get('MYSQL_DATABASE', '')),
            'USER': os.environ.get('DB_USER', os.environ.get('MYSQL_USER', '')),
            'PASSWORD': os.environ.get('DB_PASSWORD', os.environ.get('MYSQL_PASSWORD', '')),
            'HOST': os.environ.get('DB_HOST', os.environ.get('MYSQL_HOST', 'localhost')),
            'PORT': os.environ.get('DB_PORT', os.environ.get('MYSQL_PORT', '3306')),
            'OPTIONS': mysql_options,
        }
    }
else:
    DATABASES = {  # type: ignore
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': os.environ.get('SQLITE_NAME', BASE_DIR / 'db.sqlite3'),
        }
    }

# ── Caching & Celery via Redis ────────────────────────────────
REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
USE_REDIS_CACHE = os.environ.get('USE_REDIS_CACHE', 'false').lower() == 'true'

CACHES: dict[str, dict] = {}  # type: ignore

if USE_REDIS_CACHE:
    CACHES = {  # type: ignore
        'default': {
            'BACKEND':  'django_redis.cache.RedisCache',
            'LOCATION': REDIS_URL,
            'OPTIONS':  {'CLIENT_CLASS': 'django_redis.client.DefaultClient'},
            'TIMEOUT':  300,
        }
    }
else:
    CACHES = {  # type: ignore
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'crm-local-cache',
            'TIMEOUT': 300,
        }
    }

CELERY_BROKER_URL         = REDIS_URL
CELERY_RESULT_BACKEND     = 'django-db'
CELERY_ACCEPT_CONTENT     = ['json']
CELERY_TASK_SERIALIZER    = 'json'
CELERY_RESULT_SERIALIZER  = 'json'
CELERY_TIMEZONE           = 'Asia/Kolkata'
CELERY_BEAT_SCHEDULER     = 'django_celery_beat.schedulers:DatabaseScheduler'

# ── Django REST Framework ─────────────────────────────────────
REST_FRAMEWORK: dict = {  # type: ignore
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS':  'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE':                  25,
    'DEFAULT_RENDERER_CLASSES':   ['rest_framework.renderers.JSONRenderer'],
    'DEFAULT_THROTTLE_CLASSES':   ['rest_framework.throttling.UserRateThrottle'],
    'DEFAULT_THROTTLE_RATES':     {
        'user': '1000/hour',
        'public_lead_form': os.environ.get('PUBLIC_LEAD_FORM_RATE', '10/hour'),
    },
}

if HAS_DRF_SPECTACULAR:
    REST_FRAMEWORK['DEFAULT_SCHEMA_CLASS'] = 'drf_spectacular.openapi.AutoSchema'

# ── JWT Configuration ─────────────────────────────────────────
SIMPLE_JWT: dict = {  # type: ignore
    'ACCESS_TOKEN_LIFETIME':          timedelta(hours=8),
    'REFRESH_TOKEN_LIFETIME':         timedelta(days=7),
    'ROTATE_REFRESH_TOKENS':          True,
    'BLACKLIST_AFTER_ROTATION':       True,
    'UPDATE_LAST_LOGIN':              True,
    'ALGORITHM':                      'HS256',
    'SIGNING_KEY':                    SECRET_KEY,
    'AUTH_HEADER_TYPES':              ('Bearer',),
    'AUTH_HEADER_NAME':               'HTTP_AUTHORIZATION',
    'USER_ID_FIELD':                  'id',
    'USER_ID_CLAIM':                  'user_id',
    'TOKEN_OBTAIN_SERIALIZER':        'serializers.CustomTokenObtainPairSerializer',
}

# ── CORS ──────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = env_list(
    'CORS_ALLOWED_ORIGINS',
    'https://wingrootechnologies.com,https://www.wingrootechnologies.com,https://indrainstitute.com,https://www.indrainstitute.com,http://localhost:3000,http://localhost:5173'
)
CORS_ALLOWED_ORIGIN_REGEXES = env_list(
    'CORS_ALLOWED_ORIGIN_REGEXES',
    r'^https://.*\.onrender\.com$',
)
CORS_ALLOW_CREDENTIALS = True

# ── Static + Media ────────────────────────────────────────────
STATIC_URL   = os.environ.get('STATIC_URL', prefixed_url('static'))
STATIC_ROOT  = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [FRONTEND_DIST_DIR] if FRONTEND_DIST_DIR.exists() else []
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
MEDIA_URL    = os.environ.get('MEDIA_URL', prefixed_url('media'))
MEDIA_ROOT   = Path(os.environ.get('MEDIA_ROOT', BASE_DIR / 'media'))

# ── AWS S3 (production media storage) ─────────────────────────
USE_S3_STORAGE = env_bool('USE_S3_STORAGE', False)
if USE_S3_STORAGE:
    DEFAULT_FILE_STORAGE   = 'storages.backends.s3boto3.S3Boto3Storage'
    STORAGES = {
        'default': {
            'BACKEND': 'storages.backends.s3boto3.S3Boto3Storage',
        },
        'staticfiles': {
            'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
        },
    }
    AWS_ACCESS_KEY_ID      = os.environ.get('AWS_ACCESS_KEY_ID')
    AWS_SECRET_ACCESS_KEY  = os.environ.get('AWS_SECRET_ACCESS_KEY')
    AWS_STORAGE_BUCKET_NAME= os.environ.get('AWS_STORAGE_BUCKET_NAME', 'crm-erp-media')
    AWS_S3_REGION_NAME     = os.environ.get('AWS_S3_REGION_NAME', 'ap-south-1')
    AWS_S3_ENDPOINT_URL    = os.environ.get('AWS_S3_ENDPOINT_URL') or None
    AWS_S3_ADDRESSING_STYLE= os.environ.get('AWS_S3_ADDRESSING_STYLE') or None
    AWS_S3_CUSTOM_DOMAIN   = os.environ.get('AWS_S3_CUSTOM_DOMAIN') or (
        None if AWS_S3_ENDPOINT_URL else f'{AWS_STORAGE_BUCKET_NAME}.s3.amazonaws.com'
    )
    AWS_DEFAULT_ACL        = None
    AWS_S3_FILE_OVERWRITE  = False

RUNNING_ON_RENDER = env_bool('RENDER', False) or bool(os.environ.get('RENDER_SERVICE_ID'))
MEDIA_ROOT_IS_DEFAULT_LOCAL = MEDIA_ROOT.resolve() == (BASE_DIR / 'media').resolve()
if RUNNING_ON_RENDER and not USE_S3_STORAGE and MEDIA_ROOT_IS_DEFAULT_LOCAL:
    raise ImproperlyConfigured(
        'Render filesystems are ephemeral. Configure USE_S3_STORAGE=true for S3-compatible '
        'media storage, or set MEDIA_ROOT to an attached Render persistent disk before '
        'accepting Rules & Regulations signed PDFs, signatures, and selfies.'
    )

# ── WhatsApp Cloud API ────────────────────────────────────────
WHATSAPP_API_TOKEN   = os.environ.get('WHATSAPP_API_TOKEN', '')
WHATSAPP_PHONE_ID    = os.environ.get('WHATSAPP_PHONE_ID', '')
WHATSAPP_API_VERSION = 'v18.0'
WHATSAPP_API_URL     = f'https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_ID}/messages'
WHATSAPP_VERIFY_TOKEN= os.environ.get('WHATSAPP_VERIFY_TOKEN', 'my_verify_token')
WATI_API_URL         = os.environ.get('WATI_API_URL', '').rstrip('/')
WATI_ACCESS_TOKEN    = os.environ.get('WATI_ACCESS_TOKEN', '')
WATI_INSTANCE_ID     = os.environ.get('WATI_INSTANCE_ID', '')
DEFAULT_WHATSAPP_COUNTRY_CODE = os.environ.get('DEFAULT_WHATSAPP_COUNTRY_CODE', '91')
BILL_WHATSAPP_API_ENABLED = env_bool('BILL_WHATSAPP_API_ENABLED', False)
WHATSCHIMP_ENABLED = env_bool('WHATSCHIMP_ENABLED', False)
LEAD_CAPTURE_API_KEY = os.environ.get('LEAD_CAPTURE_API_KEY', '')

# ── Email ─────────────────────────────────────────────────────
EMAIL_BACKEND        = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST           = os.environ.get('EMAIL_HOST', '')
EMAIL_PORT           = int(os.environ.get('EMAIL_PORT', '587'))
EMAIL_HOST_USER      = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD  = os.environ.get('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS        = env_bool('EMAIL_USE_TLS', True)
DEFAULT_FROM_EMAIL   = os.environ.get('DEFAULT_FROM_EMAIL', EMAIL_HOST_USER or 'noreply@yourcrm.com')

# ── Localisation ──────────────────────────────────────────────
LANGUAGE_CODE = 'en-us'
TIME_ZONE     = 'Asia/Kolkata'
USE_I18N      = True
USE_TZ        = True

# ── API Docs ──────────────────────────────────────────────────
if HAS_DRF_SPECTACULAR:
    SPECTACULAR_SETTINGS: dict = {  # type: ignore
        'TITLE':       'CRM ERP API',
        'DESCRIPTION': 'Complete CRM + ERP backend for institute management',
        'VERSION':     '1.0.0',
        'SERVE_INCLUDE_SCHEMA': False,
    }

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ── Logging ───────────────────────────────────────────────────
LOGGING: dict = {  # type: ignore
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {'format': '{levelname} {asctime} {module} {message}', 'style': '{'},
    },
    'handlers': {
        'console': {'class': 'logging.StreamHandler', 'formatter': 'verbose'},
        'file':    {'class': 'logging.handlers.RotatingFileHandler',
                    'filename': LOG_DIR / 'django.log',
                    'maxBytes': 10 * 1024 * 1024,  # 10 MB
                    'backupCount': 5,
                    'formatter': 'verbose'},
    },
    'loggers': {
        'django':       {'handlers': ['console', 'file'], 'level': 'INFO'},
        'apps':         {'handlers': ['console', 'file'], 'level': 'DEBUG' if DEBUG else 'INFO'},
        'celery':       {'handlers': ['console', 'file'], 'level': 'INFO'},
    },
}
