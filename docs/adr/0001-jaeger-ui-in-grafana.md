# ADR 0001: Embedding Jaeger Trace Visualizations in Grafana — Integration Approach

* **Status**: Decided
* **Last Updated**: 2026-05-08

---

## TL;DR

Surfacing Jaeger's trace and diff visualizations in Grafana involves two independent questions: (1) how deep is the Grafana integration — dashboard panel only, or full Explore search/drill-down? and (2) how is Jaeger UI rendered inside Grafana — via iframe, extracted React components, or a Web Component? The two questions can be decided separately. **Decision: iframe rendering (Option A), Level 2 integration (dashboard panel + Explore datasource).**

---

## Context & Problem

Grafana is a widely-used observability platform. Users who deploy Jaeger often also use Grafana and want to see trace visualizations — the full waterfall/timeline, the DAG graph view, and trace diff — without leaving Grafana.

Grafana ships a built-in Jaeger datasource plugin (`public/app/plugins/datasource/jaeger/` in grafana/grafana). It queries the Jaeger backend and renders results using Grafana's own `TraceView` component. That rendering is functional but is missing several capabilities present in Jaeger UI:

- Multi-view: DAG/graph, flamegraph, statistics, logs view
- Trace diff / side-by-side comparison (`TraceDiff`)
- Minimap, critical path highlighting, service filter, span search

---

## Background: Grafana's Datasource/Panel Architecture

Grafana cleanly separates data fetching (datasource plugins) from rendering (panel plugins):

- A **datasource plugin** runs a query against a backend, returns one or more DataFrames, and has no say in how those frames are rendered. The datasource API (`DataSourcePluginComponents` in `packages/grafana-data/src/types/datasource.ts`) exposes only editor slots: `QueryEditor`, `ConfigEditor`, `QueryEditorHelp`, `MetadataInspector`. There is no visualization slot.
- A **panel plugin** receives DataFrames from whatever datasource the user configured and renders them.

In Grafana **Explore**, the routing from DataFrames to visualization components is mostly hardcoded in Explore core (`public/app/features/explore/Explore.tsx`). When a datasource returns frames tagged `preferredVisualisationType: 'trace'`, Explore renders them using the hardcoded `TraceViewContainer` component — there is no registry that plugins can add to for this type. There is one escape hatch: a frame can set `preferredVisualisationPluginId` to the ID of any panel plugin, and Explore will route that frame to that panel instead of the hardcoded renderer. This is the mechanism a community datasource plugin can use to redirect trace frames to a custom panel.

The normal Grafana flow for navigating from a list of traces (or logs containing trace IDs) to a single trace detail is:

1. A panel (logs, table, etc.) has a data link on a `traceId` field.
2. Clicking the link fires a `splitOpen()` action, opening a second Explore pane side-by-side.
3. The new pane runs a trace query via the configured datasource and renders the result.

This "split pane" flow is entirely driven through Explore; it is not available in static dashboards.

---

## Background: Jaeger UI's Existing Embedded Mode

Jaeger UI has a URL-parameter-driven embed mode (`?uiEmbed=v0`) that suppresses the top navigation bar (`Page.tsx:37`) and reveals a "pop-out to standalone" link in the trace header (`TracePageHeader.tsx:233`). Additional flags:

| URL parameter               | Effect                                        |
|-----------------------------|-----------------------------------------------|
| `uiEmbed=v0`                | Hide top nav, show standalone pop-out link    |
| `uiSearchHideGraph=1`       | Hide the search service graph                 |
| `uiTimelineCollapseTitle=1` | Start with trace header collapsed             |
| `uiTimelineHideMinimap=1`   | Hide the minimap / span graph                 |
| `uiTimelineHideSummary=1`   | Hide the trace summary row                    |

These flags are parsed once from `window.location.search` at page load (`embedded-store.ts:24`). They are the only embed affordances currently in Jaeger UI.

---

## Integration Scope: Two Levels

Before choosing a rendering approach, we need to decide how deeply to integrate with Grafana. These are independent decisions; the rendering approach applies equally to both.

### Level 1: Dashboard Panel (Trace ID → Visualization)

A Grafana panel plugin receives a trace ID — from a dashboard variable, from a panel configuration field, or from a data link in another panel — and renders the Jaeger trace visualization for that ID. This does not touch Explore at all.

**What the user experience looks like:**
- A dashboard has a variable `$traceId` (set manually, from a URL param, or drilled down from a table row via a data link).
- The panel plugin renders the trace for `$traceId`.
- For trace diff, two variables `$traceIdA` and `$traceIdB` are used.

**The two-panel dashboard pattern (primary intended UX):**

The best dashboard experience combines a search results table with the Jaeger panel on the same dashboard, connected via a `$traceId` variable:

1. A **table panel** (using the Jaeger datasource) shows search results with `traceID` and `spanCount` columns.
2. Each `traceID` cell has a data link that updates `$traceId` and stays on the current page: `d/${__dashboard.uid}?var-traceId=${__value.raw}` (or use Grafana's variable setter link syntax).
3. The **Jaeger panel** below or beside the table reads `${traceId}` from the dashboard variable and renders the trace iframe.

Clicking a row in the table updates the URL variable and the trace panel rerenders inline — no page navigation, no split-pane cramping, full panel width for the trace view.

This is architecturally cleaner than `splitOpen()` for iframe-based rendering and is the pattern to document and build example dashboards around.

**What is required:**
- One panel plugin. No datasource work.
- The trace ID must reach the panel via dashboard variables or panel options. This is standard Grafana.

**Limitations:**
- No search UI built into the panel itself. The table panel requires the Jaeger datasource to be configured.
- No Explore integration. The Grafana log-to-trace split-pane flow still uses Grafana's built-in `TraceView`.

### Level 2: Full Explore Integration (Search → List → Detail)

A community Jaeger datasource plugin + panel plugin pair that replaces the built-in Jaeger datasource in Explore, enabling the full flow: query → list of traces → click to see detail — all rendered through Jaeger UI.

**What the user experience looks like:**
- User opens Explore, selects the community Jaeger datasource.
- Executes a search query (service, operation, tags, time range).
- Results are either rendered as Jaeger's search page in an iframe, or as a Grafana table with trace IDs.
- Clicking a trace ID opens the Jaeger trace view (iframe or native components).
- The datasource sets `preferredVisualisationPluginId` on its result frames, routing them to the Jaeger panel plugin automatically.

**Why `splitOpen()` is a poor fit for the iframe panel:**

Grafana's `splitOpen()` mechanism — used internally when clicking a trace ID in Explore — opens a second Explore pane side-by-side at half the viewport width. The second pane is a full Explore panel with its own query builder form at the top (in Trace ID mode), occupying substantial vertical space before the trace view begins. The built-in Jaeger datasource has exactly the same experience. At half-screen width, the Jaeger timeline is cramped and the column drag handles stop working.

There is no "compact" split-pane mode in Grafana. The half-width full-Explore experience is the same for all datasources that use `splitOpen()`. For our iframe panel, it is particularly uncomfortable because Jaeger UI needs horizontal space that is simply not available.

**Consequence for our plugin:** `splitOpen()` (triggered by clicking a trace ID data link in our search results table) works but is awkward. It is retained as a convenience for users already in Explore who want a quick look at a trace. The primary intended UX for trace viewing is the dashboard two-panel pattern described under Level 1.

**What is required:**
- One panel plugin (same as Level 1).
- One community datasource plugin that reimplements the Jaeger datasource.

**Datasource reimplementation scope:**
The existing built-in Jaeger datasource does: HTTP calls to Jaeger Query API (`/api/traces`, `/api/services`, `/api/operations`), response transformation to DataFrames, and a `QueryEditor` UI. For the iframe approach the datasource does not need to transform full trace data — it only needs to pass trace IDs (or serialized search query parameters) as DataFrame values; the panel constructs the Jaeger UI URL from them. The full trace payload never flows through Grafana's data pipeline. This is substantially simpler than the built-in datasource's transformation layer.

For the search results case, two sub-approaches exist:
- **Thin datasource**: Return only trace IDs and metadata (service, operation, duration) as a DataFrame. The panel renders a Grafana table; clicking a row sets a variable and renders the trace. Standard Grafana master/detail pattern.
- **Delegate to Jaeger UI**: The datasource returns the serialized search query parameters as a single-value DataFrame. The panel renders Jaeger's own search results page in an iframe (`/search?service=...&uiEmbed=v0`). The user interacts with Jaeger UI's search results natively inside Grafana. This delegates the search UX entirely to Jaeger UI, including its service graph and result list.

**Why not modify the built-in datasource instead?** The built-in Jaeger datasource is owned by Grafana core (grafana/grafana). Adding `preferredVisualisationPluginId` to its response frames would require a PR to Grafana's repo and acceptance by the Grafana team. A community datasource plugin is fully under Jaeger project control, published independently through the Grafana plugin catalog, and does not require any Grafana upstream changes. Users would configure Explore to use the community plugin instead of the built-in one.

---

## Rendering Options

The following options apply to both integration levels above. The panel plugin implements one of these.

### Option A: iframe

Build a panel plugin that renders `<iframe src={jaegerUrl} width="100%" height="100%" />`, constructing the URL from trace IDs or query parameters passed in via DataFrames or panel variables.

```
# Single trace (Level 1 or 2)
{jaeger-query-url}/trace/{traceId}?uiEmbed=v0

# Trace diff (Level 1)
{jaeger-query-url}/trace/{traceIdA}...{traceIdB}?uiEmbed=v0

# Search results (Level 2, delegated)
{jaeger-query-url}/search?service={service}&operation={op}&uiEmbed=v0&uiSearchHideGraph=1
```

**What needs to happen:**

*Jaeger Query service:*
- Must be reachable from the user's browser. This is true in any deployment where users currently browse to Jaeger UI directly.
- Must not set `X-Frame-Options` or `CSP: frame-ancestors` blocking embedding. Jaeger does not set these headers today; this should remain the case (or a `--query.http.allow-embedding` flag should be added to make it explicit).
- CORS configuration is irrelevant to iframe navigation; it only applies to `fetch`/XHR.

*Panel plugin:*
- Reads trace ID(s) or query params from the DataFrame it receives or from panel options/variables.
- Constructs the Jaeger UI URL.
- Renders the iframe.
- Bridges Grafana panel resize events to the iframe so the timeline reflows (via `postMessage` or simply by iframe CSS fill).

*Jaeger UI changes (optional):*
- `uiTimelineHideToolbar=1` or similar to hide the view-type switcher for a cleaner embed.
- `uiLinkPatterns=<base64-json>` to let the panel plugin inject deployment-specific span-to-Grafana link patterns without requiring Jaeger server reconfiguration (see span linking below).

**Span-to-external linking:**
Jaeger UI has a link-pattern system (`model/link-patterns.ts`) that generates URLs from span attributes using templates like `#{spanID}`, `#{trace.traceID}`, `#{http.url}`, with time formatters. These open in a new tab and can point at a Grafana Explore URL. Current limitation: patterns are loaded from `jaeger-ui.config.json` at server startup; the panel plugin cannot inject Grafana-specific URLs (hostname, datasource IDs) at embed time without server reconfiguration. Adding a `uiLinkPatterns` URL parameter would solve this. Until then, patterns must be pre-configured on the Jaeger server side.

**Limitations:**
- **Theme mismatch**: The iframe renders with Jaeger UI's own CSS. The standalone pop-out link (`TracePageHeader.tsx:233`) gives users an escape hatch to the full Jaeger UI.
- **No Grafana time range sync**: Not relevant for the trace detail view (trace-ID-driven). Relevant if the search page is embedded — the Jaeger search time range picker would not reflect Grafana's dashboard time range. This could be addressed by passing Grafana's time range as URL parameters to the search iframe.
- **Accessibility**: Keyboard navigation and screen readers do not cross iframe boundaries.
- **Requires browser-reachable Jaeger**: The iframe `src` must be an origin the user's browser can reach. In SSO-protected deployments where Jaeger is internal-only, the iframe will fail (see ADR 0002 for the proxy mode design and its limitations).

**Effort:** Low. A working prototype is 1–2 days. A polished plugin with variable support and the community datasource is 2–4 weeks total.

---

### Option B: Extract Components as an npm Package

Refactor the trace and diff rendering components into a standalone npm package (`@jaegertracing/react-trace-view`). The panel plugin imports the package and renders components natively.

Key components to extract:
- `TraceTimelineViewer` (`TracePage/TraceTimelineViewer/index.tsx`)
- `TraceDiffGraph` (`TraceDiff/TraceDiffGraph/TraceDiffGraph.tsx`)
- `plexus` (`packages/plexus/`) — the graph library, currently `private`

**Current coupling that must be removed:**

- **Redux**: `TraceTimelineViewer` is wrapped in `connect()` (`index.tsx:291`). `TraceDiff` is also `connect()`-ed (`TraceDiff.tsx:197`). Both must be converted to accept data as props. The underlying `TraceTimelineViewerImpl` already takes `IOtelTrace` as a prop — the Redux layer is thin.
- **Zustand**: Three module-singleton stores (`useLayoutPrefsStore`, `useTraceTimelineStore`, `store.layout.ts`). Must be scoped per component instance so two trace panels on the same dashboard don't share collapse state.
- **React Router**: `TraceDiffGraph` calls `useLocation()` to read `uiFind` from the URL (`TraceDiffGraph.tsx:164`). Must become a prop.
- **Ant Design**: ~24 files in `TracePage/` import from `antd`. Grafana does not ship antd. The extracted package must either bundle antd (large) or declare it as a peer dependency (version management burden across Grafana and Jaeger releases).
- **Less/CSS variables**: Styles reference tokens from `vars.css`. The package must bundle its styles or document what the host must provide.

**What this does and does not give you:**
Extracting the components does not automatically provide Grafana theming or Grafana data links. The components still own their own CSS and antd tokens; they still look like Jaeger UI. Grafana theme alignment would require additional work (CSS token mapping, antd `ConfigProvider` wiring). The practical end-user result is the same Jaeger UI appearance as Option A, without the browser-to-Jaeger requirement.

For the community datasource (Level 2), this option requires the datasource to fetch the full trace payload and convert it to `IOtelTrace` format before passing it to the panel — the trace data flows through Grafana's data pipeline. For large traces (Jaeger UI has been tested with 80k spans) this has memory and serialization implications.

**Limitations:**
- Large upfront refactor: 4–8 weeks. Result looks the same as Option A to the user.
- Versioning coupling: npm package and Jaeger UI application must stay in sync.
- antd peer dependency creates ongoing version management burden.

**Effort:** High.

---

### Option C: Web Component

Package the Jaeger UI component tree (with its own React root, Redux store, and CSS) as a Web Component (`<jaeger-trace-view>`) inside a Shadow DOM. The panel plugin registers and renders the custom element.

This avoids the Option B refactor but carries the same browser-reachable-Jaeger constraint as Option A (unless trace data is passed by value, which has the same large-payload problem as Option B).

**Key limitations:**
- Bundles all of Jaeger UI's dependencies (React, Redux, antd, plexus, lodash): several MB loaded on every Grafana page with the panel.
- React singleton isolation: the Web Component must use a fully isolated React copy to avoid hook conflicts with Grafana's React. This prevents any integration with Grafana's React context (theme, etc.).

**Effort:** Medium (3–5 weeks). Not recommended — shares Option A's browser-reachability constraint and Option B's bundle-size problem, without the advantages of either.

---

## Comparison Matrix

| Criterion                                        | A (iframe)               | B (npm package)      | C (Web Component)      |
|--------------------------------------------------|:------------------------:|:--------------------:|:----------------------:|
| Trace timeline view                              | ✅                        | ✅                    | ✅                      |
| Trace diff view                                  | ✅                        | ✅                    | ✅                      |
| Requires browser-reachable Jaeger               | ✅                        | ❌                    | ✅ (unless data passed) |
| Full trace payload flows through Grafana         | ❌                        | ✅                    | ⚠️ optional             |
| Span-to-Grafana links (server config today)      | ⚠️                        | ⚠️                    | ⚠️                      |
| Dynamic link injection by plugin                 | ⚠️ needs Jaeger UI work   | ✅ (prop)             | ⚠️ needs Jaeger UI work |
| Grafana theme integration                        | ❌                        | ❌ (extra work)       | ❌ (extra work)         |
| No Jaeger UI component refactor needed           | ✅                        | ❌                    | ✅                      |
| Works without running Jaeger deployment          | ❌                        | ✅                    | ✅                      |
| Implementation effort                            | Low                      | High                 | Medium                 |

---

## Decision

**Rendering: Option A (iframe)** for both integration levels. The UX delivered is identical to Option B — same Jaeger UI appearance, same feature set — and the browser-to-Jaeger requirement is met in any deployment where users already browse to Jaeger UI. Option B's only concrete advantage (no browser-to-Jaeger requirement) does not justify 4–8 weeks of component refactoring.

**Integration scope: pursue Level 2.** Level 1 alone (dashboard panel with a hardcoded trace ID) has limited practical value. Level 2 enables the Explore search → drill-down flow that users actually need. The community datasource plugin for the iframe approach is straightforward to implement: it returns trace IDs (or serialized search parameters) as DataFrame values rather than full trace payloads, keeping the Grafana data pipeline thin. The "delegate search to Jaeger UI" sub-approach (pass query params → iframe renders Jaeger's search page) is particularly attractive as it requires minimal datasource logic and exposes Jaeger's full search capabilities with zero reimplementation.

**Jaeger UI changes needed:**
- `uiLinkPatterns` URL parameter for dynamic span-to-Grafana link injection (modest, well-scoped addition).
- Optionally, additional `uiEmbed` flags for finer chrome control.

See ADR 0002 for the implementation plan.

---

## References

- Jaeger embed mode flags: `packages/jaeger-ui/src/utils/embedded-url.ts`
- Embed mode type definition: `packages/jaeger-ui/src/types/embedded.ts`
- Embed flag consumption: `packages/jaeger-ui/src/components/App/Page.tsx:37`, `packages/jaeger-ui/src/components/TracePage/index.tsx:193,401–422`
- Standalone pop-out link: `packages/jaeger-ui/src/components/TracePage/TracePageHeader/TracePageHeader.tsx:233`
- Link pattern system: `packages/jaeger-ui/src/model/link-patterns.ts`
- TraceTimelineViewer Redux connect: `packages/jaeger-ui/src/components/TracePage/TraceTimelineViewer/index.tsx:291`
- TraceDiff Redux connect: `packages/jaeger-ui/src/components/TraceDiff/TraceDiff.tsx:197`
- TraceDiffGraph plexus usage: `packages/jaeger-ui/src/components/TraceDiff/TraceDiffGraph/TraceDiffGraph.tsx:5,32`
- plexus package (currently private): `packages/plexus/package.json`
- Grafana DataSourcePlugin component slots: `packages/grafana-data/src/types/datasource.ts:175` (grafana/grafana)
- Grafana TraceViewContainer (hardcoded in Explore): `public/app/features/explore/Explore.tsx` (grafana/grafana)
- preferredVisualisationPluginId escape hatch: `public/app/features/explore/utils/decorators.ts` (grafana/grafana)
- Grafana Jaeger datasource: `public/app/plugins/datasource/jaeger/` (grafana/grafana)
