import { DataQuery, DataSourceJsonData } from '@grafana/data';

export interface JaegerQuery extends DataQuery {
  traceId?: string;
  service?: string;
  operation?: string;
  tags?: string;
  minDuration?: string;
  maxDuration?: string;
  limit?: number;
  queryType?: 'trace' | 'search';
}

export interface JaegerDataSourceOptions extends DataSourceJsonData {
  // proxyMode routes iframe and API calls through the Grafana backend Go proxy.
  proxyMode?: boolean;
  // jaegerPublicURL is the browser-accessible Jaeger URL used in direct mode (proxyMode=false).
  jaegerPublicURL?: string;
  // jaegerInternalURL is the Grafana-server-accessible Jaeger URL used in proxy mode.
  jaegerInternalURL?: string;
}

export const DEFAULT_QUERY: Partial<JaegerQuery> = {
  queryType: 'search',
};
