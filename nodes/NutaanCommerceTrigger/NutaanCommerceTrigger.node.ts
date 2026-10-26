import type { IPollFunctions, INodeExecutionData, INodeType, INodeTypeDescription, IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { NodeOperationError, NodeConnectionTypes } from 'n8n-workflow';
import { apiBaseUrl, DEFAULT_BASE_URL } from '../shared/api';

export class NutaanCommerceTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Nutaan Commerce Trigger', name: 'nutaanCommerceTrigger', group: ['trigger'], version: 1,
    description: 'Poll COD or store automation updates after activation', defaults: { name: 'Nutaan Commerce Trigger' },
    inputs: [], outputs: [NodeConnectionTypes.Main], polling: true, icon: { light: 'file:nutaan.svg', dark: 'file:nutaan.dark.svg' }, subtitle: '={{$parameter.eventSource || "cod"}}',
    credentials: [{ name: 'nutaanCommerceApi', required: true }],
    properties: [
      { displayName: 'Event Source', name: 'eventSource', type: 'options', default: 'cod', options: [{ name: 'COD Verification', value: 'cod' }, { name: 'Store Automations', value: 'automation' }] },
      { displayName: 'Poll Times', name: 'pollTimes', type: 'fixedCollection', typeOptions: { multipleValues: true }, default: { item: [{ mode: 'everyMinute' }] }, options: [{ name: 'item', displayName: 'Item', values: [{ displayName: 'Mode', name: 'mode', type: 'options', options: [{ name: 'Every Minute', value: 'everyMinute' }, { name: 'Every Hour', value: 'everyHour' }], default: 'everyMinute' }] }] },
      { displayName: 'Store Name or ID', name: 'store', type: 'options', typeOptions: { loadOptionsMethod: 'getStores' }, default: '', required: true, description: 'Choose from your authorized Nutaan stores, or specify a store slug. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.' },
    ],
  };
  methods = {
    loadOptions: {
      async getStores(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        const credentials = await this.getCredentials('nutaanCommerceApi');
        const baseUrl = apiBaseUrl(credentials.baseUrl, this.getNode());
        const responseData = await this.helpers.httpRequestWithAuthentication.call(
          this,
          'nutaanCommerceApi',
          { url: `${baseUrl}/stores`, method: 'GET', json: true, disableFollowRedirect: true },
        );
        const stores = (responseData as IDataObject).stores as Array<{ name: string; slug: string }> || [];
        return stores.map(s => ({ name: `${s.name} (${s.slug})`, value: s.slug }));
      },
    },
  };
  async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
    const eventSource = this.getNodeParameter('eventSource', 'cod') === 'automation' ? 'automation' : 'cod';
    const store = this.getNodeParameter('store') as string;
    if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(store)) throw new NodeOperationError(this.getNode(), 'Enter a valid store slug.');
    const credentials = await this.getCredentials('nutaanCommerceApi');
    const baseUrl = apiBaseUrl(credentials.baseUrl, this.getNode());
    const state = this.getWorkflowStaticData('node');
    const now = new Date().toISOString();
    const manual = this.getMode() === 'manual';
    const sameSource = state.store === store && (state.eventSource || 'cod') === eventSource && (state.baseUrl || DEFAULT_BASE_URL) === baseUrl;
    if (!manual && !sameSource) {
      // Reset every checkpoint when the tenant or environment changes.
      Object.assign(state, { store, baseUrl, eventSource, since: now, seen: [], cursor: null, batchSince: null, batchStartedAt: null });
      return null;
    }
    const since = manual ? new Date(Date.now() - 24 * 3600000).toISOString() : String(state.batchSince || state.since || now);
    const startedAt = manual ? now : String(state.batchStartedAt || now);
    let cursor: string | null = manual ? null : typeof state.cursor === 'string' ? state.cursor : null;
    const output: INodeExecutionData[] = [];
    const seen = new Set<string>(!manual && Array.isArray(state.seen) ? state.seen as string[] : []);
    // Bounded chunks drain large backlogs across polls. No checkpoint mutation on failure.
    for (let page = 0; page < 10; page++) {
      const result: { data: IDataObject[]; nextCursor: string | null } = await this.helpers.httpRequestWithAuthentication.call(this, 'nutaanCommerceApi', {
        method: 'GET', url: `${baseUrl}/stores/${encodeURIComponent(store)}/${eventSource}/events`,
        qs: { since, ...(cursor ? { cursor } : {}), limit: 100 }, json: true, timeout: 30000, disableFollowRedirect: true,
      });
      if (!Array.isArray(result.data) || result.data.some(event => typeof event.id !== 'string' || !event.id) ||
          (result.nextCursor != null && (typeof result.nextCursor !== 'string' || !result.nextCursor)) ||
          (result.nextCursor && result.nextCursor === cursor)) throw new NodeOperationError(this.getNode(), 'Unexpected event response or non-advancing cursor.');
      for (const event of result.data) if (!seen.has(String(event.id))) { seen.add(String(event.id)); output.push({ json: event }); }
      cursor = result.nextCursor || null;
      if (!cursor) break;
    }
    if (!manual) {
      if (cursor) {
        // Keep the batch's original watermark until all remaining pages have drained.
        Object.assign(state, { store, baseUrl, eventSource, cursor, batchSince: since, batchStartedAt: startedAt, seen: [...seen].slice(-10000) });
      } else {
        // Use the batch start, not its completion time, so updates during draining are revisited.
        Object.assign(state, { store, baseUrl, eventSource, cursor: null, batchSince: null, batchStartedAt: null,
          since: new Date(new Date(startedAt).getTime() - 60000).toISOString(), seen: [...seen].slice(-10000) });
      }
    }
    return output.length ? [output] : null;
  }
}
