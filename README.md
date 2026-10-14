# Nutaan Commerce for n8n

Preview community node package. Author: Tecosys, avishek@nutaan.com. Repository: Tecosys/n8n-nodes-nutaan-commerce.

## Supported workflows

- Abandoned cart recovery: accept verified store events, wait until the contact window, re-read the current record and request email, WhatsApp or voice outreach. Recovered/cancelled carts are suppressed.
- COD verification: existing Nutaan COD email and voice operations; WhatsApp outreach uses a merchant-hosted verification link. Record Verified Outcome applies an upstream-verified customer response through existing Nutaan COD revision and order checks.
- Pre/post delivery assistance: verified ready/shipped/delivered events drive email, WhatsApp or voice assistance. Delivery status must come from the merchant/carrier; the node never infers it from order fulfillment alone.
- Returns/exchanges: check eligibility, create refund/exchange requests, approve/decline, mark transit/receipt/cancellation, get a financial quote, process an explicitly approved fresh quote or reconcile uncertain state. Existing return services keep their rules, stock checks and email/WhatsApp notifications. Dedicated voice assistance is available using a return automation record.

These workflows require the matching backend integration deployment and merchant configuration. The package is not published or verified for n8n Cloud yet. Live provider/n8n staging validation is pending.

## Setup

1. Deploy the integration branch to staging and enable COMMERCE_N8N_ENABLED=true there. It defaults to disabled. No new scheduler is installed.
2. An existing Commerce owner issues a store-scoped key using POST /api/commerce/integrations/v1/credentials with their Commerce session bearer token. Example body: {"name":"n8n","stores":["your-store"],"scopes":["orders:read","cod:read","cod:contact","cod:write","returns:read","returns:write","automation:read","automation:write","automation:contact"]}. Grant only the scopes needed by each workflow. The key is displayed once. Never export session tokens or integration keys in workflow JSON.
3. Configure Nutaan Commerce API credentials with the key and API Base URL. Default: https://nutaan.com/api/commerce/integrations/v1. Staging must use its own trusted HTTPS URL ending in /api/commerce/integrations/v1 and separate key. Redirects are disabled.
4. Import a template and configure the credential on every Nutaan node and the store slug. Configure Header Auth on the webhook with a separate inbound secret. Store/provider signature verification must happen before forwarding normalized events; these templates are for a trusted merchant adapter, not an unauthenticated public shopper endpoint.
5. Configure shop email transport, WhatsApp business binding/approved templates and dedicated voice agents as needed. Contact is disabled by default. Authorize Changes and Authorize Customer Contact are explicit workflow settings.
6. Run staging checks using test recipients and mocked/sandbox providers before activating production workflows. A manual sample does not alter production polling state but authorized downstream actions can still contact customers.

## Store event contract

Automation / Upsert Store Event accepts this normalized object:

```json
{
  "kind": "cart",
  "externalId": "checkout-123",
  "sourceVersion": 1,
  "occurredAt": "2026-10-14T10:00:00Z",
  "status": "waiting",
  "contactAfter": "2026-10-14T14:00:00Z",
  "expiresAt": "2026-10-16T10:00:00Z",
  "name": "Customer",
  "email": "customer@example.com",
  "phone": "+919876543210",
  "emailConsent": true,
  "voiceConsent": false,
  "whatsappConsent": true,
  "consentReference": "store-consent-record-123",
  "reference": "Checkout 123",
  "link": "https://your-store.example/checkout/123"
}
```

The merchant adapter verifies the source, destinations and consent evidence. sourceVersion is a strictly increasing integer per store + kind + externalId. Repeating identical events is safe; conflicting/stale versions are rejected. Use the same externalId for subsequent recovery, cancellation, delivery or consent updates. Set channel consent false on withdrawal. Events expire within seven days; no historical marketing backfill. Customer destinations/links are stored only in the isolated integration collection and omitted from read/event responses.

Kinds/statuses:

| Kind | Accepted statuses |
| --- | --- |
| cart | waiting, recovered, cancelled |
| cod | pending, confirmed, cancelled |
| pre_delivery | ready, shipped, cancelled |
| post_delivery | delivered, cancelled |
| return | requested, approved, in_transit, received, completed, declined, cancelled |

For COD WhatsApp, externalId must be the actual Nutaan verification ID, and the saved phone must match a current pending verification. The merchant-hosted link must validate the customer before its response is sent to Record Verified Outcome. Delivery receipts alone are never a COD confirmation. COD email/voice use the dedicated COD resource, not generic automation contact.

## Channels and existing automation

Email and WhatsApp use existing Nutaan transports. Cart email contact is blocked while existing bagReminder automation owns the channel; choose workflow ownership explicitly without this integration changing current settings. Return email/WhatsApp notifications stay with existing return operations and policies; generic return contact supports voice only to avoid duplicate notifications.

WhatsApp uses n8n_cart, n8n_cod, n8n_pre_delivery and n8n_post_delivery template kinds outside the customer-service window. Each approved template has parameters in order: customer name, order/checkout reference, customer link. No force flag bypasses WhatsApp rules.

New voice assistance reads COMMERCE_N8N_VOICE_BINDINGS, configured by the backend operator, for example:

```json
{"your-store": {"cart": {"userId":"VOICE_ACCOUNT_ID","agentId":"DEDICATED_CART_AGENT_ID","startHour":9,"endHour":20}}}
```

Provision separate entries for pre_delivery, post_delivery and return if needed. Agents must belong to the specified voice account; calling hours use the store timezone. Agent prompts should use commerce_use_case, store_name, reference, assistance_message and customer_link metadata. Provision prompts without changing the existing COD agent. Transport acceptance does not mean delivered email, answered call, verified order or recovered sale.

## Returns and exchanges

Return Data for eligibility: orderNumber and email. Create additionally needs kind (refund/exchange), lines and stable requestId (20–80 letters, digits or hyphens). Lines use the IDs returned by eligibility, quantity, supported reason and exchangeVariantId for exchanges. Existing backend policies govern eligibility and any configured auto-approval.

Manage Return accepts reference (RMA-...), operation (approve, decline, status, quote, process, sync), optional note, status or token. Decline requires a note. Financial processing requires the current quote token and explicit workflow authorization after merchant approval. Never automatically run process merely because a request exists. Uncertain outcomes require sync/status inspection, not replaying a refund.

## Polling and retries

Choose COD Verification or Store Automations on the trigger. First activation starts at activation without historical backfill. A manual sample reads recent records. Polling emits latest snapshots and can collapse intermediate changes; it is not immutable event history. Lists return data and nextCursor, with up to 100 rows per page.

The trigger drains up to 10 pages per poll and saves the remaining cursor. The watermark advances only after the batch drains, using its original start time with one-minute overlap. Failed chunks preserve the checkpoint. Changing store, API environment or event source resets it. Delivery is at least once; consumers must tolerate duplicates.

Generic outreach has one durable claim per subject/use case/channel, retained across newer event versions and different keys. Uncertain outcomes block automatic resends. COD contact retains its current revision-based claims and existing attempt/hour/order safeguards. A succeeded action means dispatch accepted. Read action status before retrying.

## Development and release

Use Node.js 24 for tooling: npm ci, npm run lint, npm run build, npm test. Runtime has no external dependencies. Publish only after real staging verification, package scanning and review. Configure npm Trusted Publisher for this repository and publish.yml; protect npm-release with a reviewer. Publishing workflow is manual-only. Verified n8n Cloud availability requires n8n review.
