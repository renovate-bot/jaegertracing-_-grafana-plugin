import { PanelPlugin } from '@grafana/data';
import { JaegerPanelOptions } from './types';
import { JaegerPanel } from './components/JaegerPanel';

export const plugin = new PanelPlugin<JaegerPanelOptions>(JaegerPanel).setPanelOptions((builder) => {
  return builder
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
      path: 'jaegerBaseUrl',
      name: 'Jaeger UI base URL',
      description: 'Base URL of the Jaeger Query service, e.g. http://localhost:16686',
      defaultValue: 'http://localhost:16686',
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
