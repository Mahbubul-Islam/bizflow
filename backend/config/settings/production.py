from .base import *

DEBUG = False
ALLOWED_HOSTS = [
    os.getenv("RENDER_EXTERNAL_HOSTNAME", "bizflow-api-2tpe.onrender.com")
]
JWT_COOKIE_SECURE = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

frontend_origin = os.getenv("FRONTEND_ORIGIN", "https://bizflow-blond.vercel.app")
CSRF_TRUSTED_ORIGINS = [frontend_origin]
CORS_ALLOWED_ORIGINS = [frontend_origin]
