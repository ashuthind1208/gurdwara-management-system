# Stripe wallet donation test setup

The quick-donation route uses Stripe Express Checkout for Apple Pay and Google Pay. It creates PaymentIntents in **Stripe test mode only**; it refuses wallet creation if either server key is missing or live-mode.

## Stripe account and keys

Use a Stripe sandbox/test environment in the merchant account. Configure matching `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` values privately in the server environment. Configure `STRIPE_WEBHOOK_SECRET` privately for the signed webhook. Never paste secret keys into chat, frontend source, or committed files. Restart the backend after changing environment variables. This document makes no assertion about credentials in any developer's local environment.

For local payment-completion reconciliation, forward Stripe test-mode webhook events to `/api/stripe/webhook` using Stripe CLI and store its generated signing secret in the ignored local environment file. Enable `payment_intent.succeeded`. Guest status verification and pending reconciliation can also repair missed webhook delivery using Stripe-verified successful intents and stable ledger IDs.

## Wallet availability

Wallet buttons are rendered by Stripe and appear only when the current browser/device supports the wallet and Stripe reports it as available. Apple Pay requires a supported Apple device/browser and a registered HTTPS domain in Stripe. Google Pay requires a supported browser/device with a wallet configured. Use an HTTPS development tunnel and register it in the sandbox when testing real wallet availability.

The page requests no donor details. Apple Pay, Google Pay, or Stripe may provide payment-required billing details to the payment processor; the Gurdwara page does not add donor-detail fields. Confirmation is a public, payment-scoped flow; a Gurdwara website login is not required.

## Go-live boundary

This route intentionally rejects live Stripe keys. Moving to live mode requires separate review and explicit changes to the server's test-mode guards, production key configuration, registered domain settings, sandbox data isolation, and end-to-end readiness checks. No live charges are initiated by this implementation.

See [Quick Donate setup](QUICK_DONATE_STRIPE_TEST_SETUP.md) for campaign QR, LED rolling counter, guest confirmation/recovery, and operational test steps.