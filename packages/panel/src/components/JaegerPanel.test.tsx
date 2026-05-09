import React from 'react';
import { render, screen } from '@testing-library/react';
import { FieldType, LoadingState, toDataFrame } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { JaegerPanel } from './JaegerPanel';
import { JaegerPanelOptions } from '../types';

jest.mock('@grafana/runtime', () => ({
  getDataSourceSrv: jest.fn(),
}));

const mockGetDataSourceSrv = getDataSourceSrv as jest.Mock;

const baseOptions: JaegerPanelOptions = {
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

const dsUid = 'test-uid-123';

beforeEach(() => {
  mockGetDataSourceSrv.mockReturnValue({
    getInstanceSettings: jest.fn().mockReturnValue({ jsonData: { proxyMode: false, jaegerPublicURL: 'http://jaeger:16686' } }),
  });
});

describe('JaegerPanel — DataFrame-driven path', () => {
  it('renders iframe from single-row traceID frame', () => {
    const frame = toDataFrame({
      name: 'abc123',
      fields: [{ name: 'traceID', type: FieldType.string, values: ['abc123'] }],
    });
    const opts = { ...baseOptions, datasourceUid: dsUid };
    render(<JaegerPanel {...baseProps} options={opts} data={{ series: [frame], state: LoadingState.Done, timeRange: {} as any }} />);
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
    render(<JaegerPanel {...baseProps} data={{ series: [frame], state: LoadingState.Done, timeRange: {} as any }} />);
    expect(screen.getByTestId('jaeger-panel-hint')).toBeInTheDocument();
  });

  it('applies embed flag options when rendering from DataFrame', () => {
    const opts = { ...baseOptions, datasourceUid: dsUid, hideTimelineMinimap: true, collapseTraceHeader: true };
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

describe('JaegerPanel — base URL from datasource', () => {
  const dataWithTarget = {
    series: [],
    state: LoadingState.Done,
    timeRange: {} as any,
    request: { targets: [{ datasource: { uid: dsUid } }] } as any,
  };

  it('uses jaegerPublicURL when datasource has proxyMode=true', () => {
    mockGetDataSourceSrv.mockReturnValue({
      getInstanceSettings: jest.fn().mockReturnValue({ jsonData: { proxyMode: true, jaegerPublicURL: 'http://proxy:18080/jaeger/ui' } }),
    });

    const opts = { ...baseOptions, traceId: 'abc' };
    render(<JaegerPanel {...baseProps} options={opts} data={dataWithTarget} />);

    const iframe = screen.getByTestId('jaeger-panel-iframe') as HTMLIFrameElement;
    expect(iframe.src).toContain('http://proxy:18080/jaeger/ui');
    expect(iframe.src).toContain('/trace/abc');
    expect(iframe.src).not.toContain('/api/datasources');
  });

  it('uses jaegerPublicURL when datasource has proxyMode=false', () => {
    mockGetDataSourceSrv.mockReturnValue({
      getInstanceSettings: jest.fn().mockReturnValue({ jsonData: { proxyMode: false, jaegerPublicURL: 'http://jaeger:16686' } }),
    });

    const opts = { ...baseOptions, traceId: 'def' };
    render(<JaegerPanel {...baseProps} options={opts} data={dataWithTarget} />);

    const iframe = screen.getByTestId('jaeger-panel-iframe') as HTMLIFrameElement;
    expect(iframe.src).toContain('http://jaeger:16686');
    expect(iframe.src).toContain('/trace/def');
    expect(iframe.src).not.toContain('/api/datasources');
  });

  it('shows hint when getInstanceSettings returns undefined', () => {
    mockGetDataSourceSrv.mockReturnValue({
      getInstanceSettings: jest.fn().mockReturnValue(undefined),
    });

    const opts = { ...baseOptions, traceId: 'ghi' };
    render(<JaegerPanel {...baseProps} options={opts} data={dataWithTarget} />);

    expect(screen.getByTestId('jaeger-panel-hint')).toBeInTheDocument();
  });

  it('uses jaegerPublicURL when uid comes from panel options (no data.request)', () => {
    mockGetDataSourceSrv.mockReturnValue({
      getInstanceSettings: jest.fn().mockReturnValue({ jsonData: { proxyMode: true, jaegerPublicURL: 'http://proxy:18080/jaeger/ui' } }),
    });

    const opts = { ...baseOptions, traceId: 'jkl', datasourceUid: dsUid };
    render(<JaegerPanel {...baseProps} options={opts} />);

    const iframe = screen.getByTestId('jaeger-panel-iframe') as HTMLIFrameElement;
    expect(iframe.src).toContain('http://proxy:18080/jaeger/ui');
    expect(iframe.src).toContain('/trace/jkl');
    expect(iframe.src).not.toContain('/api/datasources');
  });

  it('shows "Select a Jaeger datasource" hint when no datasource is configured', () => {
    const opts = { ...baseOptions, traceId: 'mno' };
    render(<JaegerPanel {...baseProps} options={opts} />);
    expect(screen.getByTestId('jaeger-panel-hint')).toHaveTextContent('Select a Jaeger datasource');
  });
});
