#!/usr/bin/env bash

set -euo pipefail

clorinde live "postgresql://${HASH_GRAPH_PG_USER:-graph}:${HASH_GRAPH_PG_PASSWORD:-graph}@${HASH_GRAPH_PG_HOST:-localhost}:${HASH_GRAPH_PG_PORT:-5432}/${HASH_GRAPH_PG_DATABASE:-graph}"

just sync-turborepo @rust/clorinde

git diff --exit-code clorinde
