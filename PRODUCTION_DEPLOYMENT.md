# Production Deployment

This application is self-hosted. Configure one Gurdwara per deployment; multi-tenant isolation is not implemented.

## Before deployment

- Use Node.js 20.x and install the locked dependencies with `npm ci`.
- Configure the production public frontend values in `.env.production` or `production-frontend.config`. Only public `REACT_APP_*` values belong there; the build rejects secret-like values.
- Configure server-side database, OAuth verification, payment, email, and integration credentials in the hosting provider's secret store or an ignored runtime environment file. Never commit secrets.
- Create a dedicated database and persistent storage for uploads and application data. Configure backups and a restore procedure.
- Set the public site URL, TLS certificate, and same-origin `/api` routing for the deployment.

## Build and start

1. Run `npm ci`.
2. Run `npm run build` and review any warnings.
3. Start the backend with `npm run start:production` under the hosting platform's process manager.
4. Configure the web server or platform proxy to serve the frontend build and forward `/api` requests to the backend.
5. Verify the public site, `/api/health`, administrator sign-in, database persistence, uploads, and any enabled integrations.

## Operations

- Keep the database and upload storage persistent across deploys; do not overwrite them with build artifacts.
- Back up before schema changes and releases. Test restoration periodically.
- Deploy changes in a staging environment first when available.
- Roll back by restoring the prior application build and compatible database backup; do not overwrite current user data with repository fixtures.
- Rotate credentials through the secret manager, then restart or redeploy the service as required.

For environment setup, see [the backend environment runbook](docs/BACKEND_PRODUCTION_ENV_RUNBOOK.md).