#!/bin/bash

# Heavily modified version of Temporal's auto-setup.sh script - https://github.com/temporalio/docker-builds/blob/main/docker/auto-setup.sh

set -eux -o pipefail

: "${SKIP_SCHEMA_SETUP:=}"

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

wait_for_db() {
  until nc -z "${POSTGRES_SEEDS%%,*}" "${DB_PORT}"; do
    echo 'Waiting for PostgreSQL to startup.'
    sleep 1
  done

  echo 'PostgreSQL started.'
}

setup_schema() {
  # TODO (alex): Remove exports
  { export SQL_PASSWORD=${POSTGRES_PWD}; } 2> /dev/null

  POSTGRES_VERSION_DIR=v96

  SCHEMA_DIR=${TEMPORAL_HOME}/schema/postgresql/${POSTGRES_VERSION_DIR}/temporal/versioned

  temporal-sql-tool --plugin postgres --ep "${POSTGRES_SEEDS}" -u "${POSTGRES_USER}" -p "${DB_PORT}" --db "${DBNAME}" setup-schema -v 0.0
  temporal-sql-tool --plugin postgres --ep "${POSTGRES_SEEDS}" -u "${POSTGRES_USER}" -p "${DB_PORT}" --db "${DBNAME}" update-schema -d "${SCHEMA_DIR}"

  VISIBILITY_SCHEMA_DIR=${TEMPORAL_HOME}/schema/postgresql/${POSTGRES_VERSION_DIR}/visibility/versioned

  temporal-sql-tool --plugin postgres --ep "${POSTGRES_SEEDS}" -u "${POSTGRES_USER}" -p "${DB_PORT}" --db "${VISIBILITY_DBNAME}" setup-schema -v 0.0
  temporal-sql-tool --plugin postgres --ep "${POSTGRES_SEEDS}" -u "${POSTGRES_USER}" -p "${DB_PORT}" --db "${VISIBILITY_DBNAME}" update-schema -d "${VISIBILITY_SCHEMA_DIR}"
}

# === Elasticsearch functions ===

validate_es_env() {
  if [[ ${ENABLE_ES} == true ]]; then
    if [[ -z ${ES_SEEDS} ]]; then
      die "ES_SEEDS env must be set if ENABLE_ES is ${ENABLE_ES}"
    fi
  fi
}

wait_for_es() {
  SECONDS=0

  ES_SERVER="${ES_SCHEME}://${ES_SEEDS%%,*}:${ES_PORT}"

  until curl --silent --fail --user "${ES_USER}":"${ES_PWD}" "${ES_SERVER}" >&/dev/null; do
    DURATION=${SECONDS}

    if [[ ${ES_SCHEMA_SETUP_TIMEOUT_IN_SECONDS} -gt 0 && ${DURATION} -ge "${ES_SCHEMA_SETUP_TIMEOUT_IN_SECONDS}" ]]; then
      echo 'WARNING: timed out waiting for Elasticsearch to start up. Skipping index creation.'
      return
    fi

    echo 'Waiting for Elasticsearch to start up.'
    sleep 1
  done

  echo 'Elasticsearch started.'
}

setup_es_index() {
  ES_SERVER="${ES_SCHEME}://${ES_SEEDS%%,*}:${ES_PORT}"
  # @@@SNIPSTART setup-es-template-commands
  # ES_SERVER is the URL of Elasticsearch server i.e. "http://localhost:9200".
  SETTINGS_URL="${ES_SERVER}/_cluster/settings"
  SETTINGS_FILE=${TEMPORAL_HOME}/schema/elasticsearch/visibility/cluster_settings_${ES_VERSION}.json
  TEMPLATE_URL="${ES_SERVER}/_template/temporal_visibility_v1_template"
  SCHEMA_FILE=${TEMPORAL_HOME}/schema/elasticsearch/visibility/index_template_${ES_VERSION}.json
  INDEX_URL="${ES_SERVER}/${ES_VIS_INDEX}"
  curl --fail --user "${ES_USER}":"${ES_PWD}" -X PUT "${SETTINGS_URL}" -H "Content-Type: application/json" --data-binary "@${SETTINGS_FILE}" --write-out "\n"
  curl --fail --user "${ES_USER}":"${ES_PWD}" -X PUT "${TEMPLATE_URL}" -H 'Content-Type: application/json' --data-binary "@${SCHEMA_FILE}" --write-out "\n"
  curl --user "${ES_USER}":"${ES_PWD}" -X PUT "${INDEX_URL}" --write-out "\n"
  if [[ ! -z "${ES_SEC_VIS_INDEX}" ]]; then
    SEC_INDEX_URL="${ES_SERVER}/${ES_SEC_VIS_INDEX}"
    curl --user "${ES_USER}":"${ES_PWD}" -X PUT "${SEC_INDEX_URL}" --write-out "\n"
  fi
  # @@@SNIPEND
}

# === Main ===

if [[ ${SKIP_SCHEMA_SETUP} != true ]]; then
  validate_db_env
  wait_for_db
  setup_schema
fi

if [[ ${ENABLE_ES} == true ]]; then
  validate_es_env
  wait_for_es
  setup_es_index
fi
