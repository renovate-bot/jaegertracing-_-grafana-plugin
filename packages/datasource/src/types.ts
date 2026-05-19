import { DataQuery } from '@grafana/schema';

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
