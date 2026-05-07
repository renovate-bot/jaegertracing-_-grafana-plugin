import {
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  FieldType,
  MutableDataFrame,
} from '@grafana/data';
import { getBackendSrv, isFetchError } from '@grafana/runtime';
import { lastValueFrom } from 'rxjs';
import { JaegerDataSourceOptions, JaegerQuery } from '../types';

export class JaegerDataSource extends DataSourceApi<JaegerQuery, JaegerDataSourceOptions> {
  readonly proxyUrl: string;

  constructor(instanceSettings: DataSourceInstanceSettings<JaegerDataSourceOptions>) {
    super(instanceSettings);
    // instanceSettings.url is the Grafana backend proxy URL for this datasource
    this.proxyUrl = instanceSettings.url!;
  }

  async query(request: DataQueryRequest<JaegerQuery>): Promise<DataQueryResponse> {
    const results = await Promise.all(
      request.targets
        .filter((target) => !target.hide)
        .map((target) => this.runQuery(target))
    );
    return { data: results.flat() };
  }

  private async runQuery(query: JaegerQuery): Promise<MutableDataFrame[]> {
    if (query.queryType === 'trace') {
      return query.traceId ? this.fetchTrace(query.traceId) : [];
    }
    return query.service ? this.fetchTraces(query) : [];
  }

  private async fetchTrace(traceId: string): Promise<MutableDataFrame[]> {
    await lastValueFrom(
      getBackendSrv().fetch<{ data: unknown[] }>({
        url: `${this.proxyUrl}/api/traces/${encodeURIComponent(traceId)}`,
      })
    );
    const frame = new MutableDataFrame({
      name: traceId,
      fields: [{ name: 'traceID', type: FieldType.string }],
    });
    frame.add({ traceID: traceId });
    return [frame];
  }

  private async fetchTraces(query: JaegerQuery): Promise<MutableDataFrame[]> {
    const params = new URLSearchParams({ service: query.service ?? '' });
    if (query.operation) {
      params.set('operation', query.operation);
    }
    if (query.limit) {
      params.set('limit', String(query.limit));
    }
    if (query.minDuration) {
      params.set('minDuration', query.minDuration);
    }
    if (query.maxDuration) {
      params.set('maxDuration', query.maxDuration);
    }
    if (query.tags) {
      // Jaeger HTTP API accepts repeated "tag=key:value" params (colon separator).
      // The plural "tags" param expects a JSON map; we use "tag" to avoid JSON encoding.
      for (const pair of query.tags.trim().split(/\s+/)) {
        if (pair) {
          params.append('tag', pair);
        }
      }
    }

    const response = await lastValueFrom(
      getBackendSrv().fetch<{ data: Array<{ traceID: string; spans: unknown[] }> }>({
        url: `${this.proxyUrl}/api/traces?${params}`,
      })
    );

    const frame = new MutableDataFrame({
      name: 'traces',
      fields: [
        { name: 'traceID', type: FieldType.string },
        { name: 'spanCount', type: FieldType.number },
      ],
    });

    for (const trace of response.data.data ?? []) {
      frame.add({
        traceID: trace.traceID,
        spanCount: Array.isArray(trace.spans) ? trace.spans.length : 0,
      });
    }

    return [frame];
  }

  async testDatasource(): Promise<{ status: string; message: string }> {
    try {
      await lastValueFrom(
        getBackendSrv().fetch({
          url: `${this.proxyUrl}/api/services`,
        })
      );
      return { status: 'success', message: 'Successfully connected to Jaeger' };
    } catch (err) {
      const msg = isFetchError(err) ? `HTTP ${err.status}: ${err.statusText}` : String(err);
      return { status: 'error', message: `Cannot connect to Jaeger: ${msg}` };
    }
  }

  async getServices(): Promise<string[]> {
    const response = await lastValueFrom(
      getBackendSrv().fetch<{ data: string[] }>({
        url: `${this.proxyUrl}/api/services`,
      })
    );
    return response.data.data ?? [];
  }

  async getOperations(service: string): Promise<string[]> {
    const response = await lastValueFrom(
      getBackendSrv().fetch<{ data: string[] }>({
        url: `${this.proxyUrl}/api/services/${encodeURIComponent(service)}/operations`,
      })
    );
    return response.data.data ?? [];
  }
}
