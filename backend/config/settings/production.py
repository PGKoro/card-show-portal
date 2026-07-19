"""Production settings."""

from .base import *  # noqa: F401,F403
from .base import env

DEBUG = False
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS")

# base.py falls back to a public, checked-in placeholder if SECRET_KEY isn't
# set — fine for local dev, not for production. Re-read it here with no
# default so the app refuses to start rather than silently running with a
# key anyone can find in the repo.
SECRET_KEY = env("SECRET_KEY")

SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 7
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# User-uploaded media (venue floor-plan images) via Supabase Storage, which
# speaks the S3 API — base.py's local-disk FileSystemStorage only works on
# whatever machine is actually running the server, so production eventually
# needs a real shared store instead. Optional for now: until the Supabase
# bucket + S3 keys are set up, SUPABASE_URL is left unset and this app runs
# with base.py's local-disk storage (uploads won't survive a redeploy/restart
# on Railway, but nothing else in this settings module depends on it).
SUPABASE_URL = env("SUPABASE_URL", default="")  # e.g. https://xxxxxxxx.supabase.co
if SUPABASE_URL:
    AWS_STORAGE_BUCKET_NAME = env("SUPABASE_STORAGE_BUCKET")
    AWS_S3_ENDPOINT_URL = f"{SUPABASE_URL}/storage/v1/s3"
    AWS_ACCESS_KEY_ID = env("SUPABASE_S3_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = env("SUPABASE_S3_SECRET_ACCESS_KEY")
    AWS_S3_REGION_NAME = env("SUPABASE_S3_REGION", default="us-east-1")
    # Supabase Storage manages read/write access via its own bucket policies,
    # not per-object S3 ACLs, and the bucket is public (floor-plan images have
    # no reason to be gated) so served URLs don't need query-string signing.
    AWS_DEFAULT_ACL = None
    AWS_QUERYSTRING_AUTH = False
    AWS_S3_FILE_OVERWRITE = False
    MEDIA_URL = f"{SUPABASE_URL}/storage/v1/object/public/{AWS_STORAGE_BUCKET_NAME}/"

    STORAGES["default"] = {  # noqa: F405 — STORAGES dict comes from base.py's `import *`
        "BACKEND": "storages.backends.s3boto3.S3Boto3Storage",
    }
