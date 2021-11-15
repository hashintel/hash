#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "integration_tests" <<- EOSQL
  create schema config;

  create table config.hdev_config (
    key   text primary key,
    value jsonb
  );

  insert into config.hdev_config (key, value) values ('citus', '{"enabled": false}');
EOSQL
