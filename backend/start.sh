#!/bin/sh
set -e

# Wait for PostgreSQL to accept connections before running migrations.
echo "[start] Waiting for PostgreSQL..."
until node -e "require('./src/config/db').raw('SELECT 1').then(()=>process.exit(0)).catch(()=>process.exit(1))" >/dev/null 2>&1; do
  echo "[start]   database not ready, retrying in 2s..."
  sleep 2
done
echo "[start] PostgreSQL is up."

# Apply any pending Knex migrations (creates tables on a clean database).
echo "[start] Running migrations..."
node -e "const db=require('./src/config/db'); db.migrate.latest().then(()=>{console.log('[start] migrations complete'); process.exit(0);}).catch(e=>{console.error('[start] migration failed:', e); process.exit(1);})"

# Start the API (replaces this shell so Node receives signals directly).
echo "[start] Starting API..."
exec node src/index.js
