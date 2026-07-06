# Card Show Portal

A marketplace platform connecting sports card show vendors with customers —
discover shows, book booths, and manage listings.

## Stack

| Layer            | Technology                                                |
| ----------------- | ---------------------------------------------------------- |
| Frontend          | Next.js (App Router), React, TypeScript, Tailwind CSS      |
| Backend           | Django, Django REST Framework                              |
| Auth              | django-allauth (email/password + Google + Microsoft OAuth), JWT via djangorestframework-simplejwt |
| Database          | PostgreSQL (Docker locally, Supabase-hosted in production) |
| Background jobs   | Celery + Redis                                              |
| Containerization  | Docker + docker-compose                                    |

### Repo layout

```
card-show-portal/
├── frontend/          # Next.js app (App Router)
├── backend/            # Django project (config/ settings + apps/)
├── docker-compose.yml   # orchestrates frontend, backend, postgres, redis
└── .github/workflows/ci.yml
```

The backend is organized as `config/` (settings, urls, celery app) plus
`apps/` (each Django app, e.g. `apps/users`, `apps/core`). The custom user
model lives in `apps/users` and uses email instead of username, with a
`role` field (`vendor` / `customer` / `admin`) for coarse routing — combine
with Django Groups/Permissions for finer-grained access control as the
app grows.

Auth is JWT-based: the Next.js frontend calls the Django API directly and
stores the access/refresh tokens returned by dj-rest-auth. Google and
Microsoft logins flow through allauth's OAuth2 adapters, bridged into the
same JWT response via `apps/users/views.py`.

## Local setup

### Prerequisites

- Docker + Docker Compose
- (Optional, for running things outside Docker) Python 3.12+ and Node 20+

### 1. Clone and configure environment

```bash
git clone <repo-url>
cd card-show-portal
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Edit `backend/.env` and set a real `SECRET_KEY`. The Google/Microsoft OAuth
variables can stay blank until you've registered OAuth apps (see below) —
email/password signup works without them.

### 2. Start the stack

```bash
docker compose up --build
```

This starts:

- `postgres` — Postgres 16, exposed on `localhost:5432`
- `redis` — exposed on `localhost:6379`
- `backend` — Django dev server on `localhost:8000` (hot-reloads via bind mount)
- `celery_worker` — processes background tasks
- `frontend` — Next.js dev server on `localhost:3000` (hot-reloads via bind mount)

### 3. Run migrations and create a superuser

In a second terminal, once the stack is up:

```bash
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
```

### 4. Access the app

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/api/v1/health/
- Django admin: http://localhost:8000/admin/

### Running tests / linters locally

```bash
# Backend
docker compose exec backend flake8 .
docker compose exec backend python manage.py test

# Frontend
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
```

## OAuth setup (manual, outside this repo)

Google and Microsoft login require creating real OAuth app credentials and
dropping them into `backend/.env`:

- **Google** — create an OAuth 2.0 Client ID in the
  [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
  authorized redirect URI matching `GOOGLE_OAUTH_CALLBACK_URL`. Set
  `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`.
- **Microsoft** — register an app in
  [Azure/Entra ID App registrations](https://portal.azure.com/), redirect
  URI matching `MICROSOFT_OAUTH_CALLBACK_URL`. Set
  `MICROSOFT_OAUTH_CLIENT_ID` / `MICROSOFT_OAUTH_CLIENT_SECRET`.

## Production database (Supabase)

Production reads `DATABASE_URL` from the environment — no Supabase SDK is
used. Point it at your Supabase project's connection string (Session
Pooler or direct connection) and run migrations as usual.
