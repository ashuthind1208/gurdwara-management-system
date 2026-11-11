# Social Posting Setup

Connect social publishing only with accounts owned or authorized by the deploying Gurdwara. Provider APIs, permissions, and review requirements change over time; confirm current requirements with the provider before setup.

1. Create or select an organization-owned developer application and social page/account.
2. Request only the permissions needed for publishing and account status checks; complete provider review when required.
3. Configure client IDs as public settings only when the provider requires them in the browser. Store access tokens and client secrets in the server-side secret store.
4. Configure callback URLs for the exact deployment origin and require HTTPS in production.
5. Connect the account in the admin interface, confirm its status, and publish a test post approved by the organization.
6. Document token ownership, renewal/rotation, rate limits, and who may publish. Remove access when staff or volunteers leave.

Never commit tokens, include them in screenshots, or log full authorization headers.