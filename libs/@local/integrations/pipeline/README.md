# Ingestion pipeline

This crate is the replacement implementation specified in `../docs/pipeline`. Its shared
foundation is executable independently of the stage implementations. Existing integrations
engine and app callers remain unchanged.

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
available. `../docs/pipeline/07-implementation-progress.md` records accepted milestones, reviews,
required remaining integration checks, and deferred findings. Foundation-only dead-code
expectations are temporary until the sequential stage milestones provide production callers.
