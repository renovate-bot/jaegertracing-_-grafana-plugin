import {
  DataLink,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  FieldType,
  MutableDataFrame,
  TimeRange,
} from '@grafana/data';
import { getBackendSrv, getTemplateSrv, isFetchError } from '@grafana/runtime';
import { lastValueFrom } from 'rxjs';
import { JaegerDataSourceOptions, JaegerQuery } from '../types';

export class JaegerDataSource extends DataSourceApi<JaegerQuery, JaegerDataSourceOptions> {
  readonly proxyUrl: string;

  constructor(instanceSettings: DataSourceInstanceSettings<JaegerDataSourceOptions>) {
    super(instanceSettings);
    // In proxy mode, route API calls through CallResource (/api/datasources/uid/<uid>/resources)
    // so they are forwarded by the Go backend to the internal Jaeger URL.
    // In direct mode, use Grafana's built-in data proxy (instanceSettings.url → datasource url field).
    this.proxyUrl = instanceSettings.jsonData.proxyMode
      ? `/api/datasources/uid/${instanceSettings.uid}/resources`
      : instanceSettings.url!;
  }

  async query(request: DataQueryRequest<JaegerQuery>): Promise<DataQueryResponse> {
    const results = await Promise.all(
      request.targets
        .filter((target) => !target.hide)
        .map((target) => this.runQuery(target, request.range))
    );
    return { data: results.flat() };
  }

  private async runQuery(query: JaegerQuery, range: TimeRange): Promise<MutableDataFrame[]> {
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

  private fetchTrace(traceId: string): MutableDataFrame[] {
    // No API call needed: the panel renders the trace via iframe, which fetches it directly.
    const frame = new MutableDataFrame({
      name: traceId,
      meta: { preferredVisualisationPluginId: 'jaegertracing-jaeger-panel' },
      fields: [{ name: 'traceID', type: FieldType.string }],
    });
    frame.add({ traceID: traceId });
    return [frame];
  }

  private async fetchTraces(query: JaegerQuery, range: TimeRange): Promise<MutableDataFrame[]> {
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
        url: `${this.proxyUrl}/api/traces?${params}`,
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

    const frame = new MutableDataFrame({
      name: 'traces',
      fields: [
        { name: 'traceID', type: FieldType.string, config: { links: [traceLink] } },
        { name: 'traceName', type: FieldType.string },
        { name: 'spanCount', type: FieldType.number },
        { name: 'duration', type: FieldType.number, config: { unit: 'µs' } },
      ],
    });

    for (const trace of response.data.data ?? []) {
      const spans: JaegerSpan[] = Array.isArray(trace.spans) ? trace.spans : [];
      // Root span: the one with no parent reference
      const rootSpan = spans.find((s) => !s.references?.some((r) => r.refType === 'CHILD_OF'))
        ?? spans.reduce((a, b) => (a.startTime < b.startTime ? a : b), spans[0]);
      const service = rootSpan ? (trace.processes[rootSpan.processID]?.serviceName ?? '') : '';
      const operation = rootSpan?.operationName ?? '';
      frame.add({
        traceID: trace.traceID,
        traceName: service && operation ? `${service}: ${operation}` : operation,
        spanCount: spans.length,
        duration: rootSpan?.duration ?? 0,
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
