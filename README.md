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
│   │   ├── core/                   # health check, role-permission classes, shared constants
│   │   │   ├── constants.py        #   CATEGORY_CHOICES (shared vendor/listing category vocab)
│   │   │   ├── permissions.py      #   HasRole / IsVendor / IsCustomer / IsAdminRole / IsApprovedVendor
│   │   │   ├── tasks.py            #   example_task (placeholder Celery job)
│   │   │   ├── urls.py             #   /api/v1/health/
│   │   │   └── views.py            #   HealthCheckView (checks DB connectivity)
│   │   ├── users/                  # custom User model + auth/onboarding/vendor-approval
│   │   │   ├── models.py           #   User (email-based, role, onboarding/vendor fields)
│   │   │   ├── managers.py         #   UserManager (email-based create_user/create_superuser)
│   │   │   ├── serializers.py      #   RegisterSerializer, OnboardingSerializer, UserDetailsSerializer
│   │   │   ├── views.py            #   OnboardingView, vendor approval views, social login
│   │   │   ├── management/commands/create_admin.py  # creates admin@showfloor.com
│   │   │   └── admin.py            #   Django admin registration for User
│   │   ├── listings/                # a vendor's own inventory items
│   │   │   ├── models.py           #   Listing (title/category/price/condition/status)
│   │   │   ├── serializers.py, views.py, urls.py  # GET/POST /api/v1/listings/
│   │   │   └── admin.py
│   │   └── events/                  # card shows/conventions — public browse, admin-only CRUD
│   │       ├── models.py           #   Event (name/venue/city/dates/vendors M2M/estimates)
│   │       ├── serializers.py, views.py, urls.py  # GET public, POST/PATCH admin-only
│   │       └── migrations/0002_seed_events.py  # seeds the original 7 shows
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
│   │   ├── signup/page.tsx         #   signup step 1 (email/password)
│   │   ├── onboarding/
│   │   │   ├── page.tsx            #   signup step 2 (name, role)
│   │   │   ├── customer/page.tsx   #   signup step 3 for customers (interests, optional)
│   │   │   └── vendor/page.tsx     #   signup step 3 for vendors (business details)
│   │   ├── events/
│   │   │   ├── page.tsx            #   public browse (upcoming/past), real API-backed
│   │   │   └── [eventId]/page.tsx  #   public event detail (stats + vendors attending)
│   │   └── dashboard/
│   │       ├── layout.tsx          #   auth guard + Log out button (bottom of every dashboard page)
│   │       ├── page.tsx            #   auto-redirects to the signed-in user's own dashboard
│   │       ├── vendor/page.tsx     #   vendor dashboard (pending banner / add-item form)
│   │       ├── customer/page.tsx   #   customer dashboard (placeholder)
│   │       └── admin/
│   │           ├── page.tsx                  #   admin tools hub (links to the three below)
│   │           ├── vendor-approvals/page.tsx  #   review/approve/reject pending vendors
│   │           ├── manage-roles/page.tsx      #   search a user, flip customer/vendor/admin
│   │           └── events/                    #   create/edit events (EventForm.tsx is shared)
│   │               ├── page.tsx, EventForm.tsx
│   │               ├── new/page.tsx
│   │               └── [eventId]/page.tsx
│   ├── lib/
│   │   ├── api.ts                  #   fetch wrapper for the Django API
│   │   ├── events.ts               #   ShowEvent type + date/image formatting helpers
│   │   ├── auth.ts                 #   token storage (localStorage) + dashboard routing helper
│   │   └── AuthContext.tsx         #   global signed-in state (NavBar, dashboard guard read this)
│   ├── components/NavBar.tsx       #   auth-aware header (profile chip vs Log in/Sign up)
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

### Create the admin account
```bash
docker compose exec backend python manage.py create_admin
```
Creates a superuser with email `admin@showfloor.com` and `role="admin"`, prompting for a
password interactively (never hardcoded or committed anywhere). Re-running it once the account
already exists fails cleanly with an error instead of creating a duplicate. Log in with this
account through the frontend at `/login` — it redirects to `/dashboard/admin`.

For any other admin account (a different email), use Django's built-in command instead:
```bash
docker compose exec backend python manage.py createsuperuser
```
Follow the prompts (email + password — there's no username field on this project's User model).
The custom user manager (`backend/apps/users/managers.py`) already defaults superusers to
`role="admin"`, so this also gets role-based routing for free.

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
- `POST /api/v1/auth/registration/` — email/password signup only, returns `access`/`refresh`
  JWTs. Name and role are *not* collected here — see onboarding below.
- `POST /api/v1/auth/login/` — email/password login, returns `access`/`refresh` JWTs
- `POST /api/v1/auth/logout/`
- `GET /api/v1/auth/user/` — current user's details, including `role`, `onboarding_completed`,
  and (for vendors) `vendor_status`
- `PATCH /api/v1/auth/onboarding/` — signup step 2 (authenticated). Collects name and role
  (`vendor` or `customer`). Doesn't mark `onboarding_completed` yet — that happens in step 3.
- `PATCH /api/v1/auth/onboarding/details/` — signup step 3 (authenticated), role-specific
  fields: `business_name` / `business_description` / `location` / `category_tags` for vendors,
  just `category_tags` for customers. Reads `role` off the user (already set in step 2), not
  the request. Finalizes `onboarding_completed=True`; choosing `vendor` in step 2 means this
  also sets `vendor_status="pending_review"`.
- `GET`/`POST /api/v1/listings/` — a vendor's own listings. `GET` works for any vendor
  (including pending ones); `POST` (create) requires `vendor_status="approved"`
  (`apps.core.permissions.IsApprovedVendor`) — see the vendor approval flow below.
- `GET /api/v1/admin/vendors/pending/`, `POST /api/v1/admin/vendors/<id>/approve/` /
  `/reject/` — admin-only, review vendor signups.
- `GET /api/v1/admin/users/?search=<email>&role=<vendor|customer|admin>` — admin-only, finds a
  user by email, optionally filtered by role (the `role` filter is what the event vendor-picker
  uses to find vendors). `POST /api/v1/admin/users/<id>/set-role/` with
  `{"role": "customer"|"vendor"|"admin"}` — admin-only, flips a user's role. Setting `admin`
  force-sets `onboarding_completed=True` (see below); setting `vendor` starts
  `vendor_status="pending_review"` unless one was already set; setting `customer` clears
  `vendor_status`. Both back the "Manage Roles" admin tool.
- `GET`/`POST /api/v1/events/`, `GET`/`PATCH /api/v1/events/<id>/` — card shows/conventions.
  `GET` is public (no auth) — this is what `/events` and the homepage browse. `POST`/`PATCH`
  are admin-only, via the "Manage Events" tool: title, venue, city, description, start/end
  date, `estimated_cards`/`estimated_attendees` (manual admin estimates, not derived from
  anything), and `vendors` (a real M2M to vendor-role User accounts — `vendor_count` and
  `vendors_detail` on the response are derived from that list, not separately stored).
- `POST /api/v1/auth/google/`, `POST /api/v1/auth/microsoft/` — social login. The frontend
  exchanges an OAuth `code` from Google/Microsoft's consent screen for our own JWT pair
  (`backend/apps/users/views.py::GoogleLoginView` / `MicrosoftLoginView`).

**Roles:** the custom `User` model (`backend/apps/users/models.py`) uses email as its
`USERNAME_FIELD` (no username) and has a `role` field with three choices — `vendor`,
`customer`, `admin` — defaulting to `customer`. `backend/apps/core/permissions.py` defines a
`HasRole` base permission plus concrete `IsVendor` / `IsCustomer` / `IsAdminRole` classes for
gating DRF views by role, and `IsApprovedVendor` (subclasses `IsVendor`) which additionally
requires `vendor_status="approved"` — this is what gates listing creation.

**Vendor approval flow:** choosing "vendor" during onboarding (or being flipped to vendor via
"Manage Roles") sets `vendor_status` to `pending_review`. A vendor in that state can log in and
see their own (empty) listings page, but `POST /api/v1/listings/` returns 403 until an admin
approves them via the "Vendor Approvals" tool. Superusers (`create_admin`/`createsuperuser`)
and users promoted to admin via "Manage Roles" always get `onboarding_completed=True`
automatically, since neither is meant to go through the vendor/customer onboarding UI (which
has no "admin" choice).

**Admin dashboard:** `/dashboard/admin` is a hub linking to one page per tool — "Vendor
Approvals" (`/dashboard/admin/vendor-approvals`), "Manage Roles"
(`/dashboard/admin/manage-roles`), and "Manage Events" (`/dashboard/admin/events`) today. Adding
a new admin capability means adding a new page here and a tile on the hub, not growing a single
monolithic dashboard.

## 6. Current Limitations / Not Yet Built

- **No data model for bookings yet.** `apps.listings` (a vendor's own inventory items) and
  `apps.events` (card shows/conventions — publicly browsable, admin-managed) both exist now,
  but there's still no way for a vendor to book a booth at a specific event — the two aren't
  connected to each other yet.
- **Role is chosen once, at onboarding, with no way to change it afterwards.** A user picks
  vendor or customer on `/onboarding` right after registering; there's no flow for a customer to
  become a vendor later, or for an admin to change someone's role after the fact (only possible
  today via the Django admin).
- **Vendor `category_tags`/`business_name` etc. aren't editable after onboarding.** There's no
  "edit profile" page yet — those fields are set once by `OnboardingSerializer` and then only
  changeable via the Django admin.
- **JWTs are stored in `localStorage`, not httpOnly cookies.** `frontend/lib/auth.ts` has a
  `// TODO` explaining the upgrade path — httpOnly cookies would need a Next.js API
  route/server action to proxy the Django calls, which was judged a bigger lift than this pass
  warranted. `/dashboard/*` pages have a guard (`frontend/app/dashboard/layout.tsx`) that
  redirects to `/login` if there's no session on load — it's intentionally simple, not
  bulletproof (e.g. it doesn't re-check on token expiry mid-session).
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
