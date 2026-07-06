from django.db import connection
from django.db.utils import OperationalError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthCheckView(APIView):
    """Confirms the app is up and can talk to the database."""

    permission_classes = [AllowAny]

    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            database_ok = True
        except OperationalError:
            database_ok = False

        status_code = 200 if database_ok else 503
        return Response(
            {"status": "ok" if database_ok else "error", "database": database_ok},
            status=status_code,
        )
