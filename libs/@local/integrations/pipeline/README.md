# Ingestion pipeline

This crate is the replacement implementation specified in `../docs/pipeline`. It contains the
four stages, shared checkpoint/state logic, local command and workflow/service adapters.
Existing integrations engine and app callers remain unchanged.

The workspace, prepared-pipeline, capture, identity, SQL, and immutable artifact code is adapted
from the agreed repository baseline (`feb96672c5`). Private engine APIs prevent implementing
pre-conversion decimal checks and conditional markers safely as wrappers across crates, so those
adaptations live here. The definition parser and domain types remain shared dependencies.

The foundation adds immutable marker selection, bounded row files, conditional local/S3 current
state, stable run input resolution, and all stored stage output contracts. Local state uses a stable
sidecar OS lock and synced atomic replacement; S3 uses conditional object writes. Export validation
checks unsupported logical types before conversion and decimal precision before every write.

Stage 1 captures SQL, local, REST, and PostgreSQL sources, reuses completed source bindings on retry,
and adopts stored captures for restore/reconcile. Its completion marker fixes the winning capture
time and source references. Adoption and empty restore stay inline in the stage entry point;
source failures use one classifier with shared lower-frame helpers.

Stage 2 preserves the `prepare_rows` seam for source staging, property hashes, and typed entity/link
identities. Bounded ID batches use blocking row-file writers. Diffing reads committed and interrupted
run checkpoints, applies global identity/coverage/archive guards, and publishes ordered files only
after the guards pass. Prior loading, row classification, and file publication each have one module;
private forwarding helpers from the design sketches are folded into those operations.

Stage 3 reads the persisted IDs and typed changes, resolves properties, and stores canonical request
bodies with capture-time provenance. Every upsert patch replaces the complete property object.
Sequential bounded ranges replace the private cursor sketch; one writer assigns batches across
target boundaries, and bounded blocking buffers publish writes and property issues. Group traversal,
checkpoint validation, target lookup, and file writing retain distinct responsibilities.

Stage 4 sends the stored JSON without rebuilding it, checks current-state authority before every
attempt and fallback, and conditionally commits the winning completion marker. One delivery module
holds the retry and fallback rules; the reader and rejection tally own their bounded IO. Planning
and rejection publication share one concrete blocking file buffer. The public `run` function composes
the five specified calls, and the shared S1–S9 suite exercises all four stages and durable replay.

The local binary and workflow adapter use those same stage functions. The binary calls `run`;
`service::PipelineFunction` requests the five named `StepContext` steps and records their typed
checkpoint outputs. `service::IntegrationService` validates submissions and supplies stable run
identities to a caller-provided `orchestration::Runs` backend. The crate supplies these integration
interfaces, not an orchestration backend or worker.
The CLI is the runnable entry point. Restate integration is outside this implementation's scope.

Run `cargo run -p hash-integrations-pipeline -- run --help` for the local arguments. An apply run
uses the following form; supply secrets through their named environment variables:

```sh
cargo run -p hash-integrations-pipeline -- run \
  --web <web-uuid> --connector aviation --actor <machine-actor-uuid> \
  --storage-dir /path/to/artifacts --local-sources /path/to/sources \
  --graph-url http://127.0.0.1:4000 \
  --vault-url http://127.0.0.1:8200 --vault-mount secret \
  apply --definition /path/to/aviation.yaml --namespace aviation
```

The required secret variables are `HASH_GRAPH_SERVICE_SECRET` and
`HASH_INTEGRATIONS_VAULT_TOKEN`; S3 storage additionally uses
`HASH_INTEGRATIONS_S3_SECRET_ACCESS_KEY`. Local sources must be outside artifact storage. Vault
configuration is required even for definitions that do not read secrets. The command prints its run
ID to stderr before setup and one JSON result to stdout on success. Pass the same arguments and
`--run-id` to resume; changing a recorded request is rejected. `restore --target <run-uuid>`,
`restore --empty`, and `reconcile` replace the `apply` subcommand. Exit codes are 0 for a committed
run (including rejected writes), 1 for a permanent stage failure, 2 for arguments/setup, and 3 for a
retryable stage failure.

Current limitations remain explicit: no cross-worker rate cap, send cursor, config hash or retention
policy is added. A Graph call authorized before takeover can finish late; reconcile repairs its
effect. Long numeric values can lose precision, so exact long numbers require text mapping. See the
actual [HTTP precision and replay observation](src/run/tests/graph_http/README.md) and the progress
record's findings reconciliation. Workflow backends remain responsible for normal one-run-per-
integration scheduling, durable step replay and cancellation.

Expected checkpoint data under `tests/fixtures` is grounded independently in the agreed scenarios,
not captured from production output. Tests can construct every seam, remove scratch, and resume
from the published files. Parquet byte identity is deliberately not required. Exact request JSON,
ordered rows, and schemas remain required.

Run the new crate's checks with:

```sh
cargo nextest run -p hash-integrations-pipeline --all-features
cargo test -p hash-integrations-pipeline --doc --all-features
cargo clippy -p hash-integrations-pipeline --all-features --all-targets --no-deps
cargo doc -p hash-integrations-pipeline --all-features --no-deps
cargo fmt -p hash-integrations-pipeline --check
```

The full test suite starts isolated MinIO/PostgreSQL containers and local child processes. Docker must be
available. Required real Graph HTTP tests also need the isolated service described in the
[Graph acceptance setup](src/run/tests/graph_http/README.md); missing prerequisites fail the tests.
`../docs/pipeline/07-implementation-progress.md` records accepted milestones, reviews,
required remaining integration checks, and deferred findings. The specified row-file constructor
and boolean cells remain covered by the shared seam tests; production blocking writers use owned
paths, and production boolean tables are exported from workspace queries.
