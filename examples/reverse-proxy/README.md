# Reverse-proxy example

A self-contained docker-compose stack demonstrating two ways to serve Jaeger UI
behind a reverse proxy under a path prefix (`/jaeger/ui/`), with Grafana using
the Jaeger panel and datasource plugins pointing at each proxy.

## Motivation

The Jaeger panel plugin renders an `<iframe>` whose `src` must be a
browser-accessible URL. When Jaeger is not directly reachable from the browser
(internal network, VPN, etc.), an ingress reverse proxy can expose it under a
path prefix on the same origin as Grafana, eliminating cross-origin cookie
issues.

Two proxy strategies are demonstrated:

| | Option 1 | Option 2 |
|---|---|---|
| **Jaeger config** | `--set extensions.jaeger_query.base_path=/jaeger/ui` | none (serves at `/`) |
| **Proxy** | Transparent pass-through, no path transformation | Prefix stripping (`/jaeger/ui/` → `/`) |
| **Base-path detection** | Jaeger registers API routes under the prefix | UI auto-detects from `window.location` (since Jaeger 2.18.0, [ADR-009](https://github.com/jaegertracing/jaeger/blob/main/docs/adr/009-ui-base-path-auto-detection.md)) |
| **Response rewriting** | Not needed | Not needed |
| **Best for** | Dedicated Jaeger instance per prefix | One Jaeger instance, multiple prefixes |

## Stack

```
browser
  ├── :18080/jaeger/ui/*  → httpd1 → jaeger1:16686/jaeger/ui/*  (transparent proxy)
  ├── :18081/jaeger/ui/*  → httpd2 → jaeger2:16686/*            (prefix stripping)
  └── :18082              → Grafana (with both datasources provisioned)

jaeger1  — base_path=/jaeger/ui, traces from hotrod1
jaeger2  — no base_path, traces from hotrod2
```

Neither Jaeger instance exposes ports to the host directly, simulating a
deployment where Jaeger is only reachable via the proxy.

## Usage

```bash
# From the repo root — builds plugins, starts stack, runs tests, tears down
make test-reverse-proxy
```

Or run each step manually:

```bash
# Build plugins (required — Grafana mounts packages/*/dist)
npm run build

# Start the stack
docker compose -f examples/reverse-proxy/docker-compose.yaml up -d

# Run curl/jq tests (proxy layer + Grafana integration)
examples/reverse-proxy/test.sh

# Run Playwright tests (Grafana UI)
GRAFANA_URL=http://localhost:18082 npx playwright test \
  --config playwright/reverse-proxy.config.ts

# Tear down
docker compose -f examples/reverse-proxy/docker-compose.yaml down
```

Once the stack is running:

| URL | What you see |
|-----|--------------|
| http://localhost:18080/jaeger/ui/ | Jaeger UI (Option 1, via httpd) |
| http://localhost:18081/jaeger/ui/ | Jaeger UI (Option 2, via httpd) |
| http://localhost:18082 | Grafana with both datasources |

## Files

| File | Purpose |
|------|---------|
| `docker-compose.yaml` | Full stack: two Jaeger instances, two httpd proxies, Grafana |
| `httpd-option1.conf` | Apache config for Option 1 (transparent proxy) |
| `httpd-option2.conf` | Apache config for Option 2 (prefix stripping) |
| `provisioning/` | Grafana datasource provisioning for both options |
| `test.sh` | curl/jq assertions for the proxy layer and Grafana integration |
