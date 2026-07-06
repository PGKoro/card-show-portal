from django.test import TestCase

from .models import User


class UserModelTests(TestCase):
    def test_create_user_uses_email_as_identifier(self):
        user = User.objects.create_user(email="vendor@example.com", password="s3cret!23")
        self.assertEqual(user.email, "vendor@example.com")
        self.assertEqual(user.role, User.Role.CUSTOMER)
        self.assertTrue(user.check_password("s3cret!23"))

    def test_create_superuser_defaults_to_admin_role(self):
        admin = User.objects.create_superuser(email="admin@example.com", password="s3cret!23")
        self.assertEqual(admin.role, User.Role.ADMIN)
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)
