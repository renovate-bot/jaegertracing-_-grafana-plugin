export type PanelMode = 'trace' | 'diff' | 'search';

export interface JaegerPanelOptions {
  datasourceUid?: string;
  mode: PanelMode;
  traceId: string;
  traceIdB: string;
  service: string;
  hideTimelineMinimap: boolean;
  hideTimelineSummary: boolean;
  collapseTraceHeader: boolean;
}
