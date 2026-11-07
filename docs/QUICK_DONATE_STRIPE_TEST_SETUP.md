# Quick Donate: Stripe Wallet Test Setup

Quick Donate uses Stripe's Express Checkout Element for Apple Pay and Google Pay. The preset amount and Gurdwara branding are shown on the page; the wallet itself completes the payment. The page does not ask for donor details. Apple Pay or Google Pay may pass billing information to Stripe as part of wallet authorization.

## Guest donation flow

- Scan the campaign QR to open `/quick-donate?campaign=<id>`, select a CAD preset or a custom amount from CAD $1 to $10,000 (up to two decimal places), and tap the eligible Apple Pay or Google Pay button. There is no Continue button, Zeffy redirect, Gurdwara account, or Stripe donor account required.
- The Gurdwara still needs its merchant Stripe account and matching keys. The donor needs a supported browser/device with a configured wallet.
- Amount selection is locked while the wallet is open. The client does not request optional name, email, phone, shipping, or billing-address fields.
- `/quick-donate/success` is a standalone public route. It calls `/api/stripe/quick-donate-status` using the payment's client secret; the server retrieves the intent from Stripe and verifies the secret with a timing-safe comparison, Quick Donate metadata, sandbox mode, and CAD currency. Only a Stripe-verified `succeeded` intent is stored as paid, with the same stable record ID used by the webhook and reconciliation.
- Guest confirmation never calls the legacy browser-side donation/receipt creation flow or requires a donor login. Processing/error states do not claim payment success or prompt another payment.
- The payment-scoped confirmation secret is retained in browser session storage for this tab, not in an account or donor profile. This allows refresh recovery after removing the secret from the visible URL. If storage is blocked, the original Stripe return URL is retained. An interrupted authorization is checked before starting another donation in that tab. Redact payment client secrets from proxy/access logs and analytics; they are payment-scoped credentials, not merchant keys.
- A processing payment is rechecked every five seconds for up to twelve successful checks; the donor can also choose **Check payment status** after a transient error. A network-interrupted authorization locks fresh wallet submissions instead of encouraging another charge.

## Stripe test environment

A separate Stripe account is not required. Use a Stripe sandbox/test environment; test-mode payments do not charge a real card. The backend deliberately enables Quick Donate only when both `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` are test keys.

1. In Stripe Dashboard, switch to a sandbox or test mode and open **Developers → API keys**.
2. Configure `STRIPE_SECRET_KEY` privately in server environment settings (or the ignored local environment file for development). Never put it in React code, `REACT_APP_*`, Git, or chat.
3. Configure the matching sandbox's public key as `STRIPE_PUBLISHABLE_KEY`. The app returns this public key from `/api/stripe/quick-donate-config` only while both keys are in test mode. The campaign's hosted-checkout/Buy Button key is not used for Quick Donate.
4. Start the project with `npm start`. The API listens on port 4242 and the React app proxies `/api` requests to it.
5. For local confirmations, use Stripe CLI to forward webhook events to `http://localhost:4242/api/stripe/webhook`; configure `STRIPE_WEBHOOK_SECRET` privately with the generated signing secret. Restart the backend after changing environment values. The signed handler records `payment_intent.succeeded` events for Quick Donate, rejects live/non-CAD Quick Donate intents, and clears pending records. Existing hosted-checkout handling remains unchanged.

## Campaign QR and LED board

- In **Admin Donations → Quick Donate QR**, explicitly select an active, open Stripe campaign. Download its locally generated SVG QR, preview checkout, or open `/quick-donate-board?campaign=<id>` on the LED screen.
- The QR targets the current website origin. Generate printed QR codes on the intended HTTPS website, not localhost or a temporary development host.
- Missing, malformed, duplicate, inactive, closed or non-Stripe campaign selections fail closed; ambiguous campaign lists never silently choose another campaign. The server additionally rejects campaigns that have reached their goal.
- The LED board polls confirmed donations every five seconds and campaign/config settings every thirty seconds. Its CAD total includes only PAID Stripe records for the selected campaign, deduplicated by gateway transaction ID (or donation ID).
- Initial historical totals do not celebrate. New confirmed payments roll changed digits upward and briefly display a thank-you glow/sparkle. Duplicate records, pending/non-Stripe payments and other campaigns do not inflate the total. Reduced-motion preferences disable rolling and decorative effects.
- This release is test-only. The LED board prominently shows **Test mode · No real donations**. Do not treat sandbox ledger totals as real fundraising totals; isolate test campaigns/data operationally.

## Wallet visibility and testing

Stripe only renders wallet buttons supported by the current browser/device and wallet configuration. Test Apple Pay and Google Pay on supported devices with an active wallet card and serve the page over HTTPS. Register the HTTPS domain under Stripe's **Payment method domains** in the sandbox before testing. A local HTTPS tunnel can be used during development.

Automated tests mock Stripe; they do not prove domain registration, account/key pairing, wallet eligibility, or external payment completion. Verify those end to end in the sandbox before rollout. No live key enablement or production deployment is part of this release.

Official references: [Express Checkout Element with Payment Intents](https://docs.stripe.com/elements/express-checkout-element/accept-a-payment) and [register payment-method domains](https://docs.stripe.com/payments/payment-methods/pmd-registration).