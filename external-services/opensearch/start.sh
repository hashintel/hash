#!/usr/bin/env bash

if [[ "$HASH_OPENSEARCH_ENABLED" = "true" ]]; then
  source /usr/share/opensearch/opensearch-docker-entrypoint.sh;
else
  echo "Not using Open Search because HASH_OPENSEARCH_ENABLED is not equal to true.";
  echo "Please change .env.local and restart the container.";
  exit 0;
fi
