import React from 'react';
import { FieldType, PanelProps } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { JaegerPanelOptions } from '../types';

type Props = PanelProps<JaegerPanelOptions>;

function traceEmbedParams(options: JaegerPanelOptions): URLSearchParams {
  const params = new URLSearchParams({ uiEmbed: 'v0' });
  if (options.hideTimelineMinimap) {
    params.set('uiTimelineHideMinimap', '1');
  }
  if (options.hideTimelineSummary) {
    params.set('uiTimelineHideSummary', '1');
  }
  if (options.collapseTraceHeader) {
    params.set('uiTimelineCollapseTitle', '1');
  }
  return params;
}

// Resolve the iframe base URL from the Jaeger datasource instance settings.
// Returns null if the datasource is not configured or the URL is missing/invalid.
function resolveBaseFromDatasource(uid: string | undefined): string | null {
  if (!uid) {
    return null;
  }
  const settings = getDataSourceSrv().getInstanceSettings(uid);
  if (!settings) {
    return null;
  }
  const publicUrl = (settings.url ?? '').trim().replace(/\/$/, '');
  try {
    const parsed = new URL(publicUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
  } catch {
    return null;
  }
  return publicUrl;
}

function getBase(data: Props['data'], options: JaegerPanelOptions): string | null {
  // Prefer uid from data.request (set by Grafana from the panel's configured datasource).
  // Fall back to options.datasourceUid for Explore, where data.request may not be populated yet.
  const uid = data.request?.targets?.[0]?.datasource?.uid ?? options.datasourceUid;
  return resolveBaseFromDatasource(uid);
}

function buildUrl(options: JaegerPanelOptions, replaceVariables: Props['replaceVariables'], base: string): string | null {
  switch (options.mode) {
    case 'trace': {
      const traceId = replaceVariables(options.traceId ?? '').trim();
      if (!traceId) {
        return null;
      }
      return `${base}/trace/${encodeURIComponent(traceId)}?${traceEmbedParams(options)}`;
    }

    case 'diff': {
      const traceId = replaceVariables(options.traceId ?? '').trim();
      const traceIdB = replaceVariables(options.traceIdB ?? '').trim();
      if (!traceId || !traceIdB) {
        return null;
      }
      return `${base}/trace/${encodeURIComponent(traceId)}...${encodeURIComponent(traceIdB)}?${traceEmbedParams(options)}`;
    }

    case 'search': {
      // Jaeger auto-submits the search query on load; without a service it errors immediately.
      // Until jaeger-ui suppresses the auto-query in embed mode (Phase 4), require a service.
      const service = replaceVariables(options.service ?? '').trim();
      if (!service) {
        return null;
      }
      const searchParams = new URLSearchParams({ uiEmbed: 'v0', uiSearchHideGraph: '1', service });
      return `${base}/search?${searchParams}`;
    }

    default:
      return null;
  }
}

function hint(base: string | null, options: JaegerPanelOptions): string {
  if (!base) {
    return 'Select a Jaeger datasource in panel options.';
  }
  if (options.mode === 'diff') {
    return 'Enter two Trace IDs in panel options.';
  }
  if (options.mode === 'search') {
    return 'Enter a Service name in panel options.';
  }
  return 'Enter a Trace ID in panel options.';
}

// Extract a single trace ID from a DataFrame delivered by the Jaeger datasource.
// Returns null if the frame has zero rows or more than one row (multi-row = search results,
// handled separately by the datasource's data links / splitOpen flow).
function traceIdFromData(data: Props['data']): string | null {
  for (const frame of data.series) {
    const field = frame.fields.find((f) => f.name === 'traceID' && f.type === FieldType.string);
    if (field && frame.length === 1) {
      const value = (field.values as unknown as string[])[0];
      if (typeof value === 'string' && value) {
        return value;
      }
    }
  }
  return null;
}

// Minimum iframe height ensures the trace view is usable in Explore's split pane,
// where Grafana allocates only the remaining viewport height after the query builder.
const MIN_IFRAME_HEIGHT = 600;

export const JaegerPanel: React.FC<Props> = ({ options, data, width, height, replaceVariables }) => {
  const iframeHeight = Math.max(height, MIN_IFRAME_HEIGHT);
  const base = getBase(data, options);

  // DataFrame-driven path: when the Jaeger datasource delivers a single-row trace frame
  // (via Explore or a datasource-linked panel), render the iframe from that trace ID.
  const frameTraceId = traceIdFromData(data);
  if (frameTraceId && base) {
    return (
      <iframe
        src={`${base}/trace/${encodeURIComponent(frameTraceId)}?${traceEmbedParams(options)}`}
        width={width}
        height={iframeHeight}
        style={{ border: 'none', display: 'block' }}
        title="Jaeger Trace"
        data-testid="jaeger-panel-iframe"
      />
    );
  }

  // Panel-options path: dashboard panels with $traceId variable, search mode, diff mode.
  const url = base ? buildUrl(options, replaceVariables, base) : null;

  if (!url) {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#aaa',
          fontSize: 14,
        }}
        data-testid="jaeger-panel-hint"
      >
        {hint(base, options)}
      </div>
    );
  }

  return (
    <iframe
      src={url}
      width={width}
      height={iframeHeight}
      style={{ border: 'none', display: 'block' }}
      title="Jaeger Trace"
      data-testid="jaeger-panel-iframe"
    />
  );
};
