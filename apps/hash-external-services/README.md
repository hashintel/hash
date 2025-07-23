# HASH External Services

## Overview

This directory contains external services used throughout HASH, including authentication, database, search, observability, and workflow execution services.

## Services

### Core Infrastructure

- **PostgreSQL** - Primary database for user data, graph data, and application state
- **MinIO** - S3-compatible object storage for file uploads and assets
- **Redis** - Caching and session storage
- **Vault** - Secrets management and secure storage

### Authentication & Authorization

- **Ory Kratos** - Identity and user management service
- **Ory Hydra** - OAuth2 and OpenID Connect server
- **MailSlurper** - Development email testing server

### Search & Analytics

- **OpenSearch** - Full-text search and analytics (alternative configuration available)

### Workflow Execution

- **Temporal** - Reliable workflow execution and task orchestration

### Observability Stack

The observability stack follows a centralized collection pattern: all applications send telemetry data (traces, metrics, logs) to the **OpenTelemetry Collector**, which processes and routes the data to specialized storage backends. **Grafana** then reads from all backends to provide unified visualization.

**Flow:** `Applications → OTel Collector → Storage Backends ← Grafana`

- **OpenTelemetry Collector** - Central telemetry hub that receives, processes, and routes data
- **Grafana Tempo** - Distributed tracing backend with service graph generation
- **Grafana Loki** - Log aggregation and storage
- **Prometheus** - Metrics collection and storage
- **Grafana** - Unified observability dashboard reading from all backends

## Quick Start

### Development Environment

Start all development services:

```bash
# From the repository root
yarn external-services up --wait
```

### Service Management

Each service includes health checks and proper dependency management. Services will start in the correct order automatically.

**Access URLs (Development):**

- Grafana Dashboard: http://localhost:3001
- Prometheus: http://localhost:9090
- Kratos Admin API: http://localhost:4434
- Hydra Admin API: http://localhost:4445

## Configuration Files

### Observability Configuration

- `opentelemetry-collector/otel-collector-config.yaml` - OpenTelemetry Collector pipeline configuration
- `tempo/tempo.yaml` - Tempo tracing backend configuration
- `loki/loki.yaml` - Loki log aggregation configuration
- `prometheus/prometheus.yml` - Prometheus metrics collection configuration
- `grafana/provisioning/` - Grafana data source and dashboard provisioning

### Authentication Configuration

- `kratos/kratos.dev.yml` - Kratos development configuration
- `kratos/identity.schema.json` - User identity schema
- `kratos/templates/` - Email templates for verification and recovery

## Future Plans

Services may be migrated into semantic folders:

1. `hash-external-services/kratos` → `hash-authentication`
2. `hash-external-services/opensearch` → `hash-search`
3. `hash-external-services/postgres` → `hash-database`
4. `hash-external-services/temporal` → `hash-executor`
5. `hash-external-services/grafana` → `hash-observability`

## Database Backups

It is possible to set up automated PostgreSQL backups using an additional service. You can add this service directly to the desired `docker-compose` or add another `docker-compose` as a layered config.

You can add the following service:

```yaml
postgres-backup:
  image: kartoza/pg-backup:15-3.3
  depends_on:
    postgres:
      condition: service_healthy
  environment:
    POSTGRES_USER: "${POSTGRES_USER}"
    POSTGRES_PASS: "${POSTGRES_PASSWORD}"
    POSTGRES_HOST: postgres
    POSTGRES_PORT: 5432
    # Change the name of the dumps here
    ARCHIVE_FILENAME: "$$(date +'%Y-%m-%dT%H-%M-%S').gz"
    # These are the args passed to the `pg_dump` command
    # read more at https://www.postgresql.org/docs/current/app-pgdump.html#PG-DUMP-OPTIONS
    # `-p` ensures that SQL can be easily transferred between versions
    # `--if-exists` is important here, as several databases (most notably `realtime`) already create schemas, which would otherwise lead to an error while applying the backup.
    DUMP_ARGS: -Fp -Z9 --if-exists
    # Change the cron here for the desired backup schedule
    # This is set to 00:00 UTC every day
    CRON_SCHEDULE: "0 0 * * *"
    REMOVE_BEFORE: 14
  volumes:
    # Change here for the desired backup location
    - /tmp/backups:/backups
```

This will add backups to the `/tmp/backups` location at the desired schedule (change as needed.)

To apply the backups you can use:

```bash
# we use `-c -f` here to force output, `pg-backup` always ends archives with `.dmp`, which gunzip will otherwise refuse to uncompress
# You can skip this step if you haven't compressed (`-Z`) the backup.
gunzip -c -f /local/registry/backups/[date].dev_kratos.dmp > .tmp
./compose.sh exec -T --env PGPASSWORD=[password] postgres psql --user postgres dev_kratos -v ON_ERROR_STOP=1 < .tmp

gunzip -c -f /local/registry/backups/[date].dev_graph.dmp > .tmp
./compose.sh exec -T --env PGPASSWORD=[password] postgres psql --user postgres dev_graph -v ON_ERROR_STOP=1 < .tmp
```

You do **not** need to restore the `globals.sql` file, the init script of the postgres container already does this for you.

The `./compose.sh` file is an alias script, meant to ease the use of the lengthy docker compose command, and should look somewhat like this:

```bash
#!/usr/bin/env bash

# `docker-compose.prod.yml` contains local overrides to the production docker compose file, like custom volume mounts or the backup solution.
sudo docker compose --file apps/hash-external-services/docker-compose.prod.yml --file docker-compose.prod.yml --env-file .env.prod ${@}
```
