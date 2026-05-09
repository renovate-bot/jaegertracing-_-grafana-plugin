import React from 'react';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { InlineField, InlineFieldRow, InlineSwitch, Input } from '@grafana/ui';
import { JaegerDataSourceOptions } from '../types';

type Props = DataSourcePluginOptionsEditorProps<JaegerDataSourceOptions>;

export function ConfigEditor({ options, onOptionsChange }: Props) {
  const { jsonData } = options;
  const proxyMode = jsonData.proxyMode ?? false;

  const onProxyModeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({ ...options, jsonData: { ...jsonData, proxyMode: e.currentTarget.checked } });
  };

  const onJaegerPublicURLChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({ ...options, jsonData: { ...jsonData, jaegerPublicURL: e.currentTarget.value } });
  };

  const onJaegerInternalURLChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({ ...options, jsonData: { ...jsonData, jaegerInternalURL: e.currentTarget.value } });
  };

  return (
    <>
      {!proxyMode && (
        <InlineFieldRow>
          <InlineField
            label="Jaeger UI URL"
            labelWidth={20}
            tooltip="Browser-accessible URL of the Jaeger query service (e.g. http://localhost:16686). The panel iframe loads Jaeger UI directly from this address."
          >
            <Input
              value={jsonData.jaegerPublicURL ?? ''}
              placeholder="http://localhost:16686"
              width={40}
              onChange={onJaegerPublicURLChange}
            />
          </InlineField>
        </InlineFieldRow>
      )}

      <InlineFieldRow>
        <InlineField
          label="Proxy mode"
          labelWidth={20}
          tooltip="Route iframe and API calls through the Grafana backend. Required when Jaeger is not directly reachable from the browser (e.g. behind SSO)."
        >
          <InlineSwitch value={proxyMode} onChange={onProxyModeChange} />
        </InlineField>
      </InlineFieldRow>

      {proxyMode && (
        <InlineFieldRow>
          <InlineField
            label="Jaeger internal URL"
            labelWidth={20}
            tooltip="Address of the Jaeger query service reachable from the Grafana server (e.g. http://jaeger:16686). Used by the Go backend proxy only."
          >
            <Input
              value={jsonData.jaegerInternalURL ?? ''}
              placeholder="http://jaeger:16686"
              width={40}
              onChange={onJaegerInternalURLChange}
            />
          </InlineField>
        </InlineFieldRow>
      )}
    </>
  );
}
