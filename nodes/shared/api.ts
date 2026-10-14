import { NodeOperationError } from 'n8n-workflow';
import type { INode } from 'n8n-workflow';

export const DEFAULT_BASE_URL = 'https://nutaan.com/api/commerce/integrations/v1';
/** Never accept credentials in a URL or silently follow a redirect with the API key. */
export function apiBaseUrl(value: unknown, node?: INode): string {
  try {
    const url = new URL(typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_BASE_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        url.pathname.replace(/\/+$/, '') !== '/api/commerce/integrations/v1') throw new Error();
    return `${url.origin}/api/commerce/integrations/v1`;
  } catch {
    const message = 'API Base URL must be an HTTPS URL ending in /api/commerce/integrations/v1, without credentials, query parameters or fragments.';
    throw new NodeOperationError(node ?? { id: 'nutaanCommerceApi', name: 'Nutaan Commerce API', type: 'nutaanCommerceApi', typeVersion: 1, position: [0, 0], parameters: {} }, message);

  }
}
