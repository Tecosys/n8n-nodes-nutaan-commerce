import type { ICredentialType, INodeProperties, IAuthenticate, ICredentialTestRequest, Icon } from 'n8n-workflow';

import { NodeOperationError } from 'n8n-workflow';
import { apiBaseUrl } from '../nodes/shared/api';

export class NutaanCommerceApi implements ICredentialType {
  name = 'nutaanCommerceApi';
  icon: Icon = { light: 'file:nutaan.svg', dark: 'file:nutaan.dark.svg' };
  documentationUrl = 'https://nutaan.com/nutaan-commerce';
  displayName = 'Nutaan Commerce API';
  properties: INodeProperties[] = [{
    displayName: 'API Base URL', name: 'baseUrl', type: 'string',
    default: 'https://nutaan.com/api/commerce/integrations/v1',
    description: 'The trusted Nutaan production or staging API. Use a separate key per environment. HTTPS is required.',
  }, {
    displayName: 'Integration Key', name: 'apiKey', type: 'string', typeOptions: { password: true },
    default: '', required: true, description: 'A revocable, store-scoped Commerce integration key. Voice API keys and Commerce session tokens are not accepted.',
  }];
  authenticate: IAuthenticate = async (credentials, requestOptions) => {
    const baseUrl = apiBaseUrl(credentials.baseUrl);
    const target = new URL(requestOptions.url && /^https?:/.test(requestOptions.url)
      ? requestOptions.url : `${baseUrl}/${(requestOptions.url || '').replace(/^[/]+/, '')}`);
    const base = new URL(baseUrl);
    if (target.origin !== base.origin || target.username || target.password ||
        !(target.pathname === base.pathname || target.pathname.startsWith(`${base.pathname}/`))) {
      throw new NodeOperationError({ id: 'nutaanCommerceApi', name: 'Nutaan Commerce API', type: 'nutaanCommerceApi', typeVersion: 1, position: [0, 0], parameters: {} }, 'Request must use the configured Nutaan API.');
    }
    return { ...requestOptions, url: target.toString(), disableFollowRedirect: true,
      headers: { ...requestOptions.headers, 'X-Nutaan-Commerce-Key': String(credentials.apiKey || '') } };
  };
  test: ICredentialTestRequest = { request: { baseURL: '={{($credentials.baseUrl || "https://nutaan.com/api/commerce/integrations/v1").replace(/[/]+$/, "")}}', url: '/me', disableFollowRedirect: true } };
}
