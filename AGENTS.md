## Project knowledge

This repository contains a **Grafana plugin**. You must Read @./.config/AGENTS/instructions.md before doing changes.

## Git commits

Always sign off commits with `-s` (`--signoff`).

## Testing

All commands below run from the **repository root** — never `cd` into a subdirectory.

| What changed | Command |
|---|---|
| Any TypeScript source | `make test` — runs Jest for both packages |
| Datasource or panel source | `make build` — verifies webpack compilation |
| `examples/reverse-proxy/`, provisioning, or plugin config | `make test-reverse-proxy` — builds plugins, starts the stack, runs 12 curl/jq + 6 Playwright tests, tears down |

Run `make test-reverse-proxy` before committing any change to datasource source, panel source, proxy config, or provisioning files.
