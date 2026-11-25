.PHONY: dev backend frontend test test-backend test-frontend build docker

# Run backend (port 8000) and frontend dev server (port 5173, proxies /api) together.
dev:
	@$(MAKE) -j2 backend frontend

backend:
	cd backend && uv run alembic upgrade head && uv run uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

test: test-backend test-frontend

test-backend:
	cd backend && uv run pytest -q

test-frontend:
	cd frontend && npx vitest run && npx tsc -b

build:
	cd frontend && npm run build

docker:
	docker build -t robin-web .
