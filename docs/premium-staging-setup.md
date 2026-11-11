# Premium payments on staging

The payment flow is deliberately disabled by default. Do not enable it until the Premium AI allowance, cancellation handling, refund handling, and Paystack test-mode flow have been completed and reviewed.

## Render staging environment

Add these variables to the `unilib_staging` service. Never put the Paystack secret key in the frontend, repository, or chat.

- `PAYMENTS_ENABLED=false`
- `PAYSTACK_PLAN_CODE=PLN_wplj6c6uf0d27wk`
- `PAYSTACK_SECRET_KEY=<Paystack test secret key>`
- `PAYSTACK_CALLBACK_URL=https://testyourself-git-staging-omisope-samuel-femis-projects.vercel.app/premium`

Configure this webhook URL in the Paystack **test-mode** dashboard:

`https://unilib-staging.onrender.com/billing/paystack/webhook`

Subscribe to `charge.success`. The server checks the webhook HMAC signature, then independently verifies each transaction with Paystack before granting a month of Premium. It checks plan code, NGN currency, the exact ₦2,000 amount, user identity, and a unique transaction reference.

## Important before accepting real subscriptions

- Use a separate live plan code and live secret key in production. Do not reuse staging values.
- The frontend checkout remains unavailable unless `PAYMENTS_ENABLED=true` and the required server variables are set.
- Do not set `PAYMENTS_ENABLED=true` yet. Cancellation, refund/chargeback handling, and the paid AI usage limits are not implemented in this first slice.
- After those pieces are ready, test in Paystack test mode and verify renewal, duplicate webhooks, failed renewal, cancellation, and refund behavior before enabling live payments.
