import getpass

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

ADMIN_EMAIL = "admin@showfloor.com"


class Command(BaseCommand):
    help = (
        f"Creates the platform admin account ({ADMIN_EMAIL}) with role=admin. "
        "Prompts for the password interactively — never pass it as an argument "
        "or hardcode it, since that would leak into shell history / process lists."
    )

    def handle(self, *args, **options):
        User = get_user_model()

        if User.objects.filter(email=ADMIN_EMAIL).exists():
            raise CommandError(
                f"A user with email {ADMIN_EMAIL} already exists. "
                "Use the Django admin or `manage.py shell` if you need to reset it."
            )

        password = self._prompt_for_password()

        user = User.objects.create_superuser(
            email=ADMIN_EMAIL,
            password=password,
            role=User.Role.ADMIN,
        )

        self.stdout.write(
            self.style.SUCCESS(f"Created admin user {user.email} (role={user.role}).")
        )

    def _prompt_for_password(self) -> str:
        while True:
            password = getpass.getpass("Password: ")
            if not password:
                self.stderr.write("Password cannot be blank.")
                continue

            confirm = getpass.getpass("Password (again): ")
            if password != confirm:
                self.stderr.write("Passwords didn't match. Try again.")
                continue

            try:
                validate_password(password)
            except ValidationError as exc:
                for message in exc.messages:
                    self.stderr.write(message)
                continue

            return password
