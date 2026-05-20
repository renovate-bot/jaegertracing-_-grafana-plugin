# Contributing

## Requirements

- Node.js >= 22
- Docker and Docker Compose (for running local stacks)

## Build

```bash
# Build both the panel and datasource plugins
make build

# Build only the panel
make panel-build

# Build only the datasource
make datasource-build
```

Built artifacts land in `packages/panel/dist/` and `packages/datasource/dist/`.

## Local development stack

The root `docker-compose.yaml` starts Grafana with the built plugins loaded, a Jaeger instance, and the HotROD demo app:

```bash
make server
```

| Service | URL |
|---------|-----|
| Grafana | http://localhost:3000 (anonymous Admin) |
| Jaeger UI | http://localhost:16686 |
| HotROD demo | http://localhost:8080 |

Grafana mounts `packages/panel/dist/` and `packages/datasource/dist/` directly, so `make build && make server` picks up your latest changes. The provisioned datasource points at the local Jaeger instance.

## Unit tests

```bash
make test
```

Runs Jest for both packages (`packages/panel` and `packages/datasource`). The datasource tests cover constructor behaviour, `testDatasource`, service/trace fetching, and query execution. The panel tests cover iframe URL construction for all modes and the data-frame-driven path.

## End-to-end tests

### Direct deployment e2e

Tests in `tests/panel.spec.ts` run against the root `docker-compose.yaml` stack (Grafana on port 3000 with Jaeger and HotROD).

```bash
# Terminal 1: start the stack
make server

# Terminal 2: run Playwright tests
npm run e2e --workspace=packages/panel
```

The Playwright config is at `playwright/config.ts` and uses `@grafana/plugin-e2e` fixtures. Tests cover panel rendering, mode switching, iframe URL construction, and Explore integration.

### Reverse-proxy e2e

Tests in `tests/reverse-proxy.spec.ts` run against the stack in `examples/reverse-proxy/docker-compose.yaml`, which sets up two Jaeger instances behind httpd reverse proxies, each with a different proxying strategy, plus a Grafana instance (port 18082) with both datasources provisioned.

```bash
make test-reverse-proxy
```

This target:
1. Starts `examples/reverse-proxy/docker-compose.yaml` in detached mode.
2. Runs `examples/reverse-proxy/test.sh` — 12 curl/jq assertions covering the proxy layer (HTTP responses, `data-inject-target="BASE_URL"` presence, `/api/services`, assets) and Grafana datasource provisioning (`url` field).
3. Runs Playwright tests (`tests/reverse-proxy.spec.ts`) against the stack — 6 assertions covering `/api/services` reachability via the datasource URL, datasource `url` provisioning, and the config page loading correctly.
4. Tears down the stack regardless of test outcome.

The two proxy strategies tested:

| Option | Strategy |
|--------|----------|
| Option 1 | Transparent proxy + `--query.base-path=/jaeger/ui` passed to Jaeger |
| Option 2 | Prefix stripping in httpd; Jaeger UI auto-detects base path from `window.location` (since Jaeger 2.18.0) |

Reverse-proxy tests also run in CI as the `reverse-proxy-tests` job. Run them locally before submitting changes to `examples/reverse-proxy/`.

## CI pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and pull request to `main`:

1. **build-panel**: typecheck → lint → unit tests → build → sign (if token present) → package → `plugin-validator-cli`
2. **build-datasource**: typecheck → lint → unit tests → build
3. **resolve-versions**: resolves the Grafana version matrix for e2e tests (via `grafana/plugin-actions/e2e-version`)
4. **playwright-tests**: runs the direct deployment e2e tests (`tests/panel.spec.ts`) against each resolved Grafana version using the root `docker-compose.yaml` (Grafana + Jaeger + HotRod)
5. **publish-report**: publishes the Playwright HTML report to GitHub Pages

The reverse-proxy e2e tests also run in CI as the `reverse-proxy-tests` job (`build` → `reverse-proxy-tests`).

## Lint

```bash
make lint
```

## Repository layout

```
packages/
  panel/          Grafana panel plugin (React, TypeScript)
  datasource/     Grafana datasource plugin (TypeScript, frontend-only)
tests/
  panel.spec.ts           Direct deployment Playwright e2e tests
  reverse-proxy.spec.ts   Reverse-proxy Playwright e2e tests
playwright/
  config.ts               Playwright config for direct deployment e2e
  reverse-proxy.config.ts Playwright config for reverse-proxy e2e
examples/
  reverse-proxy/          Two-option reverse-proxy example stack
    docker-compose.yaml
    test.sh               curl/jq assertions for the reverse-proxy stack
    provisioning/
docs/
  adr/            Architecture decision records
```
