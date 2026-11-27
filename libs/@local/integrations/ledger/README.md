# HASH Integrations Ledger

Keeps the state of an integration's ledger pipeline in S3.

`Storage` is one integration's place in a bucket: `tenants/{web}/integrations/{sha256("{web}:{connector}")}`, from the web and the connector its definition names (`IntegrationNamespace`). It uploads and downloads files, and reads and writes small files with conditional writes: "create if missing" and "replace if unchanged since it was read". Small files are limited to 16 MiB.

The storage tests start a MinIO container and need a running Docker daemon.

## Following a collector

A collector such as `hash-integrations-collect` writes each table of a definition as a Delta table with its change data feed on, at `dlt/{table}` in the integration's place. `capture_changes` captures a run from those tables: the changes of each table since the version the last completed run captured, read through delta-kernel and collapsed in DuckDB to one change per key. Each table's versions are recorded in `run.json` as its watermark, so a version passes to the next run only once Send has completed the run that captured it.

`Follower` takes a step at a time: it continues the active run, or starts a run when a table has a version the last completed run did not capture, and takes the run through every stage. The `hash-integrations-follow` binary runs a follower on an interval; its settings come from the environment, as its documentation lists.
