# HASH Integrations Ledger

Runs an integration's ledger pipeline. A run passes through three stages, Capture, Prepare and Send, and each stage keeps its result in the integration's S3 bucket.

`Storage` is one integration's place in that bucket: `tenants/{web}/integrations/{sha256("{web}:{connector}")}`, from the web and the connector its definition names (`IntegrationNamespace`). It uploads and downloads files, such as a run's capture file, and reads and writes small files such as `run.json` with conditional writes: "create if missing" and "replace if unchanged since it was read". Small files are limited to 16 MiB.

The storage tests start a MinIO container and need a running Docker daemon.
