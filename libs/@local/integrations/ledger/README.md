# HASH Integrations Ledger

Keeps the state of an integration's ledger pipeline in S3.

`Storage` is one integration's place in a bucket: `tenants/{web}/integrations/{sha256("{web}:{connector}")}`, from the web and the connector its definition names (`IntegrationNamespace`). It uploads files, and reads and writes small files with conditional writes: "create if missing" and "replace if unchanged since it was read". Small files are limited to 16 MiB. `run.json`, `current.json` and the issues file are kept this way.

The stages pass their data as Delta tables in the same place, read and written through DuckDB with its `httpfs` and `delta` extensions. Capture runs one DuckDB query per table, given by the integration's operator configuration, and appends the rows to the table `capture/{table}`. Prepare copies a run's rows from there and writes the run's entity changes to the sync table, `sync/`. Send reads them. Every table is partitioned by run, and a run is written to a table once.

DuckDB installs the two extensions from the network when a stage opens the tables.

The storage tests and every test that reads or writes a Delta table start a MinIO container and need a running Docker daemon.
