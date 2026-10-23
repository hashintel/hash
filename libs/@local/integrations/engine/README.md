# HASH Integrations Engine

Runs an integration's pipelines in DuckDB.

Each run gets a `Workspace`, a DuckDB database file in which the run's queries execute. A query is a single `SELECT`, and cannot open files, load extensions or change settings.

`Workspace::stage_table` materializes a source query with `_op` and `_key` metadata and applies row-count, non-null, and uniqueness assertions. `prepare_pipeline` runs SQL steps, branches, and checkpoints, returning entity sink tables with `_content_hash` columns. Branches start from the same input, and checkpoints and sinks retain separate copies of their rows. `prepare_link_pipeline` runs link SQL against checkpoint inputs.

`coerce_value` converts scalar property values using the definition's coercions. `coerce_measure` converts an amount and selects its data type from a unit map.

`derive_entity_id` derives stable entity IDs from an integration namespace, entity type and source record ID using UUID v5.

`Workspace::capture` streams a checked SQL query to a new Parquet file with Snappy compression. It preserves the schema for empty results, binds the workspace's named parameters, and keeps DuckDB's external access disabled. The writer flushes row groups at 65,536 rows or after its estimated buffered size reaches 8 MiB. A single batch can exceed that size. Workspace memory and disk limits apply to DuckDB's files and execution; they do not count the Parquet writer or capture files.

Capture files are written beside their destination, synced, and published atomically without replacing an existing path. Cancellation and errors remove temporary files. Publication can complete if cancellation races with it. `SourceCapture::copy_from` copies a local Parquet file through the same publication process and checks its footer. It performs blocking file IO. `SourceCapture::open` recovers a published file's path, row count, and byte count from its footer.

`SecretStore` resolves credentials for the run's web and actor. `GraphVaultSecretStore` requires HTTPS endpoints for Graph and Vault. It queries Graph as that actor, checks the secret entity's identity, type, archive state, and expiry, and reads its value from a Vault KV v2 path under `users/<web>/`. PostgreSQL secrets contain a JSON object with `username` and `password`; REST secrets contain `value` and are used as a bearer token or configured header. Secret bytes use `hash-secret`, and connector errors omit credentials and response bodies.

`Progress` counts an operation's observed work and emits structured tracing events at most every ten seconds as work advances. Call `report` for a final observation, including short operations. Reports carry the operation name, observed count, optional expected total, and elapsed seconds in the tracing span where tracking started. `snapshot` reads the counters for other reporting backends.

Workspace operations export OpenTelemetry metrics through the application's global meter provider. Initialize it before opening workspaces, for example through `hash_telemetry::TelemetryRegistry::init_global`.

| Metric                                  | Observed value                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `integrations.workspace.requests`       | Request counts by operation and outcome: `success`, `failure`, `cancelled`, or `skipped`.          |
| `integrations.workspace.duration`       | Request execution duration in seconds, excluding queue time.                                       |
| `integrations.workspace.rows`           | Rows read by queries or materialized into tables, including work followed by a disk-limit failure. |
| `integrations.workspace.disk.usage`     | Workspace bytes measured by existing disk-limit checks.                                            |
| `integrations.workspace.snapshot.bytes` | Bytes copied to successfully published snapshots.                                                  |

The operation labels are `open`, `query`, `create_table`, `stage_table`, `prepare_pipeline`, `prepare_link_pipeline`, `capture`, `load_capture`, `snapshot`, and `close`. Pipeline materializations contribute to `create_table` row counts. Capture row counts record rows written before publication, including a publication failure. `cancelled` means a caller dropped an executing request; `skipped` means it dropped the request before execution. Metrics aggregate across workspaces.
