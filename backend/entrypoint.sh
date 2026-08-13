#!/bin/sh
# Nexora backend entrypoint (used by Dockerfile.backend on Render/free hosts)
set -e

echo "[nexora] Running Alembic migrations (idempotent)..."
alembic upgrade head || echo "[nexora] Alembic failed, continuing (app will create_all)"

echo "[nexora] Seeding demo data (skips if already present)..."
python - <<'PY'
import asyncio
import seed_demo

asyncio.run(seed_demo.run(days=90))
PY

echo "[nexora] Starting Nexora API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
