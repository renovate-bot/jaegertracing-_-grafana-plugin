.PHONY: build test lint server build-release test-reverse-proxy panel-% datasource-%

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

# Usage: make build-release VERSION=0.2.0
# Builds both plugins, packages them as zips, and generates dist/checksums.txt.
# package.json files are temporarily updated then restored; working tree is clean after.
build-release:
ifndef VERSION
	$(error VERSION is not set. Usage: make build-release VERSION=0.2.0)
endif
	npm pkg set version="$(VERSION)" \
		--workspace packages/panel \
		--workspace packages/datasource
	$(MAKE) build
	git checkout packages/panel/package.json packages/datasource/package.json
	rm -rf dist
	mkdir -p dist
	mv packages/panel/dist dist/jaegertracing-jaeger-panel
	mv packages/datasource/dist dist/jaegertracing-jaeger-datasource
	(cd dist && zip -r jaegertracing-jaeger-panel-$(VERSION).zip jaegertracing-jaeger-panel)
	(cd dist && zip -r jaegertracing-jaeger-datasource-$(VERSION).zip jaegertracing-jaeger-datasource)
	(cd dist && sha256sum jaegertracing-jaeger-panel-$(VERSION).zip jaegertracing-jaeger-datasource-$(VERSION).zip > checksums.txt)
	(cd dist && sha256sum -c checksums.txt)

panel-%:
	npm run $* --workspace=packages/panel

datasource-%:
	npm run $* --workspace=packages/datasource
