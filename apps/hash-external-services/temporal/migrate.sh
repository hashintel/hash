#!/bin/bash

# Heavily modified version of Temporal's auto-setup.sh script - https://github.com/temporalio/docker-builds/blob/main/docker/auto-setup.sh

set -eux -o pipefail

: "${SKIP_SCHEMA_SETUP:=}"
: "${SKIP_DB_CREATE:=false}"

# PostgreSQL
: "${DBNAME:=}"
: "${VISIBILITY_DBNAME:=}"
: "${DB_PORT:=}"
: "${POSTGRES_VERSION_DIR:=v12}"

: "${POSTGRES_SEEDS:=}"
: "${POSTGRES_USER:=}"
: "${POSTGRES_PWD:=}"

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

  SCHEMA_DIR=${TEMPORAL_HOME}/schema/postgresql/${POSTGRES_VERSION_DIR}/temporal/versioned
  # Create database only if its name is different from the user name. Otherwise PostgreSQL container itself will create database.
	if [[ ${DBNAME} != "${POSTGRES_USER}" && ${SKIP_DB_CREATE} != true ]]; then
		temporal-sql-tool --plugin postgres --ep "${POSTGRES_SEEDS}" -u "${POSTGRES_USER}" -p "${DB_PORT}" --db "${DBNAME}" create
	fi

  temporal-sql-tool --plugin postgres --ep "${POSTGRES_SEEDS}" -u "${POSTGRES_USER}" -p "${DB_PORT}" --db "${DBNAME}" setup-schema -v 0.0
  temporal-sql-tool --plugin postgres --ep "${POSTGRES_SEEDS}" -u "${POSTGRES_USER}" -p "${DB_PORT}" --db "${DBNAME}" update-schema -d "${SCHEMA_DIR}"

  VISIBILITY_SCHEMA_DIR=${TEMPORAL_HOME}/schema/postgresql/${POSTGRES_VERSION_DIR}/visibility/versioned
	# Create visibility DB if its name is different from the username. Otherwise PostgreSQL container itself will create database. 
	if [[ ${VISIBILITY_DBNAME} != "${POSTGRES_USER}" && ${SKIP_DB_CREATE} != true ]]; then
			temporal-sql-tool --plugin postgres --ep "${POSTGRES_SEEDS}" -u "${POSTGRES_USER}" -p "${DB_PORT}" --db "${VISIBILITY_DBNAME}" create
	fi

  temporal-sql-tool --plugin postgres --ep "${POSTGRES_SEEDS}" -u "${POSTGRES_USER}" -p "${DB_PORT}" --db "${VISIBILITY_DBNAME}" setup-schema -v 0.0
  temporal-sql-tool --plugin postgres --ep "${POSTGRES_SEEDS}" -u "${POSTGRES_USER}" -p "${DB_PORT}" --db "${VISIBILITY_DBNAME}" update-schema -d "${VISIBILITY_SCHEMA_DIR}"
}

# === Main ===

if [[ ${SKIP_SCHEMA_SETUP} != true ]]; then
  validate_db_env
  wait_for_db
  setup_schema
fi

