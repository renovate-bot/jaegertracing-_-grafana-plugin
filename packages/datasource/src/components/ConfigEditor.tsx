import React from 'react';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { InlineField, InlineFieldRow, Input } from '@grafana/ui';
import { JaegerDataSourceOptions } from '../types';

type Props = DataSourcePluginOptionsEditorProps<JaegerDataSourceOptions>;

export function ConfigEditor({ options, onOptionsChange }: Props) {
  return (
    <InlineFieldRow>
      <InlineField
        label="Public URL"
        labelWidth={20}
        tooltip="Browser-accessible URL of Jaeger UI (e.g. http://localhost:16686). Used as the iframe source in the panel. The URL field above is used by Grafana's backend proxy for API calls."
      >
        <Input
          value={options.jsonData.publicUrl ?? ''}
          placeholder="http://localhost:16686"
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
  );
}
