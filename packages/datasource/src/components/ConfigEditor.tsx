import React from 'react';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { Alert, InlineField, InlineFieldRow, Input } from '@grafana/ui';
import { AdvancedHttpSettings, ConnectionSettings } from '@grafana/plugin-ui';
import { JaegerDataSourceOptions } from '../types';

type Props = DataSourcePluginOptionsEditorProps<JaegerDataSourceOptions>;

export function ConfigEditor({ options, onOptionsChange }: Props) {
  return (
    <>
      <Alert severity="info" title="Two URLs are required:">
        <p>
          <strong>Public URL</strong> — loaded by the <em>browser</em> as the panel iframe src. Must be
          reachable from the user&apos;s browser (e.g. <code>http://localhost:16686</code>, or{' '}
          <code>https://grafana.example.com/jaeger</code> behind a same-origin reverse proxy).
        </p>
        <p>
          <strong>URL</strong> (below) — used by the <em>Grafana server</em> for API calls via its backend
          proxy. Can be an internal address not reachable from the browser (e.g.{' '}
          <code>http://jaeger:16686</code> in Docker).
        </p>
      </Alert>
      <h3>Jaeger UI Settings</h3>
      <InlineFieldRow>
        <InlineField label="Public URL" labelWidth={24} required>
          <Input
            value={options.jsonData.publicUrl ?? ''}
            placeholder="http://jaeger.example.com:16686"
            width={40}
            onChange={(e) =>
              onOptionsChange({
                ...options,
                jsonData: { ...options.jsonData, publicUrl: e.currentTarget.value },
              })
            }
          />
        </InlineField>
      </InlineFieldRow>
      <hr/>
      <ConnectionSettings
        config={options}
        onChange={onOptionsChange}
        urlPlaceholder="http://jaeger:16686"
      />
      <AdvancedHttpSettings config={options} onChange={onOptionsChange} />
    </>
  );
}
