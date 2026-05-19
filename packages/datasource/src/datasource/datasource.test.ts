import { FieldType } from '@grafana/data';
import { getBackendSrv, getTemplateSrv } from '@grafana/runtime';
import { of, throwError } from 'rxjs';
import { JaegerDataSource } from './datasource';

jest.mock('@grafana/runtime', () => ({
  getBackendSrv: jest.fn(),
  getTemplateSrv: jest.fn(),
  isFetchError: jest.fn((e: unknown) => (e as any)?.__isFetchError === true),
}));

const mockGetBackendSrv = getBackendSrv as jest.Mock;
const mockGetTemplateSrv = getTemplateSrv as jest.Mock;

function makeInstance(url = 'http://localhost:16686') {
  return new JaegerDataSource({
    uid: 'test-uid',
    id: 1,
    name: 'Jaeger',
    type: 'jaegertracing-jaeger-datasource',
    url,
    access: 'proxy',
    jsonData: {},
    readOnly: false,
  } as any);
}

beforeEach(() => {
  mockGetTemplateSrv.mockReturnValue({ replace: (s: string) => s });
});

describe('JaegerDataSource — constructor', () => {
  it('uses instanceSettings.url as baseUrl', () => {
    const ds = makeInstance('http://jaeger.example.com/jaeger');
    expect(ds.baseUrl).toBe('http://jaeger.example.com/jaeger');
  });
});

describe('JaegerDataSource — testDatasource', () => {
  it('returns success when /api/services responds', async () => {
    mockGetBackendSrv.mockReturnValue({
      fetch: jest.fn().mockReturnValue(of({ data: { data: ['frontend'] } })),
    });
    const ds = makeInstance();
    const result = await ds.testDatasource();
    expect(result.status).toBe('success');
    expect(result.message).toContain('Successfully connected');
  });

  it('returns error when fetch throws', async () => {
    mockGetBackendSrv.mockReturnValue({
      fetch: jest.fn().mockReturnValue(throwError(() => new Error('ECONNREFUSED'))),
    });
    const ds = makeInstance();
    const result = await ds.testDatasource();
    expect(result.status).toBe('error');
    expect(result.message).toContain('Cannot connect');
  });
});

describe('JaegerDataSource — getServices', () => {
  it('returns service list from API', async () => {
    mockGetBackendSrv.mockReturnValue({
      fetch: jest.fn().mockReturnValue(of({ data: { data: ['frontend', 'driver'] } })),
    });
    const ds = makeInstance();
    const services = await ds.getServices();
    expect(services).toEqual(['frontend', 'driver']);
  });
});

describe('JaegerDataSource — query (trace mode)', () => {
  it('returns single-row traceID frame without making an API call', async () => {
    const fetch = jest.fn();
    mockGetBackendSrv.mockReturnValue({ fetch });
    const ds = makeInstance();
    const result = await ds.query({
      targets: [{ refId: 'A', queryType: 'trace', traceId: 'abc123' }],
      range: { from: { valueOf: () => 0 }, to: { valueOf: () => 0 } } as any,
    } as any);

    expect(fetch).not.toHaveBeenCalled();
    expect(result.data).toHaveLength(1);
    const frame = result.data[0];
    expect(frame.name).toBe('abc123');
    expect(frame.length).toBe(1);
    const field = frame.fields.find((f: any) => f.name === 'traceID' && f.type === FieldType.string);
    expect(field).toBeDefined();
    expect(field.values[0]).toBe('abc123');
  });

  it('returns empty data when traceId is blank', async () => {
    mockGetBackendSrv.mockReturnValue({ fetch: jest.fn() });
    const ds = makeInstance();
    const result = await ds.query({
      targets: [{ refId: 'A', queryType: 'trace', traceId: '' }],
      range: { from: { valueOf: () => 0 }, to: { valueOf: () => 0 } } as any,
    } as any);
    expect(result.data).toHaveLength(0);
  });
});

describe('JaegerDataSource — query (search mode)', () => {
  it('calls /api/traces with correct params and returns a traces frame', async () => {
    const fetch = jest.fn().mockReturnValue(
      of({
        data: {
          data: [
            {
              traceID: 'trace1',
              spans: [
                {
                  spanID: 's1',
                  operationName: 'HTTP GET /dispatch',
                  duration: 5000,
                  startTime: 1000,
                  processID: 'p1',
                  references: [],
                },
              ],
              processes: { p1: { serviceName: 'frontend' } },
            },
          ],
        },
      })
    );
    mockGetBackendSrv.mockReturnValue({ fetch });

    const ds = makeInstance('http://jaeger.example.com/jaeger');
    const from = { valueOf: () => 1000 };
    const to = { valueOf: () => 2000 };
    const result = await ds.query({
      targets: [{ refId: 'A', queryType: 'search', service: 'frontend', limit: 5 }],
      range: { from, to } as any,
    } as any);

    const [callArg] = fetch.mock.calls[0];
    expect(callArg.url).toContain('jaeger.example.com/jaeger/api/traces');
    expect(callArg.url).toContain('service=frontend');
    expect(callArg.url).toContain('limit=5');

    expect(result.data).toHaveLength(1);
    const frame = result.data[0];
    expect(frame.name).toBe('traces');
    const traceIdField = frame.fields.find((f: any) => f.name === 'traceID');
    expect(traceIdField.values[0]).toBe('trace1');
    const traceNameField = frame.fields.find((f: any) => f.name === 'traceName');
    expect(traceNameField.values[0]).toBe('frontend: HTTP GET /dispatch');
  });

  it('returns empty data when no service is provided', async () => {
    mockGetBackendSrv.mockReturnValue({ fetch: jest.fn() });
    const ds = makeInstance();
    const result = await ds.query({
      targets: [{ refId: 'A', queryType: 'search', service: '' }],
      range: { from: { valueOf: () => 0 }, to: { valueOf: () => 0 } } as any,
    } as any);
    expect(result.data).toHaveLength(0);
  });

  it('applies template variable interpolation', async () => {
    mockGetTemplateSrv.mockReturnValue({ replace: (s: string) => s.replace('${svc}', 'driver') });
    const fetch = jest.fn().mockReturnValue(of({ data: { data: [] } }));
    mockGetBackendSrv.mockReturnValue({ fetch });

    const ds = makeInstance('http://localhost:16686');
    await ds.query({
      targets: [{ refId: 'A', queryType: 'search', service: '${svc}' }],
      range: { from: { valueOf: () => 0 }, to: { valueOf: () => 0 } } as any,
    } as any);

    const [callArg] = fetch.mock.calls[0];
    expect(callArg.url).toContain('service=driver');
  });

  it('skips hidden targets', async () => {
    const fetch = jest.fn();
    mockGetBackendSrv.mockReturnValue({ fetch });
    const ds = makeInstance();
    const result = await ds.query({
      targets: [{ refId: 'A', queryType: 'search', service: 'frontend', hide: true }],
      range: { from: { valueOf: () => 0 }, to: { valueOf: () => 0 } } as any,
    } as any);
    expect(fetch).not.toHaveBeenCalled();
    expect(result.data).toHaveLength(0);
  });
});
