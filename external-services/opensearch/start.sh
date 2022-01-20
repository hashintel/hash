#!/usr/bin/env bash

if [[ "$HASH_OPENSEARCH_ENABLED" = "true" ]]; then
  source /usr/share/opensearch/opensearch-docker-entrypoint.sh;
else
  echo "Not using OpenSearch because HASH_OPENSEARCH_ENABLED is not equal to true.";
  echo "OpenSearch is currently disabled by default in Hash to save memory (the OpenSearch docker image is pretty memory intensive)";
  echo "There are also issues with the search-loader at the moment. Enable OpenSearch at your own risk.";
  echo "To enable OpenSearch, add HASH_OPENSEARCH_ENABLED=true to your .env.local file";
  exit 0;
fi
