# ============================================================
# backend/core/settings.py
# Production-ready Django settings for CRM ERP
# ============================================================

import os
from pathlib import Path
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIST_DIR = BASE_DIR / 'frontend' / 'dist'

# ── Security ─────────────────────────────────────────────────
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'dev-only-insecure-key-change-me')
DEBUG      = True
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')

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

try:
    import drf_spectacular  # noqa: F401
except ImportError:
    HAS_DRF_SPECTACULAR = False
else:
    HAS_DRF_SPECTACULAR = True

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
TEMPLATES = [{
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
}]

# ── Database — MySQL ──────────────────────────────────────────
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# ── Caching & Celery via Redis ────────────────────────────────
REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
USE_REDIS_CACHE = os.environ.get('USE_REDIS_CACHE', 'false').lower() == 'true'

if USE_REDIS_CACHE:
    CACHES = {
        'default': {
            'BACKEND':  'django_redis.cache.RedisCache',
            'LOCATION': REDIS_URL,
            'OPTIONS':  {'CLIENT_CLASS': 'django_redis.client.DefaultClient'},
            'TIMEOUT':  300,
        }
    }
else:
    CACHES = {
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
REST_FRAMEWORK = {
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
    'DEFAULT_THROTTLE_RATES':     {'user': '1000/hour'},
}

if HAS_DRF_SPECTACULAR:
    REST_FRAMEWORK['DEFAULT_SCHEMA_CLASS'] = 'drf_spectacular.openapi.AutoSchema'

# ── JWT Configuration ─────────────────────────────────────────
SIMPLE_JWT = {
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
CORS_ALLOWED_ORIGINS = os.environ.get(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:3000,http://localhost:5173'
).split(',')
CORS_ALLOW_CREDENTIALS = True

# ── Static + Media ────────────────────────────────────────────
STATIC_URL   = '/static/'
STATIC_ROOT  = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [FRONTEND_DIST_DIR] if FRONTEND_DIST_DIR.exists() else []
MEDIA_URL    = '/media/'
MEDIA_ROOT   = BASE_DIR / 'media'

# ── AWS S3 (production media storage) ─────────────────────────
if not DEBUG:
    DEFAULT_FILE_STORAGE   = 'storages.backends.s3boto3.S3Boto3Storage'
    STATICFILES_STORAGE    = 'storages.backends.s3boto3.S3StaticStorage'
    AWS_ACCESS_KEY_ID      = os.environ.get('AWS_ACCESS_KEY_ID')
    AWS_SECRET_ACCESS_KEY  = os.environ.get('AWS_SECRET_ACCESS_KEY')
    AWS_STORAGE_BUCKET_NAME= os.environ.get('AWS_STORAGE_BUCKET_NAME', 'crm-erp-media')
    AWS_S3_REGION_NAME     = os.environ.get('AWS_S3_REGION_NAME', 'ap-south-1')
    AWS_S3_CUSTOM_DOMAIN   = f'{AWS_STORAGE_BUCKET_NAME}.s3.amazonaws.com'
    AWS_DEFAULT_ACL        = None
    AWS_S3_FILE_OVERWRITE  = False

# ── WhatsApp Cloud API ────────────────────────────────────────
WHATSAPP_API_TOKEN   = os.environ.get('WHATSAPP_API_TOKEN', '')
WHATSAPP_PHONE_ID    = os.environ.get('WHATSAPP_PHONE_ID', '')
WHATSAPP_API_VERSION = 'v18.0'
WHATSAPP_API_URL     = f'https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_ID}/messages'
WHATSAPP_VERIFY_TOKEN= os.environ.get('WHATSAPP_VERIFY_TOKEN', 'my_verify_token')

# ── Email ─────────────────────────────────────────────────────
EMAIL_BACKEND   = 'django_ses.SESBackend'
AWS_SES_REGION_NAME     = os.environ.get('AWS_SES_REGION_NAME', 'ap-south-1')
AWS_SES_REGION_ENDPOINT = f'email.{AWS_SES_REGION_NAME}.amazonaws.com'
DEFAULT_FROM_EMAIL      = os.environ.get('DEFAULT_FROM_EMAIL', 'noreply@yourcrm.com')

# ── Localisation ──────────────────────────────────────────────
LANGUAGE_CODE = 'en-us'
TIME_ZONE     = 'Asia/Kolkata'
USE_I18N      = True
USE_TZ        = True

# ── API Docs ──────────────────────────────────────────────────
if HAS_DRF_SPECTACULAR:
    SPECTACULAR_SETTINGS = {
        'TITLE':       'CRM ERP API',
        'DESCRIPTION': 'Complete CRM + ERP backend for institute management',
        'VERSION':     '1.0.0',
        'SERVE_INCLUDE_SCHEMA': False,
    }

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ── Logging ───────────────────────────────────────────────────
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {'format': '{levelname} {asctime} {module} {message}', 'style': '{'},
    },
    'handlers': {
        'console': {'class': 'logging.StreamHandler', 'formatter': 'verbose'},
        'file':    {'class': 'logging.handlers.RotatingFileHandler',
                    'filename': BASE_DIR / 'logs/django.log',
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
