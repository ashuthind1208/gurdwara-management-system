# Backend Production Environment Runbook

Keep server configuration separate from the React build. Use the hosting provider's secret manager when available; otherwise use a protected runtime environment file outside the repository. Do not copy production secrets into `.env.production`, `production-frontend.config`, or any `REACT_APP_*` variable.

## Setup checklist

1. Review `.env.example` and configure only the features this deployment will use.
2. Set `NODE_ENV=production` and the selected database engine and connection values.
3. Set the public site URL and deployment-specific organization defaults.
4. Store database passwords, OAuth client secrets, payment keys, webhook tokens, SMTP credentials, and API keys in the runtime secret store.
5. Set restrictive access permissions on any local environment file and ensure it is excluded from version control and deployment artifacts.
6. Restart the backend after changing runtime values. Rebuild the frontend only when changing public `REACT_APP_*` build-time values.
7. Verify `/api/health`, database connectivity, authentication, and each enabled integration without logging secret values.

## Secret handling

- Use separate credentials for development, staging, and production.
- Grant each credential only the permissions it needs and rotate it if exposed.
- Never paste secrets into tickets, screenshots, logs, or source control.
- Redact credentials before sharing diagnostic output.

See [production deployment](../PRODUCTION_DEPLOYMENT.md) for the release checklist.