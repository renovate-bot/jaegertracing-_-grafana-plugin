import React from 'react';
import { FieldType, PanelProps } from '@grafana/data';
import { JaegerPanelOptions } from 'types';

type Props = PanelProps<JaegerPanelOptions>;

function resolveBase(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/$/, '');
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
  } catch {
    return null;
  }
  return trimmed;
}

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

function buildUrl(options: JaegerPanelOptions, replaceVariables: Props['replaceVariables']): string | null {
  const base = resolveBase(replaceVariables(options.jaegerBaseUrl));
  if (!base) {
    return null;
  }

  switch (options.mode) {
    case 'trace': {
      const traceId = replaceVariables(options.traceId).trim();
      if (!traceId) {
        return null;
      }
      return `${base}/trace/${encodeURIComponent(traceId)}?${traceEmbedParams(options)}`;
    }

    case 'diff': {
      const traceId = replaceVariables(options.traceId).trim();
      const traceIdB = replaceVariables(options.traceIdB).trim();
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

function hint(options: JaegerPanelOptions, replaceVariables: Props['replaceVariables']): string {
  if (!resolveBase(replaceVariables(options.jaegerBaseUrl))) {
    return 'Enter a valid Jaeger UI base URL (http:// or https://) in panel options.';
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
      const value = field.values.get ? field.values.get(0) : (field.values as unknown as string[])[0];
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
  // DataFrame-driven path: when the Jaeger datasource delivers a single-row trace frame
  // (via Explore or a datasource-linked panel), render the iframe directly from that trace ID.
  // The base URL still comes from panel options — proxy mode (Phase 3) will change this.
  const frameTraceId = traceIdFromData(data);
  if (frameTraceId) {
    const base = resolveBase(replaceVariables(options.jaegerBaseUrl));
    if (base) {
      const url = `${base}/trace/${encodeURIComponent(frameTraceId)}?${traceEmbedParams(options)}`;
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
    }
  }

  // Panel-options path: dashboard panels with $traceId variable, search mode, diff mode.
  const url = buildUrl(options, replaceVariables);

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
        {hint(options, replaceVariables)}
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
