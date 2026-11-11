# Donation SMS Setup

Use this guide to configure an organization-owned SMS provider for donation-related messages. The exact options depend on the enabled integration and are listed in `.env.example` and the relevant server module.

1. Register the sending number and complete any provider or carrier verification required for your region.
2. Configure provider credentials through the hosting secret store or an ignored runtime environment file. Do not use frontend `REACT_APP_*` variables for secrets.
3. Set the sender identity and callback/webhook URL for this deployment. Validate webhook signatures where supported.
4. Review message wording, recipient consent, unsubscribe/opt-out handling, and applicable local messaging rules before enabling sends.
5. Test using provider test mode or an explicitly approved test number. Verify delivery, failure handling, and logs without exposing phone numbers or credentials.

Do not enable production sends until the organization has confirmed its provider account, consent language, sender registration, and privacy/retention policy.