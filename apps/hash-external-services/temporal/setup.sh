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

# Server setup
: "${TEMPORAL_ADDRESS:=}"

: "${SKIP_DEFAULT_NAMESPACE_CREATION:=false}"
: "${DEFAULT_NAMESPACE:=default}"
: "${DEFAULT_NAMESPACE_RETENTION:=1}"

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

setup_server() {
  echo "Temporal CLI address: ${TEMPORAL_ADDRESS}."

  until temporal operator cluster health --address $TEMPORAL_ADDRESS| grep -q SERVING; do
    echo "Waiting for Temporal server to start..."
    sleep 1
  done
  echo "Temporal server started."

  if [[ ${SKIP_DEFAULT_NAMESPACE_CREATION} != true ]]; then
    register_default_namespace
  fi
}

# === Main ===


# TEMPORAL_ADDRESS setup copied from https://github.com/temporalio/docker-builds/blob/main/docker/entrypoint.sh

: "${BIND_ON_IP:=$(getent hosts $(hostname) | awk '{print $1;}')}"
export BIND_ON_IP

# check TEMPORAL_ADDRESS is not empty
if [[ -z "${TEMPORAL_ADDRESS:-}" ]]; then
    echo "TEMPORAL_ADDRESS is not set, setting it to ${BIND_ON_IP}:7233"

    if [[ "${BIND_ON_IP}" =~ ":" ]]; then
        # ipv6
        export TEMPORAL_ADDRESS="[${BIND_ON_IP}]:7233"
    else
        # ipv4
        export TEMPORAL_ADDRESS="${BIND_ON_IP}:7233"
    fi
fi

# TEMPORAL_CLI_ADDRESS is deprecated and support for it will be removed in the future release.
if [[ -z "${TEMPORAL_CLI_ADDRESS:-}" ]]; then
    export TEMPORAL_CLI_ADDRESS="${TEMPORAL_ADDRESS}"
fi

setup_server
