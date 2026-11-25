.PHONY: dev worker frontend test test-worker test-frontend build deploy migrate-local migrate-remote types

# Run the Worker (port 8787) and the frontend dev server (port 5173, proxies /api) together.
dev:
	@$(MAKE) -j2 worker frontend

worker: migrate-local
	cd worker && npx wrangler dev

frontend:
	cd frontend && npm run dev

test: test-worker test-frontend

test-worker:
	cd worker && npx vitest run && npx tsc --noEmit

test-frontend:
	cd frontend && npx vitest run && npx tsc -b

build:
	cd frontend && npm run build

# Regenerate worker/worker-configuration.d.ts after editing wrangler.jsonc.
types:
	cd worker && npx wrangler types --strict-vars=false

migrate-local:
	cd worker && npx wrangler d1 migrations apply robin --local

migrate-remote:
	cd worker && npx wrangler d1 migrations apply robin --remote

deploy: build migrate-remote
	cd worker && npx wrangler deploy
