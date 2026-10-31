# HASH Integrations Engine

Runs an integration's pipelines in DuckDB.

Each run gets a `Workspace`, a DuckDB database file in which the run's queries execute. A query is a single `SELECT`, and cannot open files, load extensions or change settings.

`Workspace::stage_table` materializes a source query with `_op` and `_key` metadata and applies row-count, non-null, and uniqueness assertions. `prepare_pipeline` runs SQL steps, branches, and checkpoints, returning entity sink tables with `_content_hash` columns. Branches start from the same input, and checkpoints and sinks retain separate copies of their rows. `prepare_link_pipeline` runs link SQL against checkpoint inputs.

`derive_entity_id` derives stable entity IDs from an integration namespace, entity type and source record ID using UUID v5.

`Progress` counts an operation's observed work and emits structured tracing events at most every ten seconds as work advances. Call `report` for a final observation, including short operations. Reports carry the operation name, observed count, optional expected total, and elapsed seconds in the tracing span where tracking started. `snapshot` reads the counters for other reporting backends.

Workspace operations export OpenTelemetry metrics through the application's global meter provider. Initialize it before opening workspaces, for example through `hash_telemetry::TelemetryRegistry::init_global`.

| Metric                                  | Observed value                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `integrations.workspace.requests`       | Request counts by operation and outcome: `success`, `failure`, `cancelled`, or `skipped`.          |
| `integrations.workspace.duration`       | Request execution duration in seconds, excluding queue time.                                       |
| `integrations.workspace.rows`           | Rows read by queries or materialized into tables, including work followed by a disk-limit failure. |
| `integrations.workspace.disk.usage`     | Workspace bytes measured by existing disk-limit checks.                                            |
| `integrations.workspace.snapshot.bytes` | Bytes copied to successfully published snapshots.                                                  |

The operation labels are `open`, `query`, `create_table`, `stage_table`, `prepare_pipeline`, `prepare_link_pipeline`, `snapshot`, and `close`. Pipeline materializations contribute to `create_table` row counts. `cancelled` means a caller dropped an executing request; `skipped` means it dropped the request before execution. Metrics aggregate across workspaces.
