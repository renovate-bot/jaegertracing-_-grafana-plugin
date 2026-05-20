import { DataQuery } from '@grafana/schema';
import { DataSourceJsonData } from '@grafana/data';

export interface JaegerDataSourceOptions extends DataSourceJsonData {
  publicUrl?: string;
}

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

export const DEFAULT_QUERY: Partial<JaegerQuery> = {
  queryType: 'search',
};
