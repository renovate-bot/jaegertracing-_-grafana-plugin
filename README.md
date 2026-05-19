# Jaeger Panel Plugin for Grafana

A Grafana panel plugin that embeds [Jaeger](https://www.jaegertracing.io/) trace visualizations inside Grafana dashboards using Jaeger's built-in `uiEmbed=v0` mode.

## Overview

The plugin renders an iframe pointing at a Jaeger Query service. Three modes are supported:

| Mode | Description |
|------|-------------|
| **Single trace** | Renders the full trace timeline for a given trace ID |
| **Trace diff** | Side-by-side comparison of two traces |
| **Search** | Embeds Jaeger's search page for querying traces by service, operation, and tags |

## Installation

Download `jaegertracing-jaeger-panel-<version>.zip`, `jaegertracing-jaeger-datasource-<version>.zip`, and `checksums.txt` from the [Releases](https://github.com/jaegertracing/grafana-plugin/releases) page into the same directory, then verify:

```bash
sha256sum -c checksums.txt
# jaegertracing-jaeger-panel-<version>.zip: OK
# jaegertracing-jaeger-datasource-<version>.zip: OK
```

Unzip both archives into your Grafana plugins directory, then add to `grafana.ini`:

```ini
[plugins]
allow_loading_unsigned_plugins = jaegertracing-jaeger-panel,jaegertracing-jaeger-datasource
```

Restart Grafana.

## Prerequisites

- A running Jaeger Query service reachable from the user's browser (the iframe loads Jaeger UI directly).
- Grafana 12.3.0 or later.

## Datasource configuration

Install the **Jaeger datasource** plugin and add a datasource for each Jaeger instance:

1. Go to **Connections → Data sources → Add new data source** and choose **Jaeger**.
2. Set **URL** to the browser-accessible address of Jaeger (e.g. `http://localhost:16686`). This is used both as the iframe source and for all API calls (health checks, fetching services/traces). In a reverse-proxy deployment this is the proxy address including any path prefix.

## Panel options

| Option | Description |
|--------|-------------|
| **Jaeger datasource** | Select the Jaeger datasource. The panel reads its **URL** field to build the iframe src. |
| **Mode** | `Single trace`, `Trace diff`, or `Search` |
| **Trace ID** | Trace ID to display. Supports dashboard variables: `${traceId}` |
| **Trace ID (B)** | Second trace ID for diff mode. Supports dashboard variables |
| **Service** | Pre-selects a service in search mode. Supports dashboard variables |
| **Hide minimap** | Hides the span minimap (trace/diff modes) |
| **Hide trace summary** | Hides the summary row above the timeline (trace/diff modes) |
| **Collapse trace header** | Starts the trace header collapsed (trace/diff modes) |

## Dashboard variables

Use Grafana dashboard variables to drive the trace ID from a URL parameter or from a data link in another panel:

1. Add a **Text box** variable named `traceId` to your dashboard.
2. Set the panel's **Trace ID** option to `${traceId}`.
3. The panel updates whenever the variable changes.

## Architecture

See [docs/adr/0001-jaeger-ui-in-grafana.md](docs/adr/0001-jaeger-ui-in-grafana.md) for the architecture decision record.

## License

Apache-2.0
