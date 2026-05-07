import React from 'react';
import { PanelProps } from '@grafana/data';
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

function buildUrl(options: JaegerPanelOptions, replaceVariables: Props['replaceVariables']): string | null {
  const base = resolveBase(replaceVariables(options.jaegerBaseUrl));
  if (!base) {
    return null;
  }
  const params = new URLSearchParams({ uiEmbed: 'v0' });

  switch (options.mode) {
    case 'trace': {
      const traceId = replaceVariables(options.traceId).trim();
      if (!traceId) {
        return null;
      }
      if (options.hideTimelineMinimap) {
        params.set('uiTimelineHideMinimap', '1');
      }
      if (options.hideTimelineSummary) {
        params.set('uiTimelineHideSummary', '1');
      }
      if (options.collapseTraceHeader) {
        params.set('uiTimelineCollapseTitle', '1');
      }
      return `${base}/trace/${encodeURIComponent(traceId)}?${params}`;
    }

    case 'diff': {
      const traceId = replaceVariables(options.traceId).trim();
      const traceIdB = replaceVariables(options.traceIdB).trim();
      if (!traceId || !traceIdB) {
        return null;
      }
      if (options.hideTimelineMinimap) {
        params.set('uiTimelineHideMinimap', '1');
      }
      if (options.hideTimelineSummary) {
        params.set('uiTimelineHideSummary', '1');
      }
      if (options.collapseTraceHeader) {
        params.set('uiTimelineCollapseTitle', '1');
      }
      return `${base}/trace/${encodeURIComponent(traceId)}...${encodeURIComponent(traceIdB)}?${params}`;
    }

    case 'search': {
      // Jaeger auto-submits the search query on load; without a service it errors immediately.
      // Until jaeger-ui suppresses the auto-query in embed mode (Phase 2), require a service.
      const service = replaceVariables(options.service ?? '').trim();
      if (!service) {
        return null;
      }
      params.set('uiSearchHideGraph', '1');
      params.set('service', service);
      return `${base}/search?${params}`;
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

export const JaegerPanel: React.FC<Props> = ({ options, width, height, replaceVariables }) => {
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
      height={height}
      style={{ border: 'none', display: 'block' }}
      title="Jaeger Trace"
      data-testid="jaeger-panel-iframe"
    />
  );
};
