import React, { useCallback, useEffect, useState } from 'react';
import { QueryEditorProps } from '@grafana/data';
import { InlineField, InlineFieldRow, Input, RadioButtonGroup, Select } from '@grafana/ui';
import { JaegerDataSource } from '../datasource/datasource';
import { JaegerDataSourceOptions, JaegerQuery } from '../types';

type Props = QueryEditorProps<JaegerDataSource, JaegerQuery, JaegerDataSourceOptions>;

const queryTypeOptions = [
  { label: 'Search', value: 'search' as const },
  { label: 'Trace ID', value: 'trace' as const },
];

export function QueryEditor({ datasource, query, onChange, onRunQuery }: Props) {
  const [services, setServices] = useState<string[]>([]);
  const [operations, setOperations] = useState<string[]>([]);

  const queryType = query.queryType ?? 'search';

  useEffect(() => {
    datasource.getServices().then(setServices).catch(() => setServices([]));
  }, [datasource]);

  useEffect(() => {
    if (query.service) {
      datasource.getOperations(query.service).then(setOperations).catch(() => setOperations([]));
    } else {
      Promise.resolve([]).then(setOperations);
    }
  }, [datasource, query.service]);

  const handleQueryTypeChange = useCallback(
    (value: 'search' | 'trace') => {
      if (value === 'trace') {
        onChange({ ...query, queryType: value, service: undefined, operation: undefined, tags: undefined, minDuration: undefined, maxDuration: undefined, limit: undefined });
      } else {
        onChange({ ...query, queryType: value, traceId: undefined });
      }
    },
    [onChange, query]
  );

  return (
    <div>
      <InlineFieldRow>
        <InlineField label="Query type" labelWidth={14}>
          <RadioButtonGroup options={queryTypeOptions} value={queryType} onChange={handleQueryTypeChange} />
        </InlineField>
      </InlineFieldRow>

      {queryType === 'trace' && (
        <InlineFieldRow>
          <InlineField label="Trace ID" labelWidth={14}>
            <Input
              value={query.traceId ?? ''}
              placeholder="e.g. 1234abcd"
              width={40}
              onChange={(e) => onChange({ ...query, traceId: e.currentTarget.value })}
              onBlur={onRunQuery}
            />
          </InlineField>
        </InlineFieldRow>
      )}

      {queryType === 'search' && (
        <>
          <InlineFieldRow>
            <InlineField label="Service" labelWidth={14}>
              <Select
                value={services.find((s) => s === query.service) ? { label: query.service, value: query.service } : null}
                options={services.map((s) => ({ label: s, value: s }))}
                width={32}
                onChange={(v) => onChange({ ...query, service: v?.value ?? undefined })}
                isClearable
                placeholder="Select service"
              />
            </InlineField>
            <InlineField label="Operation" labelWidth={14}>
              <Select
                value={operations.find((o) => o === query.operation) ? { label: query.operation, value: query.operation } : null}
                options={operations.map((o) => ({ label: o, value: o }))}
                width={32}
                onChange={(v) => onChange({ ...query, operation: v?.value ?? undefined })}
                isClearable
                placeholder="Select operation"
                disabled={!query.service}
              />
            </InlineField>
          </InlineFieldRow>
          <InlineFieldRow>
            <InlineField label="Tags" labelWidth={14} tooltip="key:value pairs separated by spaces">
              <Input
                value={query.tags ?? ''}
                placeholder="http.status_code:200 error:true"
                width={40}
                onChange={(e) => onChange({ ...query, tags: e.currentTarget.value })}
                onBlur={onRunQuery}
              />
            </InlineField>
          </InlineFieldRow>
          <InlineFieldRow>
            <InlineField label="Min duration" labelWidth={14}>
              <Input
                value={query.minDuration ?? ''}
                placeholder="e.g. 1.2s, 100ms"
                width={18}
                onChange={(e) => onChange({ ...query, minDuration: e.currentTarget.value })}
                onBlur={onRunQuery}
              />
            </InlineField>
            <InlineField label="Max duration" labelWidth={14}>
              <Input
                value={query.maxDuration ?? ''}
                placeholder="e.g. 1.2s, 100ms"
                width={18}
                onChange={(e) => onChange({ ...query, maxDuration: e.currentTarget.value })}
                onBlur={onRunQuery}
              />
            </InlineField>
            <InlineField label="Limit" labelWidth={10}>
              <Input
                value={query.limit ?? ''}
                placeholder="20"
                width={8}
                type="number"
                onChange={(e) => { const n = Number(e.currentTarget.value); onChange({ ...query, limit: e.currentTarget.value === '' || Number.isNaN(n) ? undefined : n }); }}
                onBlur={onRunQuery}
              />
            </InlineField>
          </InlineFieldRow>
        </>
      )}
    </div>
  );
}
