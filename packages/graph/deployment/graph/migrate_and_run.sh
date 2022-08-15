#!/usr/bin/env sh

set -eux

cd /migrations

HASH_GRAPH_PG_MIGRATION_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${HASH_GRAPH_PG_HOST}:${HASH_GRAPH_PG_PORT}/${HASH_GRAPH_PG_DATABASE} yarn graph:migrate up

cd /

exec /usr/local/bin/hash-graph --api-host 0.0.0.0
