# Stage 1: build the frontend
FROM node:24-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# Stage 2: runtime
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_NO_CACHE=1
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/ ./
COPY --from=frontend /build/dist /app/frontend/dist
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh && adduser --disabled-password --gecos "" robin && mkdir -p /data && chown robin /data

ENV FRONTEND_DIST=/app/frontend/dist \
    DATABASE_URL=sqlite:////data/robin.db \
    PATH="/app/backend/.venv/bin:$PATH"
USER robin
EXPOSE 8000
CMD ["/app/docker-entrypoint.sh"]
