import { NodeOperationError, NodeConnectionTypes } from 'n8n-workflow';
import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription, IHttpRequestOptions, IDataObject } from 'n8n-workflow';

export class NutaanCommerce implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Nutaan Commerce', name: 'nutaanCommerce', group: ['transform'], version: 1,
    description: 'Read store resources and request COD verification through Nutaan Commerce',
    defaults: { name: 'Nutaan Commerce' }, icon: { light: 'file:nutaan.svg', dark: 'file:nutaan.dark.svg' }, subtitle: '={{$parameter.operation}}', usableAsTool: true, inputs: [NodeConnectionTypes.Main], outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: 'nutaanCommerceApi', required: true }],
    properties: [
      { displayName: 'Resource', name: 'resource', type: 'options', noDataExpression: true, default: 'store', options: [{ name: 'COD Verification', value: 'cod' }, { name: 'Order', value: 'order' }, { name: 'Return', value: 'return' }, { name: 'Store', value: 'store' }] },
      { displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true, default: 'listStores', displayOptions: { show: { resource: ['store'] } }, options: [{ name: 'List Stores', value: 'listStores', action: 'List permitted stores' }] },
      { displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true, default: 'listOrders', displayOptions: { show: { resource: ['order'] } }, options: [{ name: 'List Orders', value: 'listOrders', action: 'List orders' }] },
      { displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true, default: 'listReturns', displayOptions: { show: { resource: ['return'] } }, options: [{ name: 'List Returns', value: 'listReturns', action: 'List returns' }] },
      { displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true, default: 'listCod', displayOptions: { show: { resource: ['cod'] } }, options: [
        { name: 'Contact COD Customer', value: 'contactCod', action: 'Contact a COD customer' },
        { name: 'Get COD Verification', value: 'getCod', action: 'Get a COD verification' },
        { name: 'Get Contact Action', value: 'getAction', action: 'Get a contact action status' },
        { name: 'List COD Verifications', value: 'listCod', action: 'List COD verifications' },
      ] },
      { displayName: 'Store Slug', name: 'store', type: 'string', default: '', required: true, displayOptions: { hide: { operation: ['listStores'] } } },
      { displayName: 'Verification ID', name: 'verificationId', type: 'string', default: '', required: true, displayOptions: { show: { operation: ['getCod', 'contactCod'] } } },
      { displayName: 'Action ID', name: 'actionId', type: 'string', default: '', required: true, displayOptions: { show: { operation: ['getAction'] } } },
      { displayName: 'Channel', name: 'channel', type: 'options', default: 'email', options: [{ name: 'Email', value: 'email' }, { name: 'Voice Call', value: 'voice' }], displayOptions: { show: { operation: ['contactCod'] } } },
      { displayName: 'Current Revision', name: 'revision', type: 'number', default: 0, typeOptions: { minValue: 0 }, required: true, description: 'Read the current verification first. A stale revision is rejected.', displayOptions: { show: { operation: ['contactCod'] } } },
      { displayName: 'Authorize Customer Contact', name: 'confirmed', type: 'boolean', default: false, description: 'Whether this workflow is authorized to send verification email or place a real, billed voice call', displayOptions: { show: { operation: ['contactCod'] } } },
      { displayName: 'Limit', name: 'limit', type: 'number', default: 50, description: 'Max number of results to return', typeOptions: { minValue: 1, maxValue: 100 }, displayOptions: { show: { operation: ['listOrders', 'listCod', 'listReturns'] } } },
      { displayName: 'Cursor', name: 'cursor', type: 'string', default: '', description: 'The nextCursor returned by the previous list request', displayOptions: { show: { operation: ['listOrders', 'listCod', 'listReturns'] } } },
      { displayName: 'Updated Since', name: 'since', type: 'string', default: '', description: 'Optional ISO timestamp', displayOptions: { show: { operation: ['listOrders', 'listCod', 'listReturns'] } } },
    ],
  };
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const output: INodeExecutionData[] = [];
    for (let i = 0; i < this.getInputData().length; i++) {
      try {
        const op = this.getNodeParameter('operation', i) as string;
        let path = '/stores';
        const options: IHttpRequestOptions = { url: '', method: 'GET', json: true, timeout: 30000 };
        if (op !== 'listStores') {
          const store = this.getNodeParameter('store', i) as string;
          if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(store)) throw new NodeOperationError(this.getNode(), 'Enter a valid store slug.', { itemIndex: i });
          const base = `/stores/${encodeURIComponent(store)}`;
          if (['listOrders', 'listCod', 'listReturns'].includes(op)) {
            path = `${base}/${op === 'listOrders' ? 'orders' : op === 'listCod' ? 'cod' : 'returns'}`;
            options.qs = { limit: this.getNodeParameter('limit', i) as number, cursor: this.getNodeParameter('cursor', i) as string, since: this.getNodeParameter('since', i) as string };
            if (!options.qs.since) delete options.qs.since;
          } else if (op === 'getAction') path = `${base}/actions/${encodeURIComponent(this.getNodeParameter('actionId', i) as string)}`;
          else if (op === 'getCod' || op === 'contactCod') {
            path = `${base}/cod/${encodeURIComponent(this.getNodeParameter('verificationId', i) as string)}`;
            if (op === 'contactCod') {
              if (this.getNodeParameter('confirmed', i) !== true) throw new NodeOperationError(this.getNode(), 'Authorize customer contact before enabling this action.', { itemIndex: i });
              path += '/contact'; options.method = 'POST';
              options.body = { channel: this.getNodeParameter('channel', i) as string, revision: this.getNodeParameter('revision', i) as number, confirmed: true };
            }
          } else throw new NodeOperationError(this.getNode(), 'Unsupported operation.', { itemIndex: i });
        }
        options.url = `https://nutaan.com/api/commerce/integrations/v1${path}`;
        const result: IDataObject = await this.helpers.httpRequestWithAuthentication.call(this, 'nutaanCommerceApi', options);
        output.push({ json: result, pairedItem: { item: i } });
      } catch (error) {
        if (error instanceof NodeOperationError && !this.continueOnFail()) throw new NodeOperationError(this.getNode(), error.message, { itemIndex: i });
        // Never attach request configuration or credentials to error output.
        if (this.continueOnFail()) output.push({ json: { error: 'Nutaan Commerce request failed. Check permissions and action status before retrying customer contact.' }, pairedItem: { item: i } });
        else throw new NodeOperationError(this.getNode(), 'Nutaan Commerce request failed. Check credentials, store permissions and action status before retrying customer contact.', { itemIndex: i });
      }
    }
    return [output];
  }
}
