# ADR 0002: Iframe-Based Jaeger UI Integration — Implementation Plan

* **Status**: In progress (Phase 4 next)
* **Last Updated**: 2026-05-09

---

## TL;DR

Implements the iframe rendering approach decided in [ADR 0001](./0001-jaeger-ui-in-grafana.md). A panel plugin renders `<iframe src={jaegerUrl}>` and a datasource plugin provides Explore integration and Jaeger API access. The datasource is frontend-only — API calls go directly from the browser to Jaeger using the datasource's `url` field, with no Go backend binary and no server-side proxy. The Jaeger SPA (single page app) must always be served from a browser-reachable origin; Grafana's proxy infrastructure cannot serve executable JavaScript due to a universal `Content-Security-Policy: sandbox` header.

---

## Repository

The plugin lives in its own dedicated repository (`github.com/jaegertracing/grafana-plugin`). This keeps the plugin versioning, releases, CI, and Grafana plugin catalog submission independent of the Jaeger core release cycle. It also avoids introducing Node.js/webpack toolchain into the main Jaeger Go repo, and sidesteps CNCF license compliance concerns around Grafana's AGPLv3 dependencies (`@grafana/ui`, `@grafana/data`, `@grafana/runtime`) which are not approved for inclusion in Apache-2.0 CNCF projects.

The Go backend binary (Phase 3) does not import any Jaeger internals — it communicates with Jaeger exclusively over HTTP. The Jaeger backend repo explicitly disallows external dependencies on its internal packages, and none are needed here.

**Jaeger UI changes** (`uiEmbed` flag additions in Phase 4, `uiLinkPatterns` in Phase 5) are PRs to the jaeger-ui repo, released independently and consumed here via npm.

**Repository layout:**

```
grafana-plugin/
├── packages/
│   ├── panel/                # Panel plugin (jaegertracing-jaeger-panel)
│   │   ├── src/
│   │   │   ├── components/   # JaegerPanel React component + tests
│   │   │   ├── types.ts
│   │   │   ├── module.ts
│   │   │   └── plugin.json
│   │   └── package.json
│   └── datasource/           # Datasource plugin (jaegertracing-jaeger-datasource)
│       ├── src/
│       │   ├── components/   # QueryEditor
│       │   ├── datasource/   # DataSource class + tests
│       │   ├── types.ts
│       │   ├── module.ts
│       │   └── plugin.json   # frontend-only, no backend/executable
│       └── package.json
├── examples/
│   └── reverse-proxy/        # Deployment pattern: Jaeger behind path-prefix proxy
│       ├── docker-compose.yaml
│       ├── httpd-option1.conf
│       ├── httpd-option2.conf
│       ├── provisioning/     # Grafana datasources for the example stack
│       └── test.sh           # curl/jq + Playwright e2e tests
├── provisioning/             # Combined provisioning for root docker-compose
├── tests/                    # Playwright e2e tests (root dev stack + reverse-proxy)
├── docker-compose.yaml       # Grafana + Jaeger + HotROD for local dev
├── docs/
│   └── adr/
├── package.json              # npm workspaces root
└── Makefile
```

---

## Backend Binary: Decision

**The datasource plugin is frontend-only. There is no Go binary.**

Grafana plugins can be frontend-only (`"backend": false`) or full-stack (`"backend": true`, Go binary). We evaluated the binary and found it entirely redundant:

### API call proxying — not needed; browser reaches Jaeger directly

The panel plugin renders a `<iframe src={jaegerPublicURL}>`. Since the Jaeger SPA must run in the browser (Grafana's proxy infrastructure unconditionally adds `Content-Security-Policy: sandbox` — see Phase 3 below), the browser **must** already have a direct network path to `jaegerPublicURL`. If the browser can load the SPA it can also call `/api/services`, `/api/traces`, etc. at the same origin.

The datasource TypeScript therefore calls Jaeger's API directly using `jaegerPublicURL` as the base URL — no intermediary proxy of any kind. This eliminates a round-trip through the Grafana server for every search and service-discovery request.

**CORS consideration:** Direct browser-to-Jaeger API calls require either same-origin access or Jaeger to emit appropriate CORS headers. In the recommended ingress deployment (Jaeger served under a path prefix on the same origin as Grafana) there is no cross-origin request at all — both the iframe and the API calls go to `grafana.mydomain.com/jaeger/...`. In a split-origin deployment (`grafana.mydomain.com` + `jaeger.mydomain.com`) CORS headers on Jaeger would be needed for the API calls, but the iframe would also fail due to third-party cookie blocking in that scenario (see SSO section below), making a same-origin ingress the correct solution for both problems simultaneously.

### Health check — handled by TypeScript

The user-facing **"Test" button** calls the TypeScript `testDatasource()` method, which calls `/api/services` directly from the browser and reports success or failure. This is the check operators actually run. The Go `CheckHealth` only drove Grafana's background polling dot (the green/red indicator in the datasource list) — a minor UX nicety that doesn't justify a full binary.

### What was removed

- `packages/datasource/pkg/` (main.go, plugin.go, proxy.go)
- `packages/datasource/Magefile.go`, `go.mod`, `go.sum`
- `"backend": true` and `"executable": "gpx_jaeger"` from `plugin.json`
- `proxyMode`, `jaegerInternalURL`, and `jaegerPublicURL` fields from `types.ts`
- Custom `ConfigEditor` component (standard Grafana datasource `url` field is sufficient)
- Makefile `build-backend` and `vet-backend` targets

### Result

The datasource uses Grafana's standard `url` field — the browser-accessible Jaeger origin — for both the panel iframe and all API calls (`/api/services`, `/api/traces`, etc.). There is no custom `ConfigEditor`, no plugin-specific `jsonData` fields, and no server-side proxy path. The standard Grafana datasource config page provides the URL input.

---

## Phased Roadmap

The phases are ordered to reduce project risk as early as possible. The first two phases are deliberately minimal — manual verification only — to validate the core hypotheses (the iframe approach works; two plugins can cooperate) before investing in automation, polish, or the datasource plugin.

---

### Phase 0 — Proof of concept

**Goal:** Validate the core hypothesis: a Jaeger trace renders correctly inside a Grafana panel iframe, and `uiEmbed=v0` produces an acceptable embedded UX. If this does not work, the entire approach is invalidated before any real investment.

**Tasks:**
1. Start Grafana locally via Docker with a plugin directory mounted:
   ```bash
   mkdir -p /tmp/jaeger-panel/dist
   # write a minimal plugin.json and module.js by hand or copy from any scaffold
   docker run --rm -p 3000:3000 \
     -v /tmp/jaeger-panel:/var/lib/grafana/plugins/jaegertracing-jaeger-panel \
     -e GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=jaegertracing-jaeger-panel \
     grafana/grafana:latest
   ```
2. Write the simplest possible panel: a React component that hardcodes an `<iframe src="http://localhost:16686/trace/SOME_ID?uiEmbed=v0" />` with a known trace ID from a locally running Jaeger.
3. Add the panel to a Grafana dashboard and visually inspect:
   - Does the Jaeger trace timeline render inside the panel?
   - Does `uiEmbed=v0` hide the nav bar correctly?
   - Does the standalone pop-out link appear?
   - Is the layout (height, scrolling) acceptable?
4. Repeat with a diff URL (`/trace/A...B?uiEmbed=v0`) to confirm trace diff also renders.
5. Repeat with the search page (`/search?service=frontend&uiEmbed=v0`) to confirm search embeds usably.

**No CI at this phase.** This is a manual spike. The output is a go/no-go decision and a list of `uiEmbed` gaps to address in Jaeger UI.

**Exit criterion:** Developer has visually confirmed the iframe approach works and documented any UX issues with the current `uiEmbed` flags.

**Status: ✅ COMPLETE (2026-05-06)**
- Plugin scaffolded with `@grafana/create-plugin`, lives at `integrations/grafana-plugin/` in the jaeger main repo.
- Panel plugin implemented: `src/types.ts`, `src/module.ts`, `src/components/SimplePanel.tsx`.
- Plugin built with webpack and loaded into Grafana via Docker (`GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS`).
- Jaeger + HotROD started via `examples/hotrod/docker-compose.yml`.
- **Confirmed**: single trace (`/trace/{id}?uiEmbed=v0`) renders correctly inside the Grafana panel iframe.
- **uiEmbed gap identified**: search page (`/search?uiEmbed=v0`) auto-submits a traces query on load before the user picks a service, producing "HTTP Error: parameter 'service' is required". Fix needed in jaeger-ui: suppress the auto-query when `uiEmbed` is set and no service is pre-selected. Workaround: pass `service=<name>` in the URL — confirmed working. The panel's search mode should accept an optional service param from panel options or a dashboard variable. This is an input for Phase 2.
- **Confirmed**: diff mode (`/trace/A...B?uiEmbed=v0`) renders correctly.
- **uiEmbed gap — zoom isolation**: browser zoom applies to Grafana chrome only; the iframe renders at its own zoom level. This is a fundamental iframe constraint. No fix available at the panel level; users must zoom inside the iframe separately (or use the standalone pop-out link).
- **uiEmbed gap — diff graph resize**: the TraceDiff graph does not reflow when the Grafana panel is resized. The timeline view is unaffected. The diff graph likely uses a fixed or one-time-computed SVG layout. Fix needed in jaeger-ui: listen for window resize (or a `postMessage` resize signal) and re-layout the graph. This is an input for Phase 4.
- **uiEmbed gap — timeline column resize handle missing**: in the standalone Jaeger UI the timeline columns (span name / duration bar) are individually resizable by dragging the column boundary. Inside the Grafana iframe the drag handle does not appear on mouseover at all. Root cause unknown — likely a CSS pointer-events or z-index conflict introduced by the iframe stacking context, or a `mousemove` event that does not fire correctly when the cursor is at the iframe boundary. Needs investigation in jaeger-ui; filed for Phase 4.

---

### Phase 1 — Panel plugin MVP (2–3 days)

**Exit criterion:** A developer can add the panel to a Grafana dashboard, type a trace ID into panel options, and see the Jaeger trace timeline render inside the panel.

**Status: ✅ COMPLETE (2026-05-06)**
- Plugin moved to standalone repo `github.com/jaegertracing/grafana-plugin`.
- `src/components/JaegerPanel.tsx` implements the iframe panel with `replaceVariables()` applied to all text fields (trace IDs, service, base URL), enabling Grafana dashboard variable interpolation (e.g. `${traceId}`).
- Options editor covers: mode (trace/diff/search), Jaeger base URL, trace ID(s), service (search mode), and three embed-flag toggles (hide minimap, hide trace summary, collapse trace header).
- Search mode requires a service to be set before rendering the iframe; shows a hint otherwise. Workaround for the Phase 0 auto-query bug until Phase 2 fixes it in jaeger-ui.
- Provisioned dashboard (`provisioning/dashboards/dashboard.json`) with 5 panels covering all three modes and a `$traceId` textbox variable.
- 5 Playwright e2e tests (`tests/panel.spec.ts`) covering hint states and iframe URL correctness; all passing.
- `docker-compose.yaml` runs Grafana only; Jaeger+HotROD run as a separate stack.
- `Makefile` with `build`, `dev`, `test`, `lint`, `server`, `e2e` targets.

---

### Phase 2 — Datasource plugin + CI (1–2 weeks) — ✅ COMPLETE (2026-05-07)

**Goal:** A working datasource plugin connected to the panel plugin so Explore and dashboards are usable end-to-end, plus CI that prevents regressions.

**What was built:**
- Datasource plugin (`JaegerDataSource`) with `testDatasource()`, `getServices()`, `getOperations()`, and `query()`.
- Search results DataFrame: `traceID` (with "Open in Explore" data link), `traceName` (service: operation of root span), `spanCount`, `duration` (µs).
- Trace lookup DataFrame: single-row `traceID` frame with `preferredVisualisationPluginId` routing to the Jaeger panel.
- `QueryEditor` with search/trace modes, service/operation selects (populated live from Jaeger), tags, duration, limit fields. Service field accepts Grafana variable syntax (e.g. `${service}`).
- Grafana template variable interpolation via `getTemplateSrv().replace()` for all query string fields.
- Panel DataFrame-driven rendering path: single-row `traceID` frame → iframe; multi-row or no data → falls through to panel-options path.
- Panel minimum iframe height (600px) so the trace is usable in Explore's split pane.
- Provisioned two-panel dashboard: narrow search results table (w=6) + wide trace detail panel (w=18), connected via `$traceId` variable. Clicking "Open in dashboard" sets the variable and rerenders inline.
- CI pipeline: build, lint, unit tests, Playwright e2e tests.
- Provisioned datasource with stable `uid: jaeger` for reliable dashboard references.

**Validated (2026-05-07):**
- Service discovery and trace search call Jaeger's API directly from the browser via `jaegerPublicURL`.
- Search results table shows `traceName`, `spanCount`, `duration`, with two context-menu links per row: "Open in dashboard" (sets `$traceId` variable, stays on page) and "Open in Explore" (`splitOpen()`, second pane renders trace iframe).
- `preferredVisualisationPluginId` routes trace-ID lookup results to the Jaeger panel automatically in Explore.
- Iframe base URL is read from the datasource's `jaegerPublicURL` field; if unset, the panel shows a "Select a Jaeger datasource" hint. Production deployments must configure `jaegerPublicURL` in the datasource settings.

**Constraints carried forward to Phase 3:**
- Iframe base URL (`jaegerPublicURL`) must be configured in the datasource settings. Phase 3 consolidates this as the single source of truth and removes the panel-level URL field.
- `splitOpen()` in Explore opens a cramped half-width second pane (same behaviour as the built-in Jaeger datasource). The two-panel dashboard pattern is the recommended UX for trace viewing.

**Exit criterion met:** Grafana Explore with the Jaeger datasource shows a search results table with trace IDs. Clicking a trace ID either opens it inline on the dashboard or in a second Explore pane. CI passes.

---

### Phase 3 — Go backend binary: proxy mode — ✅ COMPLETE then REMOVED (2026-05-09)

> **Note:** The Go binary was built and validated, then removed. The content below is retained as historical context explaining what was built and why it was removed. The current datasource is frontend-only; see the Post-completion decision at the end of this section.

**Goal (historical):** Route datasource API calls through the Grafana server to reach Jaeger deployments not directly accessible from the browser. The iframe itself is unaffected — it always loads from `jaegerPublicURL`.

**Authentication context (historical):**

When Grafana and Jaeger are deployed in the same private network (not individually SSO-protected), all browser-to-Jaeger requests are blocked because Jaeger has no public address. The Go binary solved the API-call side of this: `/api/traces`, `/api/services`, `/api/operations` were forwarded server-side, so the search results table and health check worked. The iframe still required a browser-reachable Jaeger origin for the SPA (see Proxy Mode Limitations below).

Additionally, Jaeger supports `--query.bearer-token-propagation`: when enabled, Jaeger forwards the incoming `Authorization` header to the trace storage backend for per-user access control. The Go binary propagated the `Authorization` header from the Grafana request to Jaeger for this purpose. Note: this only covered the datasource API calls (search, services, operations); the iframe always loads from `jaegerPublicURL` directly in the browser and is outside the Go binary's scope entirely.

**What was built (historical):**

- `packages/datasource/pkg/main.go`: entry point using `datasource.Manage` from `grafana-plugin-sdk-go`.
- `packages/datasource/pkg/plugin.go`: `JaegerDatasource` struct; `CheckHealth` (verifies `/api/services` reachability); `CallResource` (routes all requests through the proxy when proxy mode is on).
- `packages/datasource/pkg/proxy.go`: `proxyToJaeger` forwards the full request (method, path, query string, body, safe headers) to the configured internal Jaeger URL; propagates `Authorization` header for bearer token pass-through.
- `packages/datasource/Magefile.go` + `go.mod` (`tool github.com/magefile/mage`): Go binary built via `go tool mage build:linuxARM64 build:linux` without requiring a globally installed `mage`.
- `packages/datasource/src/components/ConfigEditor.tsx`: "Proxy mode" toggle, "Jaeger UI URL" field (direct mode), and "Jaeger internal URL" field (proxy mode).
- `packages/datasource/src/types.ts`: `jaegerPublicURL` (browser-accessible Jaeger URL, used by the panel iframe in both modes); `jaegerInternalURL` (server-accessible URL, used by Go proxy in proxy mode).
- `packages/datasource/src/datasource/datasource.ts`: routed all API calls through `/api/datasources/uid/<uid>/resources/...` when `proxyMode=true`, so service discovery, trace search, and health check all flowed through the Go proxy.
- `packages/panel/src/components/JaegerPanel.tsx`: reads `jaegerPublicURL` from the datasource's `jsonData` via `getDataSourceSrv().getInstanceSettings(uid)`, using it as the iframe base in all modes. `datasourceUid` panel option added; `DataSourcePicker` custom editor replaces the old text-field `jaegerBaseUrl`.
- Provisioned `Jaeger (proxied)` datasource (`uid: jaeger-proxied`) for testing alongside the direct-mode datasource; provisioned `Jaeger Traces (proxied)` dashboard.

**Validated (2026-05-08, historical):**
- Health check: "Connected to Jaeger at http://jaeger:16686" when proxy mode is enabled with a reachable Jaeger.
- Search results table populates via `/api/datasources/uid/jaeger-proxied/resources/api/traces?...` (visible in DevTools Network tab).
- Search panel populates correctly through the proxy. The trace detail panel also rendered because `jaegerPublicURL` pointed to a locally accessible Jaeger — not because of proxy mode. In a deployment where Jaeger is internal-only, the trace panel iframe would still fail.
- Bearer token forwarding: code was in place (`Authorization` header propagated to Jaeger API calls) but **not tested** end-to-end. Scope was limited to datasource API calls only; the iframe is unaffected.

**Proxy Mode Limitations: CSP Sandbox**

Proxy mode provides server-side proxying of Jaeger's JSON API calls. It does **not** proxy the Jaeger SPA (HTML + JavaScript) to the iframe.

Grafana unconditionally adds `Content-Security-Policy: sandbox` to every response that passes through its proxy infrastructure, regardless of plugin type or proxy mechanism:

- **CallResource** (`/api/datasources/uid/<uid>/resources/*`): `pkg/plugins/manager/client/client.go:SetCSPHeader` — applied unconditionally to all plugin types.
- **DataProxy** (`/api/datasources/proxy/uid/<uid>/*`): `pkg/util/proxyutil/reverse_proxy.go:modifyResponse` → `client.SetCSPHeader` — same sandbox on every proxied response.
- **App Plugin frontend routes** (`/a/<plugin-id>/*`): serve `hs.Index` (the Grafana shell), not a raw HTTP proxy — cannot proxy Jaeger HTML/JS.

The `sandbox` CSP directive prohibits script execution. The Jaeger UI is a React SPA that requires JavaScript to run. Therefore the iframe `src` must always point to a browser-reachable Jaeger origin; it cannot go through any Grafana proxy path.

What this means in practice:
- **API proxy works**: datasource TypeScript routes `/api/traces`, `/api/services` etc. through `CallResource` — JSON responses, no script execution, sandbox does not affect them.
- **SPA proxy does not work**: the iframe `src` cannot be set to any Grafana proxy path.

**Path forward for SSO deployments: same-origin reverse proxy**

The SSO iframe problem is not about reachability — it is about **cross-origin cookies**. The typical enterprise scenario:

- Jaeger is browser-accessible at `https://jaeger.mydomain.com`, protected by corporate SSO.
- Grafana is at `https://grafana.mydomain.com`, protected by the same SSO.
- The user is already authenticated in Grafana. But the panel's `<iframe src="https://jaeger.mydomain.com/...">` is a cross-origin request from the Grafana page.
- Modern browsers block third-party cookies in iframes. The Jaeger SSO session cookie (scoped to `jaeger.mydomain.com`) is not sent with the iframe navigation from `grafana.mydomain.com`.
- The SSO provider redirects inside the iframe to its login page, which itself typically blocks iframe rendering (clickjacking protection). Result: broken iframe.

The root cause is the cross-origin iframe. The fix is to serve Jaeger from the **same origin as Grafana**, eliminating the cross-origin request entirely.

**Recommended approach: ingress path prefix**

Configure the upstream reverse proxy (nginx, Envoy, AWS ALB, Kubernetes ingress) to route `https://grafana.mydomain.com/jaeger/` to the internal Jaeger service. Set `jaegerPublicURL` in the datasource to `https://grafana.mydomain.com/jaeger`. The iframe `src` becomes `https://grafana.mydomain.com/jaeger/trace/...` — same origin as Grafana, no SSO redirect, no third-party cookie issue.

```
Browser ──HTTPS──▶ Ingress (grafana.mydomain.com)
                       │
           ┌───────────┴──────────────────────────────────┐
           │ /         → Grafana                          │
           │ /jaeger/* → Jaeger (internal)                │
           └──────────────────────────────────────────────┘
```

- **No plugin changes needed.** Set the datasource **URL** to `https://grafana.mydomain.com/jaeger`.
- SSO is handled by the ingress for all `grafana.mydomain.com` traffic.
- If `--query.bearer-token-propagation` is enabled, the ingress can forward the user's JWT for per-user storage access control.

**Proxy approaches: two options, both validated**

Two approaches exist for the ingress:

1. **`base_path` + transparent proxy**: set `extensions.jaeger_query.base_path=/jaeger` in the Jaeger config. The ingress routes `grafana.mydomain.com/jaeger/*` → `jaeger-internal:16686/jaeger/*` with no path transformation. Jaeger handles the prefix natively. Simple, no response-body rewriting needed. Downside: Jaeger's own standalone URL (`jaeger.mydomain.com/`) also needs the prefix, or a second Jaeger instance without `base_path` must be run.

2. **Prefix stripping only** (since Jaeger 2.18.0): the ingress strips `/jaeger` before forwarding (Jaeger sees `/`). Since Jaeger 2.18.0 the UI auto-detects its base path from `window.location` via an inline script ([ADR-009](https://github.com/jaegertracing/jaeger/blob/main/docs/adr/009-ui-base-path-auto-detection.md)) — no response-body rewriting of `<base href>` is needed. Allows one Jaeger instance to serve at both its own domain and under Grafana's origin prefix simultaneously.

Both options are validated end-to-end in `examples/reverse-proxy/` — see Phase 3.5.

**Current plugin role**: The datasource `url` field is the single configuration point — the browser-accessible Jaeger origin used for both the iframe and all API calls. It is intentionally generic — operators point it at whatever browser-accessible Jaeger origin they have. The plugin does not prescribe the deployment topology.

**Limitations of the ingress approach:**
- Requires ingress-level configuration by ops; not self-contained in the plugin.
- No fallback for deployments where the ingress cannot be reconfigured.

**Post-completion decision (2026-05-09):** The Go binary was removed after determining it was fully redundant. All API calls, health checks, and URL resolution are handled by the TypeScript datasource calling Jaeger directly from the browser. See [Backend Binary: Decision](#backend-binary-decision) above.

**Exit criterion met (then superseded):** Proxy mode worked for datasource API calls. Decision: simplify to frontend-only plugin.

---

### Phase 3.5 — Reverse proxy e2e test (investigation milestone)

**Goal:** Validate programmatically that the Grafana plugin works when Jaeger is served behind a reverse proxy under a path prefix. Two proxy approaches are tested:

- **Option 1** (transparent proxy + `base_path`): Jaeger configured with `extensions.jaeger_query.base_path`, proxy passes paths through unchanged.
- **Option 2** (prefix stripping only): proxy strips the prefix; Jaeger's inline base-path detection script (since 2.18.0) handles the rest without any response-body rewriting.

**Implementation:** `examples/reverse-proxy/` in this repo — a self-contained docker-compose stack and a shell test script that runs without a browser.

**Stack** (`examples/reverse-proxy/docker-compose.yaml`):

- `jaeger1`: internal only (no host `ports:`), configured with `--set extensions.jaeger_query.base_path=/jaeger/ui`.
- `jaeger2`: internal only, no `base_path` (serves at root `/`).
- `hotrod1`, `hotrod2`: generate traces so the API returns real data.
- `httpd-option1`: Apache proxying `http://localhost:18080/jaeger/ui/*` → `http://jaeger1:16686/jaeger/ui/*` (transparent, no path transformation). Exposed to host at `:18080`.
- `httpd-option2`: Apache proxying `http://localhost:18081/jaeger/ui/*` → `http://jaeger2:16686/*` with prefix stripping (`ProxyPass "/jaeger/ui/" "http://jaeger2:16686/"`). No `Substitute` rewriting needed since 2.18.0. Exposed to host at `:18081`.
- `grafana`: Grafana with both datasources provisioned, exposed at `:18082`.

**Test script** (`examples/reverse-proxy/test.sh`): uses `curl` and `jq` to assert without a browser:

```
Option 1:
  1. GET http://localhost:18080/jaeger/ui/
     Assert: HTTP 200, response body contains inline script marker
             data-inject-target="BASE_URL"
  2. GET http://localhost:18080/jaeger/ui/api/services
     Assert: HTTP 200, JSON body has .data array (non-empty after HotROD warmup)
  3. For each asset URL found in index.html: GET it through the proxy
     Assert: all HTTP 200 (no broken asset paths)

Option 2:
  4. GET http://localhost:18081/jaeger/ui/
     Assert: HTTP 200, response body contains inline script marker
             (base path auto-detected by browser from window.location)
  5. GET http://localhost:18081/jaeger/ui/api/services
     Assert: HTTP 200, JSON body has .data array
  6. Same asset check as step 3
```

The Grafana API call path (datasource DataProxy → Jaeger) is validated separately via the existing e2e tests. This script focuses purely on the ingress proxy layer.

**Status: ✅ COMPLETE — validated locally via `make test-reverse-proxy` (Jaeger 2.18.0, Grafana 12.4.0)**

> Tests run locally via `make test-reverse-proxy` and in CI as the `reverse-proxy-tests` job. See CONTRIBUTING.md.

The test suite covers two layers:

**Proxy layer** (curl/jq, `examples/reverse-proxy/test.sh`): 12 assertions pass:
- Both options serve `index.html` with the inline base-path detection script (`data-inject-target="BASE_URL"` marker present).
- `/api/services` returns non-empty data through both proxies.
- All JS/CSS assets return HTTP 200 through both proxy paths.
- Datasource `url` is correctly provisioned for each datasource.

**Grafana integration layer** (Playwright, `tests/reverse-proxy.spec.ts`): 6 assertions pass:
- `/api/services` returns data via the datasource `url` directly from the browser (browser → httpd → Jaeger).
- Datasource `url` is correctly provisioned to the proxy address for each datasource.
- Config page loads and the datasource name is correct for each datasource.

Note: `GET /api/datasources/uid/:uid/health` returns "plugin unavailable" for frontend-only plugins (no Go backend process) in Grafana 12.4.0 — this is expected.

**Conclusion**: Both proxy approaches confirmed working end-to-end through Grafana 12.4.0 with Jaeger 2.18.0. Since Jaeger 2.18.0, Option 2 (prefix stripping) requires only a standard reverse proxy with no response-body rewriting, making it the simpler choice for deployments that need one Jaeger instance accessible under multiple prefixes.

Reference configurations: `examples/reverse-proxy/httpd-option1.conf` and `examples/reverse-proxy/httpd-option2.conf` in this repo.

**Exit criterion met.**

---

### Phase 4 — Jaeger UI `uiEmbed` improvements (jaeger-ui repo, 1–2 days)

**Goal:** Address the UX gaps identified in Phase 0 so the embedded experience is clean.

**Tasks:**
1. Audit existing `uiEmbed` flags against the embedded UX observed in Phase 0.
2. Add `uiTimelineHideViewSwitcher=1` to suppress the view-type toolbar (timeline/graph/flamegraph/statistics switcher) when only the timeline is needed.
3. Add any other flags identified in Phase 0 (e.g., hiding the search bar in the trace detail header, fixing the diff graph resize on panel resize).
4. Files: `packages/jaeger-ui/src/utils/embedded-url.ts`, `packages/jaeger-ui/src/types/embedded.ts`, `TracePageHeader/AltViewOptions.tsx`.

**Exit criterion:** The embedded trace view has no extraneous chrome; the UX is comparable to a native panel.

---

### Phase 5 — `uiLinkPatterns` (jaeger-ui repo, 3–5 days)

**Goal:** Allow the Grafana plugin to inject span-to-Grafana link patterns at embed time without requiring Jaeger server reconfiguration.

**Tasks:**
1. Extend `EmbeddedState` (`types/embedded.ts`) with `linkPatterns?: LinkPatternsConfig[]`.
2. Parse `uiLinkPatterns=<base64url-json>` in `embedded-url.ts`.
3. In `model/link-patterns.ts`, merge embedded patterns with config-file patterns (embedded takes precedence).
4. Add a "Span link patterns" section to the Grafana datasource `ConfigEditor`; base64-encode the patterns and append to every iframe URL.

**Exit criterion:** A user can configure a span-to-Grafana-Explore link in the datasource config and see it appear on span attributes in the embedded trace view.

---

## Deliverables Summary

| Deliverable                                        | Ph 0 | Ph 1 | Ph 2 | Ph 3 | Ph 4 | Ph 5 |
|----------------------------------------------------|:----:|:----:|:----:|:----:|:----:|:----:|
| Manual PoC: iframe in Grafana panel                | ✅    |      |      |      |      |      |
| Plugin scaffolding (jaeger repo)                   |      | ✅    |      |      |      |      |
| Panel plugin (iframe, trace + diff)                |      | ✅    |      |      |      |      |
| Datasource plugin + QueryEditor                    |      |      | ✅    |      |      |      |
| `preferredVisualisationPluginId` on frames         |      |      | ✅    |      |      |      |
| Panel DataFrame-driven rendering path              |      |      | ✅    |      |      |      |
| Search results with trace-ID data links            |      |      | ✅    |      |      |      |
| Variable support                                   |      |      | ✅    |      |      |      |
| CI workflow + unit tests + Playwright e2e          |      |      | ✅    |      |      |      |
| `jaegerPublicURL` as single source of truth        |      |      |      | ✅    |      |      |
| `DataSourcePicker` in panel options                |      |      |      | ✅    |      |      |
| Datasource frontend-only (no Go binary)            |      |      |      | ✅    |      |      |
| Reverse proxy e2e: curl/jq + Playwright (both opt) |      |      |      | ✅    |      |      |
| Grafana plugin catalog submission + signing        |      |      |      |       |      | ⬜    |
| `uiEmbed` flag additions (jaeger-ui)               |      |      |      |      | ✅    |      |
| `uiLinkPatterns` URL param (jaeger-ui)             |      |      |      |      |      | ✅    |

---

## References

- Grafana CallResource CSP: `pkg/plugins/manager/client/client.go:SetCSPHeader` (grafana/grafana)
- Grafana DataProxy CSP: `pkg/util/proxyutil/reverse_proxy.go:modifyResponse` (grafana/grafana)
- Grafana App Plugin routes: `pkg/api/api.go` lines 175–176, handler `hs.Index` (grafana/grafana)
- Grafana DataProxy route configuration: `plugin.json` `routes` array
