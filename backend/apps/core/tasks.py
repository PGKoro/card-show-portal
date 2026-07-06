from celery import shared_task


@shared_task
def example_task(x, y):
    """Placeholder task proving the Celery/Redis wiring works end to end."""
    return x + y
