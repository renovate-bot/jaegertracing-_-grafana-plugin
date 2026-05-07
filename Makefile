.PHONY: build test lint server panel-% datasource-%

build:
	npm run build

test:
	npm run test:ci

lint:
	npm run lint

server:
	docker compose up --build

panel-%:
	npm run $* --workspace=packages/panel

datasource-%:
	npm run $* --workspace=packages/datasource
