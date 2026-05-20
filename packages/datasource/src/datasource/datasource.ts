import {
  DataLink,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  FieldType,
  TimeRange,
  createDataFrame,
} from '@grafana/data';
import { getBackendSrv, getTemplateSrv, isFetchError } from '@grafana/runtime';
import { lastValueFrom } from 'rxjs';
import { JaegerDataSourceOptions, JaegerQuery } from '../types';

export class JaegerDataSource extends DataSourceApi<JaegerQuery, JaegerDataSourceOptions> {
  readonly baseUrl: string;
  readonly publicUrl: string;

  constructor(instanceSettings: DataSourceInstanceSettings<JaegerDataSourceOptions>) {
    super(instanceSettings);
    // baseUrl: the Grafana DataProxy path used for server-side API calls (no CORS needed).
    this.baseUrl = (instanceSettings.url ?? '').replace(/\/+$/, '');
    // publicUrl: the browser-accessible Jaeger URL used for the panel iframe.
    this.publicUrl = (instanceSettings.jsonData.publicUrl ?? '').replace(/\/+$/, '');
  }

  async query(request: DataQueryRequest<JaegerQuery>): Promise<DataQueryResponse> {
    const results = await Promise.all(
      request.targets
        .filter((target) => !target.hide)
        .map((target) => this.runQuery(target, request.range))
    );
    return { data: results.flat() };
  }

  private async runQuery(query: JaegerQuery, range: TimeRange): Promise<Array<ReturnType<typeof createDataFrame>>> {
    const interpolated: JaegerQuery = {
      ...query,
      traceId: query.traceId ? getTemplateSrv().replace(query.traceId) : query.traceId,
      service: query.service ? getTemplateSrv().replace(query.service) : query.service,
      operation: query.operation ? getTemplateSrv().replace(query.operation) : query.operation,
      tags: query.tags ? getTemplateSrv().replace(query.tags) : query.tags,
    };
    if (interpolated.queryType === 'trace') {
      return Promise.resolve(interpolated.traceId ? this.fetchTrace(interpolated.traceId) : []);
    }
    return interpolated.service ? this.fetchTraces(interpolated, range) : [];
  }

  private fetchTrace(traceId: string): Array<ReturnType<typeof createDataFrame>> {
    // No API call needed: the panel renders the trace via iframe, which fetches it directly.
    return [createDataFrame({
      name: traceId,
      meta: { preferredVisualisationPluginId: 'jaegertracing-jaeger-panel' },
      fields: [{ name: 'traceID', type: FieldType.string, values: [traceId] }],
    })];
  }

  private async fetchTraces(query: JaegerQuery, range: TimeRange): Promise<Array<ReturnType<typeof createDataFrame>>> {
    const params = new URLSearchParams({ service: query.service ?? '' });
    // Jaeger expects start/end in microseconds
    params.set('start', String(range.from.valueOf() * 1000));
    params.set('end', String(range.to.valueOf() * 1000));
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

    interface JaegerSpan {
      spanID: string;
      operationName: string;
      duration: number;
      startTime: number;
      processID: string;
      references: Array<{ refType: string }>;
    }
    interface JaegerTrace {
      traceID: string;
      spans: JaegerSpan[];
      processes: Record<string, { serviceName: string }>;
    }

    const response = await lastValueFrom(
      getBackendSrv().fetch<{ data: JaegerTrace[] }>({
        url: `${this.baseUrl}/api/traces?${params}`,
      })
    );

    const traceLink: DataLink = {
      title: 'Open in Explore',
      url: '',
      internal: {
        datasourceUid: this.uid,
        datasourceName: this.name,
        query: { queryType: 'trace', traceId: '${__value.raw}' },
      },
    };

    const traceIDs: string[] = [];
    const traceNames: string[] = [];
    const spanCounts: number[] = [];
    const durations: number[] = [];

    for (const trace of response.data.data ?? []) {
      const spans: JaegerSpan[] = Array.isArray(trace.spans) ? trace.spans : [];
      // Root span: the one with no parent reference
      const rootSpan = spans.find((s) => !s.references?.some((r) => r.refType === 'CHILD_OF'))
        ?? spans.reduce((a, b) => (a.startTime < b.startTime ? a : b), spans[0]);
      const service = rootSpan ? (trace.processes[rootSpan.processID]?.serviceName ?? '') : '';
      const operation = rootSpan?.operationName ?? '';
      traceIDs.push(trace.traceID);
      traceNames.push(service && operation ? `${service}: ${operation}` : operation);
      spanCounts.push(spans.length);
      durations.push(rootSpan?.duration ?? 0);
    }

    return [createDataFrame({
      name: 'traces',
      fields: [
        { name: 'traceID', type: FieldType.string, values: traceIDs, config: { links: [traceLink] } },
        { name: 'traceName', type: FieldType.string, values: traceNames },
        { name: 'spanCount', type: FieldType.number, values: spanCounts },
        { name: 'duration', type: FieldType.number, values: durations, config: { unit: 'µs' } },
      ],
    })];
  }

  async testDatasource(): Promise<{ status: string; message: string }> {
    try {
      await lastValueFrom(
        getBackendSrv().fetch({
          url: `${this.baseUrl}/api/services`,
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
        url: `${this.baseUrl}/api/services`,
      })
    );
    return response.data.data ?? [];
  }

  async getOperations(service: string): Promise<string[]> {
    const response = await lastValueFrom(
      getBackendSrv().fetch<{ data: string[] }>({
        url: `${this.baseUrl}/api/services/${encodeURIComponent(service)}/operations`,
      })
    );
    return response.data.data ?? [];
  }
}
