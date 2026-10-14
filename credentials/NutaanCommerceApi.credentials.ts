import type { ICredentialType, INodeProperties, IAuthenticateGeneric, ICredentialTestRequest, Icon } from 'n8n-workflow';

export class NutaanCommerceApi implements ICredentialType {
  name = 'nutaanCommerceApi';
  icon: Icon = { light: 'file:nutaan.svg', dark: 'file:nutaan.dark.svg' };
  documentationUrl = 'https://nutaan.com/nutaan-commerce';
  displayName = 'Nutaan Commerce API';
  properties: INodeProperties[] = [{
    displayName: 'Integration Key', name: 'apiKey', type: 'string', typeOptions: { password: true },
    default: '', required: true, description: 'A revocable, store-scoped Commerce integration key. Voice API keys and Commerce session tokens are not accepted.',
  }];
  authenticate: IAuthenticateGeneric = { type: 'generic', properties: { headers: { 'X-Nutaan-Commerce-Key': '={{$credentials.apiKey}}' } } };
  test: ICredentialTestRequest = { request: { baseURL: 'https://nutaan.com/api/commerce/integrations/v1', url: '/me' } };
}
