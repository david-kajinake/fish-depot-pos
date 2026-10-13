import ulid
from django.utils import timezone


def get_current_time():
    return timezone.now()


def generate_ulid():
    return ulid.ulid()
