# HASH Graph Atlas SALT cookbook

This cookbook is the practical entry point for developing, fitting, publishing,
and serving a SALT atlas. It documents the behavior implemented in
`libs/@local/graph/atlas`, including the current integration seams and
limitations.

SALT is not only a layout algorithm. A successful run freezes one authorized
graph snapshot, builds and evaluates a relation-conditioned atlas, writes
immutable artifacts, verifies signed release evidence, publishes an inactive
candidate, explicitly activates it, and proves that the result reloads after a
restart.

## Choose the correct Atlas path

This crate currently contains two Atlas implementations:

- `projection` is the established PostgreSQL sampling and alpha-layout path. It
  publishes `layout-aXXX.f32`, encoder checkpoints, hubs, and projection
  metadata.
- `salt` is the immutable, content-addressed generation path documented here.
  It publishes one canonical relation-conditioned field, typed binary
  artifacts, signed release evidence, a compare-and-swap active pointer, and
  legacy canvas compatibility files.

The two paths are complementary. Do not use a `projection` loader for SALT
artifacts or treat SALT's legacy layout file as its complete serving contract.

## What to expect today

The implemented SALT generation core can:

- bind extraction provenance to one bitemporal authorization snapshot;
- consume full 3,072-component embeddings and a normalized 512-component
  projector prefix;
- fit or consume relation-policy models;
- build and exact-audit a semantic ANN graph;
- select and fit a deterministic landmark reference;
- train a globally relation-conditioned projector;
- evaluate and select a condition ladder;
- quantize and evaluate the exact coordinates later served to readers;
- derive density, persistence, regions, labels, importance buckets, and Morton
  indexes;
- publish and semantically verify every artifact;
- require measured and independently signed release gates;
- publish without activation;
- activate through compare-and-swap; and
- reload the active generation through the restart verification path.

The current process envelope has deliberate seams:

- The standalone `fit` command has no graph-specific request schema and uses
  `UnconfiguredAtlasTrainer`, which always returns an error. An embedding
  application must inject an `AtlasTrainer`.
- The standalone `serve` command is complete and uses modern Axum with the
  Candle CPU checkpoint backend.
- The HTTP API is read-only and performs no request authorization, TLS
  termination, or rate limiting.
- SALT's typed generation runner is crate-internal. A direct adapter currently
  lives inside this crate, or an application exposes its own public wrapper.
- Concrete serving accepts only `BaseRevision(0)` with `DeltaRevision(0)`.
  Base-plus-delta traits exist, but incremental mutation is not enabled.
- A release generation is built twice from the same frozen input. The isolated
  reproduction must match before any external grant is requested.
- Opening an artifact copies it once into a private unlinked file before
  mapping. This protects live readers from path mutation, but it requires
  temporary storage proportional to the opened artifact set.

## Build and inspect the commands

Run commands from the repository root. The workspace pins the Rust toolchain
and enables the nightly `portable_simd` feature used by SALT kernels.

```sh
cargo build -p hash-graph-atlas --bin hash-graph-atlas
cargo run -p hash-graph-atlas --bin hash-graph-atlas -- --help
cargo run -p hash-graph-atlas --bin hash-graph-atlas -- fit --help
cargo run -p hash-graph-atlas --bin hash-graph-atlas -- serve --help
```

The package script is an equivalent command envelope:

```sh
yarn workspace @rust/hash-graph-atlas start --help
```

The first Burn build can be substantial because the crate includes CPU and
platform GPU backends. The standalone server nevertheless loads checkpoints
with the pinned Candle CPU backend.

## Understand the lifecycle

One complete production run follows this order:

```text
source extraction
  -> temporal and authorization revision binding
  -> exact-edition permission checks for every representation row
  -> relation permission and coordinate-influence filtering
  -> frozen canonical input
  -> isolated reproduction build
  -> primary build
  -> durable projector checkpoint decode and architecture verification
  -> reproduction equality check
  -> external report grants
  -> signed complete gate report
  -> inactive candidate marker
  -> authorization revision recheck
  -> explicit compare-and-swap activation
  -> independent active-generation reload
```

The distinction between candidate and active state is important:

- Generating files does not make them visible.
- A valid manifest does not make them visible.
- Passing gate files do not make them visible.
- Publishing `candidate.json` does not make them visible.
- Only a successful compare-and-swap update of `active.json` changes the
  serving head.

If any earlier step fails, the existing active pointer is unchanged.

## Compose a production fit

The implementation composition point is
`salt::generation::runner::run_store_backed_canonical_generation` in
`src/salt/generation/runner/production.rs`. It combines:

1. A `StoreBackedGenerationSource` containing extracted rows, complete
   embedding corpora, relation candidates and policy inputs, support signals,
   and an initial manifest contract.
2. A `StoreBackedSnapshotRequest` containing the graph store, actor,
   bitemporal axes, store-issued extraction receipt, authorization revision
   provider, and frozen relation security policy.
3. A `CanonicalGenerationConfig` containing all numerical, sampling,
   materialization, quality, and output settings.
4. A `CanonicalReleaseAuthority` containing the release signer, external gate
   grant issuer, and complete verifier set.
5. A Burn autodiff device for projector fitting.

Permission calls are asynchronous, but the numerical and publication pipeline
after authorization is a long-running synchronous workload. Run it in a
dedicated fitting worker or process. Do not execute it directly on an Axum
request task that also serves latency-sensitive traffic.

### Bind extraction and authorization

Construct `SnapshotTemporalAxes` from the exact ontology transaction time,
knowledge transaction time, knowledge decision-time policy, and store-issued
repeatable-read transaction identity recorded in the input snapshot manifest.
The runner rejects a mismatch before querying permissions.

Provide an `AuthorizationRevisionProvider` whose nonzero content identity
changes whenever any permission result can change. The runner reads this value
before and after entity and entity-type permission calls. A changed value
aborts the complete snapshot.

The same authority must implement `AuthorizationActivationLeaseProvider`.
Lease acquisition atomically confirms the frozen revision and prevents every
permission-relevant revision change until activation has written `active.json`.
A final standalone revision read is insufficient because candidate verification
occurs before the active-pointer compare-and-swap.
`CoordinatedAuthorizationProviderAdapter` wires these two operations when the
embedding application already has suitable asynchronous authority callbacks.
The current HASH Graph deployment explicitly defers cross-process revision and
snapshot linearization; the accepted gap and future options are documented in
[`docs/authorization-consistency.md`](docs/authorization-consistency.md).

Provide a `StoreExtractionReceiptVerifier` for an opaque receipt issued by the
extracting store. Verification must bind the actor, temporal axes,
authorization revision, ontology and knowledge identities, and the complete
frozen-input hash. A callback that merely returns a caller-chosen hash is not a
production receipt authority. In particular, the verifier must authenticate
the store snapshot identity carried by the temporal axes.

Every `LinkCandidate` must contain:

- the selected link entity edition;
- both selected endpoint editions;
- the relation type; and
- the complete required entity-type closure resolved in the same extraction
  snapshot.

Visibility authorization happens before relation security policy. Do not
pre-filter candidates in a way that prevents the runner from recording the
correct aggregate rejection evidence.

### Supply quality-suite authorities

`ConditionQualitySuiteAdapter` and `PersistenceQualitySuiteAdapter` turn
application callbacks into the typed evaluator contracts consumed by the
runner.

The condition evaluator must measure the supplied field and return immutable
semantic-fidelity and subgroup report hashes. For release evaluation, it
receives the already quantized field whose hash will be published.

The persistence evaluator receives the candidate and landmark-reference merge
trees plus the checkpoint and field identities. It must return:

- low-persistence mass for candidate and reference;
- noise persistence for candidate and reference;
- a nonempty planted-shape suite with zero failures; and
- immutable distribution, planted-shape, and noise report hashes.

An adapter callback is authority, not decoration. It must fail instead of
inventing a report hash when its underlying suite cannot complete.

### Supply release authorities

There are two signature layers:

- The release authority signs every typed gate document for one exact release
  head.
- Independent external authorities sign report-backed grants for the gates
  they own.

The required external gates are:

- `representation`
- `semantic-fidelity`
- `relation-policy`
- `merge-tree-persistence`
- `subgroup-behavior`
- `authorization-noninterference`
- `security-approval`
- `companion-pin`

The external grant issuer must return grants for the exact head, gate, suite
version, and report hash requested by the runner. A subject hash is not a
substitute for a report hash. Report identities are domain-separated: a report
cannot reuse a policy, geometry, allow-list, companion-binary, extraction, or
other report identity.

### Account for reproducibility cost

The store-backed runner first builds an isolated reproduction under a temporary
directory and then builds the primary generation. It compares manifests and
artifact outputs before issuing release evidence.

The manifest records both the running executable fingerprint and a structured
execution contract. M0 generation accepts only `autodiff<candle<cpu>>`; the
contract binds the workspace dependency lock, compiler and target settings,
operating-system math runtime, runtime CPU features, Candle and Rayon thread
counts, floating-point control registers, mapped system-math image identities,
selected GEMM kernel, cache geometry and packing thresholds, SALT SIMD mode,
USearch version, compiled and available ISA sets, and the ISA selected for both
512-dimensional cosine and two-dimensional squared-L2 indexes. On macOS the
executable fingerprint and math images use their mapped Mach-O UUIDs rather
than replaceable paths. The M0 CPU path does not enable Accelerate, whose
runtime framework arithmetic would otherwise sit outside this identity.

Plan for approximately two projector fits and two complete artifact builds per
release attempt. The reported `training_wall_time` is the primary projector
fit, not total process wall time.

Projector schedules are rejected before training when their aggregate sampled
edge count or conservative host/device/autodiff working-set estimate exceeds
the M0 envelope (256 MiB per assembled batch). Optimizer schedules are capped
at 100,000 steps. Batch assembly reserves large host buffers fallibly, so an
allocation failure is reported rather than relying on the allocator abort path.

## Connect the `fit` CLI

The CLI treats request JSON as application-owned bytes. It enforces a 16 MiB
limit and validates JSON syntax, but it does not assign semantics to fields.
This lets an embedding application evolve extraction and deployment settings
without putting credentials or graph-specific policy in the generic command
module.

Inject an `AtlasTrainer` into `cli::run_with`. A callback-backed binary has this
shape:

```rust,ignore
use hash_graph_atlas::cli::{
    AtlasCliError, AtlasFitError, CallbackAtlasTrainer, FitRequest, FitReceipt,
    run_with,
};

#[tokio::main]
async fn main() -> Result<(), AtlasCliError> {
    let trainer = CallbackAtlasTrainer::new(|request: FitRequest| async move {
        // Decode an application-owned request schema, construct the store-backed
        // SALT composition, and return only after activation and restart reload.
        application::fit_atlas(request.source(), request.bytes())
            .await
            .map_err(|error| AtlasFitError::new(error.to_string()))
    });

    run_with(std::env::args_os(), &trainer).await
}
```

The adapter's success value is:

```json
{
  "generation": "<sha256-generation-id>",
  "manifest_hash": "<sha256-manifest-hash>",
  "release_report_hash": "<sha256-release-report-hash>",
  "activation": "activated"
}
```

`activation` can also be `already_active` for an idempotent repeat.

Running `fit` with the repository's standalone binary demonstrates the
unconfigured boundary and is expected to fail:

```sh
cargo run -p hash-graph-atlas --bin hash-graph-atlas -- \
  fit --request ./atlas-fit-request.json
```

Use the application binary that injects your trainer for an actual fit. There
is currently no REST training or activation endpoint.

## Inspect the published files

For generation ID `<generation>`, the storage root has this shape:

```text
<root>/
  .activation.lock
  active.json
  generations/
    <generation>/
      candidate.json
      manifest.json
      classifier.salt
      representations.salt
      semantic.salt
      relations.salt
      landmarks.salt
      landmark-reference.salt
      projector.mpk
      base.salt
      analytics.salt
      layout-aXXX.f32
      salt-identities-aXXX.json
      salt-export-aXXX.json
      gate-evidence/
        ...
      release-report.json
```

Do not edit a published generation in place. Publication is no-clobber and
idempotent only when existing bytes are identical. Any mismatch is corruption
or an identity/configuration defect and fails closed.

The activation and generation records have different meanings:

- `generations/<generation>/candidate.json` identifies that immutable
  generation as a published gated candidate.
- `active.json` names the exact release currently visible to readers.
- `.activation.lock` coordinates compare-and-swap updates across processes.

Copy the complete referenced generation directory when backing up or
replicating a pointer. A pointer without its generation is not recoverable
state.

## Configure the read-only server

The server configuration pins trust roots. Public keys are raw 32-byte Ed25519
verification keys encoded as exactly 64 lowercase hexadecimal characters.
Authority names and keys must match the active generation's manifest and
external grants.

Use this template and replace every placeholder:

```json
{
  "root": "/var/lib/hash/atlas",
  "release_verifier": {
    "authority": "atlas-release",
    "public_key": "<64-lowercase-hex-ed25519-public-key>"
  },
  "external_verifiers": [
    {
      "gate": "representation",
      "authority": "representation-audit",
      "public_key": "<64-lowercase-hex-ed25519-public-key>"
    },
    {
      "gate": "semantic-fidelity",
      "authority": "semantic-suite",
      "public_key": "<64-lowercase-hex-ed25519-public-key>"
    },
    {
      "gate": "relation-policy",
      "authority": "relation-policy-review",
      "public_key": "<64-lowercase-hex-ed25519-public-key>"
    },
    {
      "gate": "merge-tree-persistence",
      "authority": "persistence-suite",
      "public_key": "<64-lowercase-hex-ed25519-public-key>"
    },
    {
      "gate": "subgroup-behavior",
      "authority": "subgroup-suite",
      "public_key": "<64-lowercase-hex-ed25519-public-key>"
    },
    {
      "gate": "authorization-noninterference",
      "authority": "authorization-suite",
      "public_key": "<64-lowercase-hex-ed25519-public-key>"
    },
    {
      "gate": "security-approval",
      "authority": "security-review",
      "public_key": "<64-lowercase-hex-ed25519-public-key>"
    },
    {
      "gate": "companion-pin",
      "authority": "client-release",
      "public_key": "<64-lowercase-hex-ed25519-public-key>"
    }
  ]
}
```

The verifier set must contain each required external gate exactly once. Do not
"rotate" a key only by editing this file: existing grants remain signed by the
old key. Publish and activate a generation whose manifest and grants bind the
new trust material.

Start the server on the default loopback address:

```sh
cargo run -p hash-graph-atlas --bin hash-graph-atlas -- \
  serve --config ./atlas-server.json
```

Choose another trusted bind address explicitly:

```sh
cargo run -p hash-graph-atlas --bin hash-graph-atlas -- \
  serve --config ./atlas-server.json --bind 127.0.0.1:8080
```

Startup behavior is fail-closed:

- No `active.json`: startup succeeds; current-state routes return 404.
- Invalid trust configuration: startup fails.
- Active pointer with missing or invalid candidate, evidence, manifest,
  artifact, or checkpoint: startup fails.
- Completely verified active generation: startup loads and caches it.

SIGINT and, on Unix, SIGTERM trigger graceful shutdown.

## Query the API

The health endpoint proves only that the process is responding:

```sh
curl -i http://127.0.0.1:4010/healthz
```

Inspect active release and artifact metadata:

```sh
curl -fsS http://127.0.0.1:4010/v1/atlas/current | jq
```

Fetch the manifest:

```sh
curl -fsS http://127.0.0.1:4010/v1/atlas/current/manifest | jq
```

Fetch an artifact by the exact `relative_path` returned by the current endpoint
or manifest:

```sh
curl -fS \
  http://127.0.0.1:4010/v1/atlas/current/artifacts/base.salt \
  --output base.salt
```

Resume or inspect a byte range:

```sh
curl -fS \
  -H 'Range: bytes=0-65535' \
  http://127.0.0.1:4010/v1/atlas/current/artifacts/base.salt \
  --output base-prefix.bin
```

Artifact responses include:

- `ETag` set to the quoted artifact content hash;
- `Accept-Ranges: bytes`;
- exact `Content-Length`;
- `Content-Range` for partial responses; and
- `Cache-Control: no-cache`.

Only one byte range is accepted. Path traversal, empty path segments, backslash
segments, and paths absent from the verified manifest return 404. Invalid,
multiple, or unsatisfiable ranges return 416.

The API checks `active.json` on every current-state request. If activation
changes, it reopens the new generation on a blocking worker and replaces the
cache only after complete verification. Requests already holding the previous
generation finish against its immutable mappings.

## Consume the legacy canvas export

Each generation also publishes:

- `layout-aXXX.f32`: row-major little-endian `(x, y)` `f32` values in
  generation-row order;
- `salt-identities-aXXX.json`: generation row to web/entity/draft identity; and
- `salt-export-aXXX.json`: the discoverability document binding condition,
  quantization step, coordinate field, row count, filenames, and file hashes.

Read `salt-export-aXXX.json` first and verify the two named files before use.
The release loader performs the same semantic cross-check against `base.salt`;
the layout cannot be replaced by a different hash-consistent coordinate field.

The legacy files are compatibility outputs. New readers should prefer the
manifest-listed binary artifacts and explicit identity sections.

## Run the upstream audit tools

The Python package in `tools/atlas-tools` remains the source of several
independent reports consumed through SALT adapters:

- `audit` measures truncated-prefix information against full 3,072-dimensional
  embeddings;
- `battery` runs planted-shape, neighborhood, contraction, persistence, and
  no-structure-from-noise layout gates; and
- `relation` produces relation-policy corpora, classifier artifacts, and
  policy reports.

From `tools/atlas-tools`, start with:

```sh
uv run audit --help
uv run battery --help
uv run relation --help
```

A small audit or battery smoke run should precede full-corpus work:

```sh
uv run audit synth-fixture --out X.f32
uv run audit run --embeddings X.f32 --dims 512 --k 50 \
  --sample 1000 --backend auto --out report-smoke/

uv run battery run --suite suites/smoke.yaml \
  --engines engines/default.yaml --out runs/dev/ --jobs 4
```

Read `tools/atlas-tools/README.md` and
`tools/atlas-tools/COOKBOOK.md` for the production relation pipeline and report
formats. These tools do not automatically authorize a Rust release: the fit
adapter must verify their persisted reports, provide their content hashes, and
issue or obtain the corresponding signed external grants.

## Verify changes

Run the focused unit suite:

```sh
cargo test -p hash-graph-atlas --lib
```

Run only SALT tests while iterating:

```sh
cargo test -p hash-graph-atlas --lib salt::
```

Check formatting, Clippy, documentation, and whitespace:

```sh
cargo fmt --all -- --check
cargo clippy -p hash-graph-atlas --all-targets \
  --features salt-benchmarks
cargo doc -p hash-graph-atlas --no-deps --document-private-items
git diff --check
```

`--document-private-items` is important while SALT remains crate-internal; it
renders the module theory and item contracts that maintainers need to compose a
fit.

## Run quality-gated benchmarks

SALT benchmarks assert correctness or quality before timing.

Stage wall-time benchmarks validate ANN recall and analytic persistence:

```sh
cargo bench -p hash-graph-atlas --features salt-benchmarks --bench salt
```

The kernel benchmark validates SIMD prefix normalization against an independent
scalar oracle before measuring it:

```sh
cargo bench -p hash-graph-atlas --features salt-benchmarks \
  --bench salt_kernels
```

On Apple hardware, `salt_kernels` uses `darwin-kperf-criterion` retired
instruction counters and requires the elevated access described by the
benchmark error. Other benchmark reporting uses Criterion-compatible wall
time. Codspeed consumes the same benchmark definitions in CI.

Do not accept a faster result whose pre-timing quality assertion fails. Runtime
comparisons are meaningful only after recall, scalar-oracle, persistence, and
region assertions pass.

## Diagnose common failures

### `no Atlas fitting adapter is configured for this binary`

You ran the repository's standalone binary with `fit`. Build or run the
application binary that injects an `AtlasTrainer`.

### `no Atlas generation is active`

The server is healthy but `active.json` is absent. Complete explicit activation
or point the server at the correct storage root.

### API trust configuration is invalid

Check that:

- every key is exactly 64 lowercase hexadecimal characters;
- every key is a valid raw Ed25519 public key;
- all eight external gates appear exactly once; and
- authority names and keys match the generation manifest and grants.

### Server fails while loading active state

Treat this as integrity failure, not as a cache miss. Inspect the error chain for
candidate, evidence, manifest, artifact schema, content hash, or projector
checkpoint mismatch. Restore the complete immutable generation or
compare-and-swap back to a previously verified candidate. Do not edit files to
make hashes agree.

### Activation conflict

Another process changed the active release after your expected value was read.
Reload current state, decide whether the new release should remain active, and
retry with that exact expected pointer. Do not overwrite `active.json`
manually.

### Existing generation file differs

The same generation identity is attempting to publish different bytes. This is
a determinism, configuration identity, or corruption defect. Preserve both
outputs for comparison and investigate; choosing one arbitrarily defeats
content addressing.

### ANN output changes across machines

USearch's transient HNSW graph is not the portable record. Compare the pinned
backend identity, persisted `semantic.salt` neighbor table, and exact-recall
evidence. Release reproducibility requires generated outputs to match under the
declared toolchain.

### Artifact startup uses substantial temporary disk

Verified loading snapshots each source artifact into a private unlinked
temporary file before memory mapping. Ensure the process temporary directory
has room for the active artifact set. This is the safety boundary that prevents
later path truncation or writes from invalidating live mappings.

### HTTP range request returns 416

Send one `bytes=` range only. The start must be below artifact length, an
explicit end must not precede the start, and a suffix length must be nonzero.

## Production checklist

Before exposing a serving process:

- keep the Atlas root and temporary directory on durable storage with enough
  capacity for two generation builds and private load snapshots;
- keep every generation directory immutable;
- back up active and candidate pointers together with all referenced
  generation directories;
- pin the release verifier and all eight external verifier keys from a trusted
  deployment source;
- bind the current unauthenticated API to loopback or a trusted internal
  network;
- put authentication, tenant authorization, TLS, request limits, and
  observability in the surrounding service;
- size generation time for two complete deterministic builds;
- monitor `hash_graph_atlas::salt` tracing events for stage wall time;
- run quality-gated benchmarks on the intended deployment architecture; and
- prove restart loading before considering a fit successful.

## Expected extension points

The current envelope is intentionally small. The next integration work normally
belongs at these boundaries:

- define an application-owned typed fit request;
- expose a stable public wrapper around the crate-internal store-backed runner;
- choose and configure a production Burn training/inference backend;
- add authenticated and authorized HTTP middleware;
- add operational key rotation;
- implement enabled base-plus-delta readers, replay, and compaction; and
- add deployment-specific metrics and health/readiness policy.

Keep these additions outside immutable numerical and evidence contracts unless
they genuinely change generated content. When they do, update the relevant
versioned content-hash domain or artifact format rather than relying on an
untracked configuration field.
