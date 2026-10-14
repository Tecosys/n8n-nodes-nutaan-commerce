import type { IPollFunctions, INodeExecutionData, INodeType, INodeTypeDescription, IDataObject } from 'n8n-workflow';
import { NodeOperationError, NodeConnectionTypes } from 'n8n-workflow';

export class NutaanCommerceTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Nutaan Commerce Trigger', name: 'nutaanCommerceTrigger', group: ['trigger'], version: 1,
    description: 'Poll latest COD verification updates after activation', defaults: { name: 'Nutaan Commerce Trigger' },
    inputs: [], outputs: [NodeConnectionTypes.Main], polling: true, icon: { light: 'file:nutaan.svg', dark: 'file:nutaan.dark.svg' }, subtitle: 'COD Verification Updates',
    credentials: [{ name: 'nutaanCommerceApi', required: true }],
    properties: [{ displayName: 'Poll Times', name: 'pollTimes', type: 'fixedCollection', typeOptions: { multipleValues: true }, default: { item: [{ mode: 'everyMinute' }] }, options: [{ name: 'item', displayName: 'Item', values: [{ displayName: 'Mode', name: 'mode', type: 'options', options: [{ name: 'Every Minute', value: 'everyMinute' }, { name: 'Every Hour', value: 'everyHour' }], default: 'everyMinute' }] }] }, { displayName: 'Store Slug', name: 'store', type: 'string', default: '', required: true }],
  };
  async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
    const store = this.getNodeParameter('store') as string;
    if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(store)) throw new NodeOperationError(this.getNode(), 'Enter a valid store slug.');
    const state = this.getWorkflowStaticData('node');
    const now = new Date().toISOString();
    if (this.getMode() !== 'manual' && state.store !== store) {
      // No historical customer-contact backfill on first activation or store change.
      state.store = store; state.since = now; return null;
    }
    const since = this.getMode() === 'manual' ? new Date(Date.now() - 24 * 3600000).toISOString() : String(state.since || now);
    let cursor: string | null = null;
    const output: INodeExecutionData[] = [];
    const seen = new Set<string>(Array.isArray(state.seen) ? state.seen as string[] : []);
    // Complete pagination before advancing checkpoint; failure leaves it unchanged.
    for (let page = 0; page < 100; page++) {
      const result: { data: IDataObject[]; nextCursor: string | null } = await this.helpers.httpRequestWithAuthentication.call(this, 'nutaanCommerceApi', {
        method: 'GET', url: `https://nutaan.com/api/commerce/integrations/v1/stores/${encodeURIComponent(store)}/cod/events`,
        qs: { since, ...(cursor ? { cursor } : {}), limit: 100 }, json: true, timeout: 30000,
      });
      if (!Array.isArray(result.data)) throw new NodeOperationError(this.getNode(), 'Unexpected event response.');
      for (const event of result.data) if (!seen.has(String(event.id))) { seen.add(String(event.id)); output.push({ json: event }); }
      cursor = result.nextCursor || null;
      if (!cursor) break;
      if (page === 99) throw new NodeOperationError(this.getNode(), 'Event backlog exceeds one poll. Reduce the polling interval or contact Nutaan support.');
    }
    if (this.getMode() !== 'manual') {
      // Overlap catches delayed visibility; action-level deduplication remains authoritative.
      state.since = new Date(new Date(now).getTime() - 60000).toISOString();
      state.seen = [...seen].slice(-10000);
    }
    return output.length ? [output] : null;
  }
}
