#!/bin/bash

# Heavily modified version of Temporal's auto-setup.sh script - https://github.com/temporalio/docker-builds/blob/main/docker/auto-setup.sh

set -eux -o pipefail

# PostgreSQL
: "${DBNAME:=}"
: "${VISIBILITY_DBNAME:=}"
: "${DB_PORT:=}"

: "${POSTGRES_SEEDS:=}"
: "${POSTGRES_USER:=}"
: "${POSTGRES_PWD:=}"

# Elasticsearch
: "${ENABLE_ES:=false}"
: "${ES_SCHEME:=http}"
: "${ES_SEEDS:=}"
: "${ES_PORT:=9200}"
: "${ES_USER:=}"
: "${ES_PWD:=}"
: "${ES_VERSION:=v7}"
: "${ES_VIS_INDEX:=temporal_visibility_v1_dev}"
: "${ES_SEC_VIS_INDEX:=}"
: "${ES_SCHEMA_SETUP_TIMEOUT_IN_SECONDS:=0}"

# Server setup
: "${TEMPORAL_CLI_ADDRESS:=}"

: "${SKIP_DEFAULT_NAMESPACE_CREATION:=false}"
: "${DEFAULT_NAMESPACE:=default}"
: "${DEFAULT_NAMESPACE_RETENTION:=1}"

: "${SKIP_ADD_CUSTOM_SEARCH_ATTRIBUTES:=false}"

# === Helper functions ===

die() {
  echo "$*" 1>&2
  exit 1
}

# === Main database functions ===

validate_db_env() {
  # TODO check the rest of the env-vars as necessary
  if [[ -z ${POSTGRES_SEEDS} ]]; then
    die "POSTGRES_SEEDS env must be set."
  fi
}

# === Elasticsearch functions ===

validate_es_env() {
  if [[ ${ENABLE_ES} == true ]]; then
    if [[ -z ${ES_SEEDS} ]]; then
      die "ES_SEEDS env must be set if ENABLE_ES is ${ENABLE_ES}"
    fi
  fi
}

# === Server setup ===

register_default_namespace() {
  echo "Registering default namespace: ${DEFAULT_NAMESPACE}."
  if ! temporal operator namespace describe "${DEFAULT_NAMESPACE}"; then
    echo "Default namespace ${DEFAULT_NAMESPACE} not found. Creating..."
    temporal operator namespace create --retention "${DEFAULT_NAMESPACE_RETENTION}" --description "Default namespace for Temporal Server." "${DEFAULT_NAMESPACE}"
    echo "Default namespace ${DEFAULT_NAMESPACE} registration complete."
  else
    echo "Default namespace ${DEFAULT_NAMESPACE} already registered."
  fi
}

add_custom_search_attributes() {
  until temporal operator search-attribute list --namespace "${DEFAULT_NAMESPACE}"; do
    echo "Waiting for namespace cache to refresh..."
    sleep 1
  done
  echo "Namespace cache refreshed."

  echo "Adding Custom*Field search attributes."
  # TODO: Remove CustomStringField
  # @@@SNIPSTART add-custom-search-attributes-for-testing-command
  temporal operator search-attribute create --namespace "${DEFAULT_NAMESPACE}" \
    --name CustomKeywordField --type Keyword \
    --name CustomStringField --type Text \
    --name CustomTextField --type Text \
    --name CustomIntField --type Int \
    --name CustomDatetimeField --type Datetime \
    --name CustomDoubleField --type Double \
    --name CustomBoolField --type Bool
  # @@@SNIPEND
}

setup_server() {
  echo "Temporal CLI address: ${TEMPORAL_CLI_ADDRESS}."

  until temporal operator cluster health | grep -q SERVING; do
    echo "Waiting for Temporal server to start..."
    sleep 1
  done
  echo "Temporal server started."

  if [[ ${SKIP_DEFAULT_NAMESPACE_CREATION} != true ]]; then
    register_default_namespace
  fi

  if [[ ${SKIP_ADD_CUSTOM_SEARCH_ATTRIBUTES} != true ]]; then
    add_custom_search_attributes
  fi
}

# === Main ===

# TEMPORAL_CLI_ADDRESS setup copied from https://github.com/temporalio/docker-builds/blob/main/docker/entrypoint.sh

: "${BIND_ON_IP:=$(getent hosts "$(hostname)" | awk '{print $1;}')}"
export BIND_ON_IP

# check TEMPORAL_CLI_ADDRESS is not empty
if [[ -z "${TEMPORAL_CLI_ADDRESS:-}" ]]; then
    echo "TEMPORAL_CLI_ADDRESS is not set, setting it to ${BIND_ON_IP}:7233"

    if [[ "${BIND_ON_IP}" =~ ":" ]]; then
        # ipv6
        export TEMPORAL_CLI_ADDRESS="[${BIND_ON_IP}]:7233"
    else
        # ipv4
        export TEMPORAL_CLI_ADDRESS="${BIND_ON_IP}:7233"
    fi
fi

setup_server
