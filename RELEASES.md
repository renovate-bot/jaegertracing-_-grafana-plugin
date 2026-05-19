# Releasing

> This document contains instructions for maintainers on performing a new release.
> Installation instructions for users are in the [README.md](README.md).

1. Go to **[Releases](https://github.com/jaegertracing/grafana-plugin/releases) → Draft a new release**.
2. Click **Choose a tag**, type the new version (e.g. `v0.2.0`), and select **Create new tag on publish**.
3. Click **Generate release notes**, review, and click **Publish release**.

The `Release` CI workflow triggers automatically and uploads three assets to the release:
- `jaegertracing-jaeger-panel-<version>.zip`
- `jaegertracing-jaeger-datasource-<version>.zip`
- `checksums.txt` (SHA256 of both zips)
