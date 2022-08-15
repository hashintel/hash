#!/usr/bin/env sh

set -eux

cd /migrations

HASH_GRAPH_PG_MIGRATION_URL=postgres://${HASH_GRAPH_USER}:${HASH_GRAPH_PASSWORD}@${HASH_GRAPH_HOST}:${HASH_GRAPH_API_PORT}/${HASH_GRAPH_DATABASE} yarn graph:migrate up

cd /

exec /usr/local/bin/hash-graph --rest-address "0.0.0.0:4000"
