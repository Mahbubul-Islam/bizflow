from .base import *

DEBUG = False
ALLOWED_HOSTS = [
    os.getenv("RENDER_EXTERNAL_HOSTNAME", "bizflow-api-2tpe.onrender.com")
]
JWT_COOKIE_SECURE = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
# Render redirects public HTTP requests to HTTPS before forwarding to Django.
# A second redirect here can loop when requests pass through Vercel's proxy.
SECURE_SSL_REDIRECT = False
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

frontend_origin = os.getenv(
    "FRONTEND_ORIGIN", "https://bizflow-blond.vercel.app"
).rstrip("/")
CSRF_TRUSTED_ORIGINS = [frontend_origin]
CORS_ALLOWED_ORIGINS = [frontend_origin]
