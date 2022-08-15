#!/usr/bin/env sh

set -eux

cd /migrations

export HASH_GRAPH_PG_MIGRATION_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${HASH_GRAPH_PG_DATABASE}
yarn graph:migrate up

cd /

export HASH_GRAPH_HOST="$POSTGRES_HOST"
export HASH_GRAPH_ADDRESS="0.0.0.0:$HASH_GRAPH_API_PORT"
exec /usr/local/bin/hash-graph
