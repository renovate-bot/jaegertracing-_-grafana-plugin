import { DataSourcePlugin } from '@grafana/data';
import { QueryEditor } from './components/QueryEditor';
import { JaegerDataSource } from './datasource/datasource';
import { JaegerQuery, JaegerDataSourceOptions } from './types';

export const plugin = new DataSourcePlugin<JaegerDataSource, JaegerQuery, JaegerDataSourceOptions>(JaegerDataSource)
  .setQueryEditor(QueryEditor);
