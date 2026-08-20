#!/usr/bin/env bash
# Create the database + role, apply schema and seed.
# Uses the PostgreSQL 18 install already on this machine (no Docker).
#
#   ./scripts/db-setup.sh
#
# You will be prompted for the 'postgres' superuser password you chose during
# the PostgreSQL 18 install.

set -euo pipefail

PSQL="${PSQL:-/Library/PostgreSQL/18/bin/psql}"
HOST="${PGHOST:-localhost}"
PORT="${PGPORT:-5432}"
SUPER="${PGSUPERUSER:-postgres}"

DB="video_intelligence"
ROLE="vi"
ROLE_PW="vi"

[ -x "$PSQL" ] || { echo "psql not found at $PSQL"; exit 1; }

echo "→ creating role '$ROLE' and database '$DB' (as $SUPER@$HOST:$PORT)"
"$PSQL" -h "$HOST" -p "$PORT" -U "$SUPER" -d postgres -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$ROLE') THEN
    CREATE ROLE $ROLE LOGIN PASSWORD '$ROLE_PW';
  END IF;
END
\$\$;
SQL

if ! "$PSQL" -h "$HOST" -p "$PORT" -U "$SUPER" -d postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1; then
  "$PSQL" -h "$HOST" -p "$PORT" -U "$SUPER" -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE $DB OWNER $ROLE"
  echo "  created database $DB"
else
  echo "  database $DB already exists"
fi

echo "→ applying db/schema.sql"
PGPASSWORD="$ROLE_PW" "$PSQL" -h "$HOST" -p "$PORT" -U "$ROLE" -d "$DB" \
  -v ON_ERROR_STOP=1 -q -f db/schema.sql

echo "→ applying db/seed.sql"
PGPASSWORD="$ROLE_PW" "$PSQL" -h "$HOST" -p "$PORT" -U "$ROLE" -d "$DB" \
  -v ON_ERROR_STOP=1 -q -f db/seed.sql

echo
echo "✓ done. Add this to .env.local:"
echo "  DATABASE_URL=postgres://$ROLE:$ROLE_PW@$HOST:$PORT/$DB"
