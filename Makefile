.PHONY: build test lint server test-reverse-proxy panel-% datasource-%

build:
	npm run build

test:
	npm run test:ci

lint:
	npm run lint

server:
	docker compose up --build

# Starts the reverse-proxy example stack, runs curl/jq API tests and Playwright e2e
# tests against the Grafana instance in that stack (port 18082), then tears down.
test-reverse-proxy:
	docker compose -f examples/reverse-proxy/docker-compose.yaml up -d
	examples/reverse-proxy/test.sh && \
	  GRAFANA_URL=http://localhost:18082 npx playwright test \
	    --config playwright/reverse-proxy.config.ts; \
	  status=$$?; \
	  docker compose -f examples/reverse-proxy/docker-compose.yaml down; \
	  exit $$status

panel-%:
	npm run $* --workspace=packages/panel

datasource-%:
	npm run $* --workspace=packages/datasource
