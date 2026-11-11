# Gurdwara Community Platform

A configurable, self-hosted web platform for Gurdwaras and Sikh community organizations. It brings public-facing services and staff tools into one application: events and bookings, seva and Langar, Hukamnama and Gurbani, donation campaigns, community announcements, newsletters, streaming, LED display playlists, and a visitor Welcome Journey.

The project is intended as a reusable starting point—not a hosted multi-tenant SaaS. Each organization operates its own deployment and database, configures its own branding and integrations, and remains responsible for its own data and secrets.

## Why this project exists

Gurdwara information and services are often spread across separate forms, calendars, social pages, and spreadsheets. This platform offers one place for the sangat to find reliable information and participate, while giving administrators tools to manage content and displays. The modular design is intended to help another Gurdwara adapt the project without inheriting another organization's domain, account credentials, logo, or location details.

## Screenshots

Screenshots are intentionally omitted for now: the historical captures contain a real tenant's branding and were moved to restricted local storage. Tenant-specific runbooks, decks, UAT materials, and production variables are also kept outside this repository; only reusable guides belong here. Add fresh screenshots after using demo branding and removing personal or member data. Suggested captures:

- Public home page with demo organization name and logo
- Admin widget/page-layout editor
- Welcome Journey admin settings and public preview
- LED board slideshow settings with per-slide durations

## Features

- Organization branding, logo, colors, fonts, and contact details
- Public pages and CMS-managed pages with configurable content widgets
- Events, registrations, bookings, seva opportunities, and Langar needs
- Daily Hukamnama, Gurbani reader/search, Sikh learning resources, and recitations
- Donation campaigns, Stripe checkout, QR flows, and receipts
- Community notices, newsletter management, and optional notification integrations
- LED display playlists, per-slide timing, and screen-specific configuration
- Welcome Journey page and lobby display with optional, consent-based follow-up
- PostgreSQL or MySQL persistence, file uploads, audit trails, and admin permissions

## Requirements

- Node.js 20.x (see the `engines` field in `package.json`)
- npm
- A PostgreSQL or MySQL database for persistent, multi-user operation
- Optional credentials for the services you enable (Google OAuth, Stripe, SMTP, Meta, AI, and others)

## Quick start

1. Clone the repository and install dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and set your organization identity, contact details, public URL, OAuth configuration, and database connection.
3. For a first administrator, set `BOOTSTRAP_ADMIN_EMAIL` to the Google account that should receive the initial Super Admin role. Remove the bootstrap setting after the account has been created and verified.
4. Configure a PostgreSQL or MySQL database. Keep passwords and API secrets server-side; never put them in `REACT_APP_*` variables or commit them.
5. Set your frontend build-time values in `.env.production` or `production-frontend.config`. The production build intentionally rejects missing configuration and unsafe values.
6. Start development with `npm start`. The React development server runs on port 3001 and proxies API requests to the Node API on port 4242.
7. Visit `/` for the public site and `/login` for administrator sign-in. Complete branding and content setup in the admin area before inviting your community.

The application needs a reachable database for saved content, accounts, and settings. Without one, some pages may show safe defaults, but changes will not persist.

## Configure a new Gurdwara

1. **Identity and branding:** set the organization name and public URL, then upload the organization's logo and configure its colors, address, phone, and email in the branding admin page.
2. **Access:** configure Google OAuth redirect URLs for your domain and create the initial Super Admin using `BOOTSTRAP_ADMIN_EMAIL`. Verify sign-in and remove the bootstrap variable.
3. **Database and uploads:** create a dedicated database and persistent upload directory. Back up both before upgrades.
4. **Content:** replace demo CMS pages, events, schedules, Langar entries, member records, and any example media with content owned by your organization.
5. **Integrations:** configure only the integrations you plan to use. For example, Stripe webhooks require the matching server-side secret and public HTTPS endpoint; email requires an SMTP provider.
6. **LED screens:** create screen names/playlists, review each slide's duration, and test the board route on the target display device.
7. **Privacy and operations:** review roles, consent text, retention, privacy notices, exports, backups, and access to member/donation data before going live.

## Configuration

Public build-time organization variables are listed in `.env.example` and `production-frontend.config`, including:

- `REACT_APP_ORGANIZATION_NAME` and `REACT_APP_ORGANIZATION_SHORT_NAME`
- `REACT_APP_PUBLIC_SITE_URL` and `REACT_APP_SITE_DESCRIPTION`
- `REACT_APP_CONTACT_PHONE`, `REACT_APP_CONTACT_EMAIL`, and `REACT_APP_CONTACT_ADDRESS`
- `REACT_APP_YOUTUBE_URL`, `REACT_APP_FACEBOOK_URL`, and `REACT_APP_INSTAGRAM_URL`
- `REACT_APP_GOOGLE_OAUTH_URL` and `REACT_APP_ADMIN_EMAILS`

Server-side equivalents include `ORGANIZATION_NAME`, `ORGANIZATION_SHORT_NAME`, `ORGANIZATION_ADDRESS`, `ORGANIZATION_PHONE`, `ORGANIZATION_EMAIL`, `PUBLIC_SITE_URL`, and `ORGANIZATION_LOGO_PATH`. Keep database credentials, SMTP passwords, OAuth client secrets, payment secrets, webhook secrets, and API keys in the hosting provider's secret store or an ignored local environment file.

Feature-specific guides live under [docs](docs/). Start with [the production environment runbook](docs/BACKEND_PRODUCTION_ENV_RUNBOOK.md), [the multi-tenant architecture proposal](docs/MULTI_TENANT_ARCHITECTURE.md), and the relevant payment or notification setup guide before enabling those services.

## Useful commands

- `npm start` — local frontend and API development
- `npm test -- --watchAll=false` — run the React test suite once
- `npm run build` — validate and build the production frontend
- `node --test server/*.test.js` — run Node.js server test files

## Branding and production setup

The repository includes **public sample configuration only**, not a production-ready OAuth client, domain, administrator, or secret. Before deployment, configure the exact public URL in your hosting system and OAuth provider, set `REACT_APP_GOOGLE_OAUTH_URL`, `BOOTSTRAP_ADMIN_EMAIL`, `REACT_APP_ADMIN_EMAILS`, and the organization/contact variables in that environment, then build. The tracked `.env.production` and `production-frontend.config` are safe templates with blank deployment-specific values. Never deploy from the untouched templates, and never commit real environment files, admin email lists, member exports, or credentials.

The first-run bootstrap email can create an initial local Super Admin seed when local file storage is selected; for a production database, provision the first administrator through your secure deployment process before removing the bootstrap email. Verify the account on the deployed host, then unset `BOOTSTRAP_ADMIN_EMAIL` and restart. Do not assume the bootstrap mechanism securely provisions a managed production database.

## Deployment and data safety

This application is self-hosted. Configure TLS, same-origin `/api` routing, a persistent database, and persistent upload storage before production use. Keep `server/data`, database backups, and uploads out of disposable build artifacts. Review [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) and the detailed runbooks in [docs](docs/).

The current architecture uses one organization's configuration per deployment. The multi-tenant document is a proposal, not an implemented cross-tenant isolation guarantee. Do not place multiple Gurdwaras' private member, donation, or integration data in a shared deployment until tenant-scoped authentication, storage, permissions, and isolation tests are implemented.

## License and contributions

Check the repository's license and third-party asset notices before redistributing this project or its bundled media. Before contributing, run the focused tests for the area you changed, then the production build. Never commit production credentials, member exports, payment data, uploads, or browser/session storage.
