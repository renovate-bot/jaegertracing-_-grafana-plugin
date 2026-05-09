.PHONY: build build-backend vet-backend test lint server panel-% datasource-%

build: build-backend
	npm run build

build-backend:
	(cd packages/datasource && go tool mage build:linuxARM64 build:linux)

vet-backend:
	(cd packages/datasource && go vet ./pkg/...)

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
