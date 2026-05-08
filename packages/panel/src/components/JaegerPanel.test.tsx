import React from 'react';
import { render, screen } from '@testing-library/react';
import { FieldType, LoadingState, toDataFrame } from '@grafana/data';
import { JaegerPanel } from './JaegerPanel';
import { JaegerPanelOptions } from '../types';

const baseOptions: JaegerPanelOptions = {
  jaegerBaseUrl: 'http://jaeger:16686',
  mode: 'trace',
  traceId: '',
  traceIdB: '',
  service: '',
  hideTimelineMinimap: false,
  hideTimelineSummary: false,
  collapseTraceHeader: false,
};

const baseProps = {
  options: baseOptions,
  width: 800,
  height: 600,
  replaceVariables: (v: string) => v,
  data: { series: [], state: LoadingState.Done, timeRange: {} as any },
  timeRange: {} as any,
  timeZone: 'browser',
  transparent: false,
  title: '',
  id: 1,
  onChangeTimeRange: () => {},
  onOptionsChange: () => {},
  onFieldConfigChange: () => {},
  renderCounter: 0,
  fieldConfig: { defaults: {}, overrides: [] },
  eventBus: { subscribe: () => ({ unsubscribe: () => {} }) } as any,
};

describe('JaegerPanel — DataFrame-driven path', () => {
  it('renders iframe from single-row traceID frame, ignoring panel traceId option', () => {
    const frame = toDataFrame({
      name: 'abc123',
      fields: [{ name: 'traceID', type: FieldType.string, values: ['abc123'] }],
    });
    render(<JaegerPanel {...baseProps} data={{ series: [frame], state: LoadingState.Done, timeRange: {} as any }} />);
    const iframe = screen.getByTestId('jaeger-panel-iframe') as HTMLIFrameElement;
    expect(iframe.src).toContain('/trace/abc123');
    expect(iframe.src).toContain('uiEmbed=v0');
  });

  it('falls back to panel-options path when frame has multiple rows', () => {
    const frame = toDataFrame({
      name: 'traces',
      fields: [
        { name: 'traceID', type: FieldType.string, values: ['aaa', 'bbb'] },
        { name: 'spanCount', type: FieldType.number, values: [3, 5] },
      ],
    });
    // panel options has no traceId → should show hint
    render(<JaegerPanel {...baseProps} data={{ series: [frame], state: LoadingState.Done, timeRange: {} as any }} />);
    expect(screen.getByTestId('jaeger-panel-hint')).toBeInTheDocument();
  });

  it('falls back to panel-options path when no frames are present', () => {
    const opts = { ...baseOptions, traceId: 'deadbeef' };
    render(<JaegerPanel {...baseProps} options={opts} />);
    const iframe = screen.getByTestId('jaeger-panel-iframe') as HTMLIFrameElement;
    expect(iframe.src).toContain('/trace/deadbeef');
  });

  it('applies embed flag options when rendering from DataFrame', () => {
    const opts = { ...baseOptions, hideTimelineMinimap: true, collapseTraceHeader: true };
    const frame = toDataFrame({
      name: 'xyz',
      fields: [{ name: 'traceID', type: FieldType.string, values: ['xyz'] }],
    });
    render(
      <JaegerPanel
        {...baseProps}
        options={opts}
        data={{ series: [frame], state: LoadingState.Done, timeRange: {} as any }}
      />
    );
    const iframe = screen.getByTestId('jaeger-panel-iframe') as HTMLIFrameElement;
    expect(iframe.src).toContain('uiTimelineHideMinimap=1');
    expect(iframe.src).toContain('uiTimelineCollapseTitle=1');
  });
});
