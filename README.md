# Card Show Portal

## 1. Project Overview

Card Show Portal is a marketplace platform for sports card shows and dealers. It connects three
kinds of users:

- **Vendors** — dealers who book booths and sell at shows
- **Customers** — collectors/buyers who browse shows and vendors
- **Admins** — manage shows, users, and the platform itself

**Current stage:** early scaffold. The repo has a working, containerized Django + Next.js
foundation with authentication (email/password + Google/Microsoft OAuth), a custom user model
with role support, and CI. The actual marketplace data model — shows, booths, listings,
inventory, bookings — **has not been designed or built yet**. See [Section 6](#6-current-limitations--not-yet-built)
for a full list of what's still missing.

## 2. Tech Stack

### Frontend
- **Next.js 16.2.10** — React framework (App Router) that renders the web app
- **React 19.2.4 / React DOM 19.2.4** — UI rendering library
- **TypeScript 5.9.3** — static typing across the frontend
- **Tailwind CSS 4.3.2** — utility-first CSS styling
- **ESLint 9.39.4** (`eslint-config-next`) — linting, run in CI

### Backend
- **Django 5.2.15** — web framework, ORM, and the built-in admin site
- **Django REST Framework 3.15.2** — REST API layer, versioned under `/api/v1/`
- **django-environ 0.11.2** — loads settings (`SECRET_KEY`, `DATABASE_URL`, etc.) from `.env`
- **django-cors-headers 4.4.0** — lets the Next.js frontend (a different origin) call the API
- **gunicorn 22.0.0** — production WSGI server, used as the backend container's default command
- **whitenoise 6.7.0** — serves static files (e.g. Django admin CSS/JS) in production
- **flake8 7.1.1** — Python linting, run in CI

### Database
- **PostgreSQL 16** — primary datastore. Runs as a Docker container locally; a
  Supabase-hosted Postgres instance in production. The app only ever talks to it through
  `DATABASE_URL` — there's no Supabase-specific SDK involved.
- **psycopg2-binary 2.9.10** — PostgreSQL driver for Django

### Auth
- **django-allauth 65.12.1** — email/password authentication plus Google and Microsoft OAuth
  provider integration
- **dj-rest-auth 7.2.0** — exposes allauth's flows (login, registration, social login) as JSON
  REST endpoints instead of server-rendered pages
- **djangorestframework-simplejwt 5.5.1** — issues and validates the JWT access/refresh tokens
  the frontend uses to authenticate API requests

*(`requests` and `cryptography` also appear in `requirements.txt` — these are transitive
dependencies pulled in by django-allauth's OAuth/JWT handling, not standalone architectural
choices.)*

### Background jobs
- **Celery 5.4.0** — async task queue (currently has one placeholder task,
  `apps/core/tasks.py::example_task`)
- **Redis 5.0.8** — message broker and result backend for Celery

### Containerization
- **Docker** — one `Dockerfile` per app (`backend/Dockerfile`, `frontend/Dockerfile`)
- **docker-compose** — orchestrates `postgres`, `redis`, `backend`, `celery_worker`, and
  `frontend` together for local development (`docker-compose.yml`)

## 3. Repo Structure

```
card-show-portal/
├── backend/                        # Django + DRF API
│   ├── apps/
│   │   ├── core/                   # health check, role-permission classes, example Celery task
│   │   │   ├── permissions.py      #   HasRole / IsVendor / IsCustomer / IsAdminRole
│   │   │   ├── tasks.py            #   example_task (placeholder Celery job)
│   │   │   ├── urls.py             #   /api/v1/health/
│   │   │   └── views.py            #   HealthCheckView (checks DB connectivity)
│   │   └── users/                  # custom User model + auth wiring
│   │       ├── models.py           #   User (email-based, role field)
│   │       ├── managers.py         #   UserManager (email-based create_user/create_superuser)
│   │       ├── serializers.py      #   RegisterSerializer, UserDetailsSerializer (adds `role`)
│   │       ├── views.py            #   GoogleLoginView, MicrosoftLoginView (social login)
│   │       └── admin.py            #   Django admin registration for User
│   ├── config/                     # project-wide settings & wiring
│   │   ├── settings/
│   │   │   ├── base.py             #   shared settings (env-driven)
│   │   │   ├── local.py            #   local dev overrides (DEBUG=True)
│   │   │   └── production.py       #   production overrides (HTTPS/security settings)
│   │   ├── urls.py                 #   root URL conf (admin, /api/v1/, /api/v1/auth/, allauth)
│   │   └── celery.py               #   Celery app instance
│   ├── manage.py
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
├── frontend/                        # Next.js (App Router) + TypeScript
│   ├── app/
│   │   ├── page.tsx                #   landing page
│   │   ├── login/page.tsx          #   login form
│   │   ├── signup/page.tsx         #   signup form
│   │   └── dashboard/
│   │       ├── page.tsx            #   role-picker hub (placeholder)
│   │       ├── vendor/page.tsx     #   vendor dashboard (placeholder)
│   │       ├── customer/page.tsx   #   customer dashboard (placeholder)
│   │       └── admin/page.tsx      #   admin dashboard (placeholder)
│   ├── lib/api.ts                  # fetch wrapper for the Django API (reads NEXT_PUBLIC_API_BASE_URL)
│   ├── package.json
│   ├── .env.example
│   └── Dockerfile
├── docker-compose.yml               # postgres, redis, backend, celery_worker, frontend
├── .github/workflows/ci.yml         # CI: backend (flake8 + tests), frontend (lint + build)
└── README.md
```

## 4. Local Setup — Step by Step

### Prerequisites
- **Docker Desktop** — this is the only hard requirement; everything runs in containers.
- Optional, only if you want to run something outside Docker: **Python 3.12** (matches
  `backend/Dockerfile` and CI) and **Node.js 20** (matches `frontend/Dockerfile` and CI).

### Clone and configure environment variables
```bash
git clone <repo-url>
cd card-show-portal
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```
Open `backend/.env` and set `SECRET_KEY` to any long random string. Leave the Google/Microsoft
OAuth variables blank unless you have real credentials (see [Section 6](#6-current-limitations--not-yet-built)) —
social login just won't work until they're filled in; everything else runs fine without them.

### Start the stack
```bash
docker compose up --build
```
This builds and starts `postgres`, `redis`, `backend`, `celery_worker`, and `frontend`. Leave
this terminal running; open a new terminal tab for the commands below.

> **Note on the Postgres port:** `docker-compose.yml` maps the container's Postgres to host port
> **5433** (not 5432), to avoid clashing with a Postgres install you might already have running
> locally. Containers talk to each other over the internal Docker network on port 5432 as usual
> (`DATABASE_URL=postgres://postgres:postgres@postgres:5432/card_show_portal` in
> `backend/.env.example`) — 5433 only matters if you want to connect to the local database
> directly from your host machine (e.g. `psql -h localhost -p 5433 -U postgres`).

### Run migrations
```bash
docker compose exec backend python manage.py migrate
```

### Create a superuser (admin login)
```bash
docker compose exec backend python manage.py createsuperuser
```
Follow the prompts (email + password — there's no username field on this project's User model).

### URLs once running
| What | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend health check | http://localhost:8000/api/v1/health/ |
| Django admin | http://localhost:8000/admin/ |

There's no auto-generated API documentation (no drf-spectacular/Swagger installed) — the
available endpoints are documented in [Section 5](#5-authentication-overview) and in the code
under `backend/config/urls.py` and `backend/apps/core/urls.py`.

### Running tests and lint
```bash
# Backend
docker compose exec backend python manage.py test
docker compose exec backend flake8 .

# Frontend
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
```
These are the same checks `.github/workflows/ci.yml` runs on every pull request into `main`.
There is no frontend test framework installed yet (no Jest/Vitest) — `npm run lint` and
`npm run build` are the only frontend CI checks today.

## 5. Authentication Overview

Auth is JWT-based, issued through **dj-rest-auth** on top of **django-allauth** and
**djangorestframework-simplejwt**. The API's `DEFAULT_AUTHENTICATION_CLASSES` is
`JWTAuthentication` (`backend/config/settings/base.py`), so authenticated requests need an
`Authorization: Bearer <access token>` header.

Key endpoints (`backend/config/urls.py`):
- `POST /api/v1/auth/registration/` — email/password signup, returns `access`/`refresh` JWTs
- `POST /api/v1/auth/login/` — email/password login, returns `access`/`refresh` JWTs
- `POST /api/v1/auth/logout/`
- `GET /api/v1/auth/user/` — current user's details, including `role`
- `POST /api/v1/auth/google/`, `POST /api/v1/auth/microsoft/` — social login. The frontend
  exchanges an OAuth `code` from Google/Microsoft's consent screen for our own JWT pair
  (`backend/apps/users/views.py::GoogleLoginView` / `MicrosoftLoginView`).

**Roles:** the custom `User` model (`backend/apps/users/models.py`) uses email as its
`USERNAME_FIELD` (no username) and has a `role` field with three choices — `vendor`,
`customer`, `admin` — defaulting to `customer`. `backend/apps/core/permissions.py` defines a
`HasRole` base permission plus concrete `IsVendor` / `IsCustomer` / `IsAdminRole` classes for
gating DRF views by role. As the code comments note, these are meant to be combined with
Django's built-in Groups/Permissions for finer-grained access later (e.g. `IsVendor` gates "this
is a vendor endpoint" while a model permission gates "this vendor can create booths") — none of
that finer-grained layer exists yet.

## 6. Current Limitations / Not Yet Built

- **No data model for shows, booths, or inventory.** The only Django apps that exist are
  `users` (auth) and `core` (health check, permissions, one placeholder Celery task). There is
  no `shows`, `listings`, `bookings`, or similar app yet — this is the next major piece of work.
- **New signups always default to `role="customer"`.** There's no flow yet for a user to
  register as a vendor, or for an admin to change someone's role after the fact (only possible
  today via the Django admin).
- **The role permission classes aren't wired to any real endpoint.** `IsVendor` / `IsCustomer` /
  `IsAdminRole` exist in `apps/core/permissions.py` but nothing uses them yet, since there are no
  vendor/customer resource endpoints to protect.
- **Frontend auth isn't wired end-to-end.** The login and signup forms
  (`frontend/app/login/page.tsx`, `frontend/app/signup/page.tsx`) call the API but don't yet
  store the returned tokens or redirect based on role — both have explicit `// TODO` comments
  marking this. The `/dashboard` pages are static placeholders with no real auth guard.
- **No frontend test framework.** CI only runs `npm run lint` and `npm run build` for the
  frontend; there's no Jest/Vitest/Playwright setup.
- **No API documentation generator.** No drf-spectacular, Swagger, or similar — endpoints are
  documented here and via the code itself.
- **Only one Celery task exists**, and it's a placeholder (`apps/core/tasks.py::example_task`,
  adds two numbers) — no real background jobs have been built yet.
- **Email sending uses Django's console backend by default** (prints emails to the terminal).
  No real transactional email provider is configured; set `EMAIL_BACKEND` in `.env` when one is.
- **OAuth credentials are placeholders.** The Google/Microsoft social login endpoints work in
  code, but need real OAuth app credentials (`GOOGLE_OAUTH_CLIENT_ID`/`SECRET`,
  `MICROSOFT_OAUTH_CLIENT_ID`/`SECRET` in `backend/.env`) from the Google Cloud Console and
  Azure/Entra ID before they'll actually authenticate anyone.
