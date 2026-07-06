from django.contrib.auth.models import AbstractUser
from django.db import models

from .managers import UserManager


class User(AbstractUser):
    """
    Custom user model identified by email instead of username.

    `role` is a coarse-grained switch used for routing/UX (which dashboard,
    which nav). Fine-grained access control should still use Django's
    built-in Groups/Permissions on top of this, e.g. granting a vendor
    specific model permissions rather than branching purely on role.
    """

    class Role(models.TextChoices):
        VENDOR = "vendor", "Vendor"
        CUSTOMER = "customer", "Customer"
        ADMIN = "admin", "Admin"

    username = None
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CUSTOMER)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    def __str__(self):
        return self.email
