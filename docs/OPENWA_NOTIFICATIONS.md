# Optional WhatsApp Notifications

This application can integrate with an organization-managed WhatsApp notification service. Keep the service, account, recipients, and session data under the deploying Gurdwara's control. Confirm the provider's current terms and applicable consent requirements before enabling automated messages.

## Setup checklist

1. Install and secure the notification service separately from the public frontend.
2. Configure its API endpoint and credentials using server-side runtime secrets; do not expose them to the browser or commit them.
3. Connect an organization-authorized WhatsApp account and protect its session files as credentials.
4. Configure allowed recipients or groups and message types. Obtain consent and provide an opt-out path where applicable.
5. Send a test message to an approved test recipient, then verify delivery, failure handling, rate limits, and audit logs.
6. Restrict service access to the application host where possible, rotate credentials if exposed, and back up session data securely.

Do not use a personal session or send bulk messages until the organization has reviewed account ownership, consent, privacy, and provider policy.