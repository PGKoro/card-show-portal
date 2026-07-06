import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

app = Celery("card_show_portal")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
