import React from 'react';
import { PanelPlugin } from '@grafana/data';
import { DataSourcePicker } from '@grafana/runtime';
import { JaegerPanelOptions } from './types';
import { JaegerPanel } from './components/JaegerPanel';

export const plugin = new PanelPlugin<JaegerPanelOptions>(JaegerPanel).setPanelOptions((builder) => {
  return builder
    .addCustomEditor({
      id: 'datasourceUid',
      path: 'datasourceUid',
      name: 'Jaeger datasource',
      description: 'Select the Jaeger datasource. Used to resolve proxy mode and base URL automatically. Leave unset to use the Jaeger UI base URL below.',
      editor: ({ value, onChange }) =>
        React.createElement(DataSourcePicker, {
          pluginId: 'jaegertracing-jaeger-datasource',
          current: value ?? null,
          noDefault: true,
          placeholder: 'Select datasource (optional)',
          onChange: (ds) => onChange(ds.uid),
          onClear: () => onChange(undefined),
        }),
    })
    .addRadio({
      path: 'mode',
      name: 'Mode',
      defaultValue: 'trace',
      settings: {
        options: [
          { value: 'trace', label: 'Single trace' },
          { value: 'diff', label: 'Trace diff' },
          { value: 'search', label: 'Search' },
        ],
      },
    })
    .addTextInput({
      path: 'traceId',
      name: 'Trace ID',
      description: 'Trace ID to display. Supports dashboard variables, e.g. ${traceId}.',
      defaultValue: '',
      showIf: (o) => o.mode === 'trace' || o.mode === 'diff',
    })
    .addTextInput({
      path: 'traceIdB',
      name: 'Trace ID (B)',
      description: 'Second trace ID for diff mode. Supports dashboard variables.',
      defaultValue: '',
      showIf: (o) => o.mode === 'diff',
    })
    .addTextInput({
      path: 'service',
      name: 'Service',
      description: 'Pre-select a service in the Jaeger search page. Supports dashboard variables.',
      defaultValue: '',
      showIf: (o) => o.mode === 'search',
    })
    .addBooleanSwitch({
      path: 'hideTimelineMinimap',
      name: 'Hide minimap',
      description: 'Hide the span minimap at the top of the trace view.',
      defaultValue: false,
      showIf: (o) => o.mode === 'trace' || o.mode === 'diff',
    })
    .addBooleanSwitch({
      path: 'hideTimelineSummary',
      name: 'Hide trace summary',
      description: 'Hide the summary row above the trace timeline.',
      defaultValue: false,
      showIf: (o) => o.mode === 'trace' || o.mode === 'diff',
    })
    .addBooleanSwitch({
      path: 'collapseTraceHeader',
      name: 'Collapse trace header',
      description: 'Start with the trace header collapsed.',
      defaultValue: false,
      showIf: (o) => o.mode === 'trace' || o.mode === 'diff',
    });
});
