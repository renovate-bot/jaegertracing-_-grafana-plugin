import { DataSourcePlugin } from '@grafana/data';
import { ConfigEditor } from './components/ConfigEditor';
import { QueryEditor } from './components/QueryEditor';
import { JaegerDataSource } from './datasource/datasource';
import { JaegerDataSourceOptions, JaegerQuery } from './types';

export const plugin = new DataSourcePlugin<JaegerDataSource, JaegerQuery, JaegerDataSourceOptions>(JaegerDataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);
