import { DataSourceJsonData, DataSourcePlugin } from '@grafana/data';
import { QueryEditor } from './components/QueryEditor';
import { JaegerDataSource } from './datasource/datasource';
import { JaegerQuery } from './types';

export const plugin = new DataSourcePlugin<JaegerDataSource, JaegerQuery, DataSourceJsonData>(JaegerDataSource)
  .setQueryEditor(QueryEditor);
