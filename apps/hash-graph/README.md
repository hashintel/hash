# HASH Graph

## Overview

The HASH Graph is a high-performance entity-graph query layer. It provides a REST API for creating, querying, and managing entities, types, and their relationships within the HASH ecosystem. The Graph service is fully instrumented with OpenTelemetry for comprehensive observability.

This crate creates a CLI interface to the graph libraries defined in [`libs/@local/graph`](../../libs/@local/graph).

## Architecture

The Graph service consists of several key components:

- **REST API Server** - Main HTTP interface with OpenAPI specification
- **Type Fetcher Service** - Manages and validates type definitions via tarpc
- **PostgreSQL Store** - Persistent storage layer with full transaction support
- **Authorization Layer** - Permission-based access control
- **Telemetry Integration** - Distributed tracing, metrics, and structured logging

## Quick Start

### Using the Integrated Development Environment

The recommended way to run the Graph is through the integrated development setup:

```shell
# From repository root - starts Graph with all dependencies
yarn start:graph
```

This automatically starts the Graph service with proper external service dependencies and telemetry configuration.

### Standalone Development

For Graph-specific development, you can run the service independently:

1. **Start External Services**

   ```shell
   # From repository root
   yarn external-services up --wait
   ```

2. **Run Database Migrations**

   ```shell
   cargo run --bin hash-graph -- migrate
   ```

3. **Start the Graph Server**

   ```shell
   cargo run --bin hash-graph -- server
   ```

4. **Start the Type Fetcher (if needed)**

   ```shell
   cargo run --bin hash-graph -- type-fetcher
   ```

## Development

### Building

```shell
# Debug build
cargo build

# Release build
cargo build --release
```

### Testing

```shell
# Run all tests (requires database)
cargo test

# Run specific test package
cargo test --package hash-graph-postgres-store
```

### Code Quality

```shell
# Run clippy
cargo clippy --all-features

# Format code
cargo fmt
```

## API Documentation

The Graph exposes a REST API with comprehensive OpenAPI specification:

### Generate OpenAPI Client

To generate the TypeScript client used by the frontend:

```shell
# From apps/hash-graph directory
cargo run --bin openapi-spec-generator
```

The OpenAPI spec is generated from code using [`utoipa`](https://github.com/juhaku/utoipa/). Complex types are defined manually in `libs/@local/graph/src/api/rest/json_schemas/`.

### Endpoints

Key API endpoints include:

- **Entities**: CRUD operations for graph entities
- **Types**: Entity and property type management
- **Queries**: Structural queries across the graph
- **Ontology**: Type system and schema operations

## Database Management

### Migrations

Database schema is managed through [`refinery`](https://github.com/rust-db/refinery) migrations:

```shell
# Apply migrations
cargo run -- migrate
```

**Migration Format**: `V{number}__{description}.sql` in `postgres_migrations/`

- `V` prefix is required
- Number determines execution order
- Use incremental migrations (no rollbacks)

### Database Configuration

The Graph connects to PostgreSQL with:

- Full ACID transaction support
- Connection pooling
- Comprehensive query instrumentation

## Observability

The Graph service includes comprehensive telemetry integration with the observability stack:

### Distributed Tracing

- **Automatic instrumentation** for all HTTP requests and database queries
- **Context propagation** across service boundaries (Type Fetcher communication via tarpc)
- **Custom spans** for complex operations and business logic
- **Database query tracing** with proper OpenTelemetry semantic conventions

### Structured Logging

- **Correlation IDs** linking logs to traces
- **Structured output** with consistent field naming
- **Configurable log levels** per module

### Configuration

Set environment variables for enhanced logging:

```shell
# Enhanced Graph logging (reduce noisy dependencies)
HASH_GRAPH_LOG_LEVEL=trace,h2=info,tokio_util=debug,tower=info,tonic=info,hyper=info,tokio_postgres=info,rustls=info,tarpc=trace,libp2p_noise=info,libp2p_ping=info

# OpenTelemetry endpoint (automatically configured in development)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

All telemetry data is automatically sent to the [OpenTelemetry Collector](../hash-external-services/) and can be viewed in Grafana at http://localhost:3001.

## Features

### Core Capabilities

- **Entity Management**: Create, update, delete, and query entities
- **Type System**: Rich type definitions with inheritance and validation
- **Structural Queries**: Complex graph traversal and filtering
- **Authorization**: Fine-grained permission control
- **Temporal Queries**: Query entity state at specific points in time
- **Bulk Operations**: Efficient batch processing

### Performance

- **Connection Pooling**: Optimized database connections
- **Query Optimization**: Efficient SQL generation
- **Async Processing**: Non-blocking I/O throughout
- **Instrumentation**: Comprehensive performance monitoring

### Reliability

- **Health Checks**: Built-in endpoint monitoring
- **Graceful Shutdown**: Clean resource cleanup
- **Error Handling**: Comprehensive error types with context

## Status Format

API responses containing non-OK statuses follow the `Status` format defined in [`@local/status`](/libs/@local/status/README.md).

The [`status.json`](../../libs/@local/graph/src/api/rest/json_schemas/status.json) schema defines this type and should be updated when new error payloads are added.

## Troubleshooting

### Common Issues

**Database Connection Errors**:

```shell
# Check external services are running
docker ps

# Verify database is accessible
psql -h localhost -p 5432 -U postgres
```

**Type Fetcher Communication**:

```shell
# Check Type Fetcher is running on tarpc port
telnet localhost 4455
```

**Build Issues**:

```shell
# Clean build artifacts
cargo clean

# Update dependencies
cargo update
```

## Contributing

### Code Organization

- `src/main.rs` - Entry point and CLI argument parsing
- `src/subcommand/` - Individual command implementations (server, migrate, type-fetcher, etc.)
- `libs/@local/graph/` - Core graph logic and API definitions

### Development Workflow

1. **Make Changes**: Edit code in `src/` or `libs/@local/graph/`
2. **Run Tests**: `cargo test`
3. **Check Linting**: `cargo clippy`
4. **Update API Spec**: Generate OpenAPI spec if API changed
5. **Test Integration**: Run full development environment with `yarn dev`
