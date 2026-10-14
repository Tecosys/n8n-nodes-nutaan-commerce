# Nutaan Commerce for n8n — Stage 1 preview

Not published or deployed. This package requires the matching integration API changes; the existing Commerce session API or voice API key is not a replacement.

## Available in this stage

- Store-scoped integration key credentials and a connection test.
- List stores, orders, COD verifications and returns; get a verification or action status.
- Request COD email or voice contact via existing Nutaan services.
- Poll latest COD verification updates. Polling emits current snapshots and may collapse intermediate changes between polls; it is not a complete event history or signed push webhook.
- One inactive COD workflow template, with customer contact disabled by default.

Abandoned-cart actions, WhatsApp actions, delivery assistance, return/exchange processing and signed push triggers are not implemented in this stage. Do not advertise them as available.

## Setup (staging first)

1. Deploy the reviewed backend patch to staging and enable `COMMERCE_N8N_ENABLED=true`. The flag defaults to disabled, and existing Commerce sessions/routes remain unchanged.
2. Sign in with an existing Commerce owner account. Issue an integration credential using `POST /api/commerce/integrations/v1/credentials`, authenticated with the existing Commerce session bearer token. Body: `{"name":"n8n","stores":["your-store"],"scopes":["cod:read","cod:contact","orders:read","returns:read"]}`. The returned key is shown only once. Never put a key, password or session token into a workflow export.
3. Configure n8n's Nutaan Commerce API credential with the integration key and API Base URL (default: `https://nutaan.com/api/commerce/integrations/v1`). For staging, supply its HTTPS URL ending in `/api/commerce/integrations/v1` and a separate staging key. Redirects are disabled. Voice platform keys and normal Commerce JWTs are rejected.
4. Install/build the package in an isolated n8n test instance, import `templates/cod-verification.json`, select credentials on every Nutaan node and replace the store slug on every node.
5. Test read operations and mocked customer-contact flows first. Enable **Authorize Customer Contact** only after the merchant explicitly authorizes the selected email/call workflow. Voice calls use credit and require the existing store voice binding/calling-hour rules. Email requires configured sending transport.
6. Activate only after the staging checklist passes. First production poll does not backfill historical records. A manual trigger test reads recent sample data; downstream actions remain real if authorized.

## Authentication and pagination

Requests use `X-Nutaan-Commerce-Key`. Each request rechecks current Commerce membership, revocation, enabled store and permission scopes. Key creation/revocation uses an owner Commerce session; credential tests/data requests use the integration key. Manage credentials with GET/POST/DELETE under `/credentials`.

Lists return `{data,nextCursor}`. Follow `nextCursor` until null; use an ISO `since` timestamp for changed records. Maximum page size is 100. The trigger processes up to 10 pages per poll and saves the remaining cursor for the next poll. The watermark advances only after the batch drains, using its original start time with a one-minute overlap. Failed requests preserve the checkpoint; manual samples do not change it. Changing store or API environment resets the checkpoint without historical backfill. Workflows must tolerate duplicate delivery. Read projections omit customer contact details and transport secrets by default.

## Retry semantics

COD contact requires `{channel,revision,confirmed:true}`. A persistent unique claim covers store, verification, revision and channel, including requests made with different integration keys. Repeated requests return the existing action. A transport timeout or uncertain persistence failure blocks automatic retries; inspect action and COD state. Do not bypass this by changing revisions or recreating verifications. Existing domain safeguards still control order eligibility, attempt limits, calling hours and email cooldowns. This does not guarantee exactly-once delivery by third-party providers. The integration rejects contact on a channel currently enabled in existing automatic COD policy; the owner must explicitly choose which automation manages that channel. It does not silently disable existing automation.

## Development

`npm ci`, `npm run build`, `npm test`. No runtime external dependencies, filesystem access or environment access are used by the n8n node. The backend uses its normal Mongoose/Express services. Public release still requires n8n package scanning, an actual n8n staging test, documentation/API review and provenance publication. Repository: `Tecosys/n8n-nodes-nutaan-commerce`; maintainer: `avishek@nutaan.com`.

## Public release prerequisites

Confirm repository access and configure a Trusted Publisher for the actual GitHub repository and publish.yml workflow. Protect the npm-release environment with a required reviewer. The included workflow is manual-only. Use Node.js 24 for development/release tooling; current dev dependencies include packages requiring Node 24. Replace preview monogram icons with approved final branding before public release.
