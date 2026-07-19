"""Local development settings."""

from .base import *  # noqa: F401,F403

DEBUG = True
ALLOWED_HOSTS = ["*"]

# Rate limiting (see base.py's REST_FRAMEWORK) protects the public production
# deployment from credential stuffing / registration spam. It has no purpose
# against a local, single-developer database, and DRF's throttle counters are
# shared per-process for the life of the run — a single `manage.py test`
# invocation makes far more than 10 auth calls within the "auth" scope's
# one-minute window, tripping 429s across unrelated tests. Disable throttling
# for local dev and tests; production keeps the real limits since it doesn't
# touch REST_FRAMEWORK.
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": ()}  # noqa: F405
