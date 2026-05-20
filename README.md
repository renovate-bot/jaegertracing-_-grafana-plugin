# Jaeger Plugins for Grafana

Two Grafana plugins for embedding [Jaeger](https://www.jaegertracing.io/) trace visualizations in Grafana dashboards: a **datasource plugin** that connects to a Jaeger Query service, and a **panel plugin** that renders Jaeger's UI in an iframe using Jaeger's built-in `uiEmbed=v0` mode.

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
2. Leave **Access** as **Server (default)**. Grafana's backend proxy forwards API calls server-side — no CORS configuration required on Jaeger.
3. Set **URL** to the address of Jaeger reachable from the **Grafana server** (e.g. `http://jaeger:16686` in Docker, or `http://localhost:16686` for a local setup).
4. Set **Public URL** to the address of Jaeger reachable from the **browser** (e.g. `http://localhost:16686`). The panel uses this as the iframe `src` to render Jaeger UI.

## Panel options

| Option | Description |
|--------|-------------|
| **Jaeger datasource** | Select the Jaeger datasource. The panel reads its **Public URL** field to build the iframe src. |
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
