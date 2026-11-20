# HASH Integrations Ledger

Keeps the state of an integration's ledger pipeline in S3.

`Storage` is one integration's place in a bucket: `tenants/{web}/integrations/{sha256("{web}:{connector}")}`, from the web and the connector its definition names (`IntegrationNamespace`). It uploads and downloads files, and reads and writes small files with conditional writes: "create if missing" and "replace if unchanged since it was read". Small files are limited to 16 MiB.

The storage tests start a MinIO container and need a running Docker daemon.
