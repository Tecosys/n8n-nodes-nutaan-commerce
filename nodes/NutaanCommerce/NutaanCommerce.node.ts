import { NodeOperationError, NodeConnectionTypes } from 'n8n-workflow';
import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription, IHttpRequestOptions, IDataObject } from 'n8n-workflow';

import { apiBaseUrl } from '../shared/api';

export class NutaanCommerce implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Nutaan Commerce', name: 'nutaanCommerce', group: ['transform'], version: 1,
    description: 'Automate recovery, COD, delivery assistance and returns through Nutaan Commerce',
    defaults: { name: 'Nutaan Commerce' }, icon: { light: 'file:nutaan.svg', dark: 'file:nutaan.dark.svg' }, subtitle: '={{$parameter.operation}}', usableAsTool: true, inputs: [NodeConnectionTypes.Main], outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: 'nutaanCommerceApi', required: true }],
    properties: [
      { displayName: 'Resource', name: 'resource', type: 'options', noDataExpression: true, default: 'store', options: [{ name: 'Automation', value: 'automation' }, { name: 'COD Verification', value: 'cod' }, { name: 'Order', value: 'order' }, { name: 'Return', value: 'return' }, { name: 'Store', value: 'store' }] },
      { displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true, default: 'listStores', displayOptions: { show: { resource: ['store'] } }, options: [{ name: 'List Stores', value: 'listStores', action: 'List permitted stores' }] },
      { displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true, default: 'listOrders', displayOptions: { show: { resource: ['order'] } }, options: [{ name: 'List Orders', value: 'listOrders', action: 'List orders' }] },
      { displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true, default: 'listReturns', displayOptions: { show: { resource: ['return'] } }, options: [
        { name: 'Check Eligibility', value: 'returnEligibility', action: 'Check return eligibility' },
        { name: 'Create Return or Exchange', value: 'createReturn', action: 'Create a return or exchange' },
        { name: 'List Returns', value: 'listReturns', action: 'List returns' },
        { name: 'Manage Return', value: 'manageReturn', action: 'Manage a return' },
      ] },
      { displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true, default: 'listCod', displayOptions: { show: { resource: ['cod'] } }, options: [
        { name: 'Contact COD Customer', value: 'contactCod', action: 'Contact a COD customer' },
        { name: 'Get COD Verification', value: 'getCod', action: 'Get a COD verification' },
        { name: 'Get Contact Action', value: 'getAction', action: 'Get a contact action status' },
        { name: 'List COD Verifications', value: 'listCod', action: 'List COD verifications' },
        { name: 'Record Verified Outcome', value: 'resolveCod', action: 'Record a verified COD outcome' },
      ] },
      { displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true, default: 'upsertRecord', displayOptions: { show: { resource: ['automation'] } }, options: [
        { name: 'Contact Customer', value: 'contactRecord', action: 'Contact a customer for an automation record' },
        { name: 'Get Action', value: 'getAutomationAction', action: 'Get an automation action' },
        { name: 'Get Record', value: 'getRecord', action: 'Get an automation record' },
        { name: 'List Records', value: 'listRecords', action: 'List automation records' },
        { name: 'Upsert Store Event', value: 'upsertRecord', action: 'Upsert a verified store event' },
      ] },
      { displayName: 'Event Data', name: 'eventData', type: 'json', default: '{}', required: true, description: 'Verified store event including kind, externalId, sourceVersion, status, contact window and channel consent', displayOptions: { show: { operation: ['upsertRecord'] } } },
      { displayName: 'Record ID', name: 'recordId', type: 'string', default: '', required: true, displayOptions: { show: { operation: ['getRecord', 'contactRecord'] } } },
      { displayName: 'Verified Outcome', name: 'outcomeData', type: 'json', default: '{}', required: true, description: 'A verified customer response: status and optional correctedAddress, callbackAt or note. Never infer consent or confirmation from a delivery receipt.', displayOptions: { show: { operation: ['resolveCod'] } } },
      { displayName: 'Source Version', name: 'sourceVersion', type: 'number', default: 1, typeOptions: { minValue: 1 }, required: true, displayOptions: { show: { operation: ['contactRecord'] } } },
      { displayName: 'Return Data', name: 'returnData', type: 'json', default: '{}', required: true, description: 'Eligibility: orderNumber and email. Create: also kind, lines and stable requestId. Manage: reference, operation and optional note, status or quote token.', displayOptions: { show: { operation: ['returnEligibility', 'createReturn', 'manageReturn'] } } },
      { displayName: 'Authorize Changes', name: 'authorizeChanges', type: 'boolean', default: false, description: 'Whether this workflow is explicitly authorized to ingest store events or create or modify returns and exchanges', displayOptions: { show: { operation: ['upsertRecord', 'createReturn', 'manageReturn', 'resolveCod'] } } },
      { displayName: 'Store Slug', name: 'store', type: 'string', default: '', required: true, displayOptions: { hide: { operation: ['listStores'] } } },
      { displayName: 'Verification ID', name: 'verificationId', type: 'string', default: '', required: true, displayOptions: { show: { operation: ['getCod', 'contactCod', 'resolveCod'] } } },
      { displayName: 'Action ID', name: 'actionId', type: 'string', default: '', required: true, displayOptions: { show: { operation: ['getAction', 'getAutomationAction'] } } },
      { displayName: 'Channel', name: 'channel', type: 'options', default: 'email', options: [{ name: 'Email', value: 'email' }, { name: 'Voice Call', value: 'voice' }, { name: 'WhatsApp', value: 'whatsapp', displayOptions: { show: { operation: ['contactRecord'] } } }], displayOptions: { show: { operation: ['contactCod', 'contactRecord'] } } },
      { displayName: 'Current Revision', name: 'revision', type: 'number', default: 0, typeOptions: { minValue: 0 }, required: true, description: 'Read the current verification first. A stale revision is rejected.', displayOptions: { show: { operation: ['contactCod', 'resolveCod'] } } },
      { displayName: 'Authorize Customer Contact', name: 'confirmed', type: 'boolean', default: false, description: 'Whether this workflow is authorized to send verification email or place a real, billed voice call', displayOptions: { show: { operation: ['contactCod', 'contactRecord'] } } },
      { displayName: 'Limit', name: 'limit', type: 'number', default: 50, description: 'Max number of results to return', typeOptions: { minValue: 1, maxValue: 100 }, displayOptions: { show: { operation: ['listOrders', 'listCod', 'listReturns', 'listRecords'] } } },
      { displayName: 'Cursor', name: 'cursor', type: 'string', default: '', description: 'The nextCursor returned by the previous list request', displayOptions: { show: { operation: ['listOrders', 'listCod', 'listReturns', 'listRecords'] } } },
      { displayName: 'Updated Since', name: 'since', type: 'string', default: '', description: 'Optional ISO timestamp', displayOptions: { show: { operation: ['listOrders', 'listCod', 'listReturns', 'listRecords'] } } },
    ],
  };
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const credentials = await this.getCredentials('nutaanCommerceApi');
    const baseUrl = apiBaseUrl(credentials.baseUrl, this.getNode());
    const output: INodeExecutionData[] = [];
    for (let i = 0; i < this.getInputData().length; i++) {
      try {
        const op = this.getNodeParameter('operation', i) as string;
        let path = '/stores';
        const options: IHttpRequestOptions = { url: '', method: 'GET', json: true, timeout: 30000, disableFollowRedirect: true };
        if (op !== 'listStores') {
          const store = this.getNodeParameter('store', i) as string;
          if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(store)) throw new NodeOperationError(this.getNode(), 'Enter a valid store slug.', { itemIndex: i });
          const base = `/stores/${encodeURIComponent(store)}`;
          if (['listOrders', 'listCod', 'listReturns', 'listRecords'].includes(op)) {
            path = `${base}/${op === 'listOrders' ? 'orders' : op === 'listCod' ? 'cod' : op === 'listRecords' ? 'automation/records' : 'returns'}`;
            options.qs = { limit: this.getNodeParameter('limit', i) as number, cursor: this.getNodeParameter('cursor', i) as string, since: this.getNodeParameter('since', i) as string };
            if (!options.qs.since) delete options.qs.since;
          } else if (op === 'upsertRecord') {
            if (this.getNodeParameter('authorizeChanges', i) !== true) throw new NodeOperationError(this.getNode(), 'Authorize store event ingestion first.');
            path = base + '/automation/records'; options.method = 'PUT';
            const event = this.getNodeParameter('eventData', i);
            options.body = typeof event === 'string' ? JSON.parse(event) : event as IDataObject;
          } else if (op === 'getRecord' || op === 'contactRecord') {
            path = base + '/automation/records/' + encodeURIComponent(this.getNodeParameter('recordId', i) as string);
            if (op === 'contactRecord') {
              if (this.getNodeParameter('confirmed', i) !== true) throw new NodeOperationError(this.getNode(), 'Authorize customer contact first.');
              path += '/contact'; options.method = 'POST'; options.body = { channel: this.getNodeParameter('channel', i) as string, sourceVersion: this.getNodeParameter('sourceVersion', i) as number, confirmed: true };
            }
          } else if (op === 'getAutomationAction') path = base + '/automation/actions/' + encodeURIComponent(this.getNodeParameter('actionId', i) as string);
          else if (['returnEligibility', 'createReturn', 'manageReturn'].includes(op)) {
            const raw = this.getNodeParameter('returnData', i); const data = typeof raw === 'string' ? JSON.parse(raw) : raw as IDataObject;
            if (!data || typeof data !== 'object' || Array.isArray(data)) throw new NodeOperationError(this.getNode(), 'Provide a return data object.');
            if (op !== 'returnEligibility' && this.getNodeParameter('authorizeChanges', i) !== true) throw new NodeOperationError(this.getNode(), 'Authorize return changes first.');
            path = base + '/returns'; options.method = 'POST';
            if (op === 'returnEligibility') { path += '/eligibility'; options.body = { orderNumber: data.orderNumber, email: data.email }; }
            else if (op === 'createReturn') options.body = { orderNumber: data.orderNumber, email: data.email, kind: data.kind, lines: data.lines, requestId: data.requestId, confirmed: true };
            else {
              if (!/^RMA-[A-F0-9]{12}$/.test(String(data.reference)) || !['approve', 'decline', 'status', 'quote', 'process', 'sync'].includes(String(data.operation))) throw new NodeOperationError(this.getNode(), 'Provide a valid return reference and operation.');
              path += '/' + encodeURIComponent(String(data.reference)) + '/' + String(data.operation);
              options.body = { confirmed: true, ...(data.note !== undefined ? { note: data.note } : {}), ...(data.status !== undefined ? { status: data.status } : {}), ...(data.token !== undefined ? { token: data.token } : {}) };
            }
          } else if (op === 'getAction') path = `${base}/actions/${encodeURIComponent(this.getNodeParameter('actionId', i) as string)}`;
          else if (op === 'getCod' || op === 'contactCod' || op === 'resolveCod') {
            path = `${base}/cod/${encodeURIComponent(this.getNodeParameter('verificationId', i) as string)}`;
            if (op === 'resolveCod') {
              if (this.getNodeParameter('authorizeChanges', i) !== true) throw new NodeOperationError(this.getNode(), 'Authorize verified outcome recording first.');
              const raw = this.getNodeParameter('outcomeData', i); const data = typeof raw === 'string' ? JSON.parse(raw) : raw as IDataObject;
              path += '/outcome'; options.method = 'POST'; options.body = { confirmed: true, revision: this.getNodeParameter('revision', i) as number, status: data.status, ...(data.correctedAddress ? { correctedAddress: data.correctedAddress } : {}), ...(data.callbackAt ? { callbackAt: data.callbackAt } : {}), ...(data.note ? { note: data.note } : {}) };
            }
            if (op === 'contactCod') {
              if (this.getNodeParameter('confirmed', i) !== true) throw new NodeOperationError(this.getNode(), 'Authorize customer contact before enabling this action.', { itemIndex: i });
              path += '/contact'; options.method = 'POST';
              options.body = { channel: this.getNodeParameter('channel', i) as string, revision: this.getNodeParameter('revision', i) as number, confirmed: true };
            }
          } else throw new NodeOperationError(this.getNode(), 'Unsupported operation.', { itemIndex: i });
        }
        options.url = `${baseUrl}${path}`;
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
