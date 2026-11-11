# QA Test Plan

Use this checklist before a release. Run it against a staging deployment with synthetic accounts and data; never use real member or payment records in test fixtures.

## Automated checks

- `npm test -- --watchAll=false` — frontend test suite
- `node --test server/*.test.js` — backend test files
- `npm run build` — production configuration checks and frontend build

## Manual smoke checks

1. Load the public home page and several configured public routes on desktop and mobile widths.
2. Sign in with an authorized test administrator and confirm role-based access controls.
3. Create and edit a test event, booking, announcement, and CMS item; verify changes persist after refresh.
4. Review branding, navigation, contact details, and links for the configured organization.
5. Test a display board, including per-slide duration and enabled/disabled states.
6. Verify donation and email integrations in their provider test modes; do not make real charges or send messages to real recipients.
7. Check server logs for errors and confirm no tokens, passwords, or personal data are logged.

Record the build identifier, test account role (not its credentials), result, and any issue reference. Remove temporary test data after the run.