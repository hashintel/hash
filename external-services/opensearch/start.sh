#!/usr/bin/env bash

if [[ "$HASH_OPENSEARCH_ENABLED" = "true" ]]; then
  source /usr/share/opensearch/opensearch-docker-entrypoint.sh;
else
  echo "Not using Open Search because HASH_OPENSEARCH_ENABLED is not equal to true.";
  echo "Opensearch is currently disabled by default in Hash to save memory (the opensearch docker image is pretty memory intensive)";
  echo "There are also issues with the search-loader at the moment. Enable opensearch at your own risk.";
  echo "To enable Opensearch, add HASH_OPENSEARCH_ENABLED=true to your .env.local file";
  exit 0;
fi
