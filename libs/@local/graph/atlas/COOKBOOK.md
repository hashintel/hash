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

- bind extraction provenance and bitemporal authorization axes into frozen input;
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

- The standalone `fit` command is concrete. It accepts checked-in version-1
  worker/request schemas, extracts a bounded current snapshot directly from
  HASH Graph PostgreSQL, runs SALT with Candle CPU, activates by compare-and-
  swap, and writes the serving trust configuration.
- The standalone `serve` command is complete and uses modern Axum with the
  Candle CPU checkpoint backend.
- The HTTP API is read-only and performs no request authorization, TLS
  termination, or rate limiting.
- `evidence_deferred_local` is operational but not release-grade assurance. It
  locally signs provisional reports and does not require external issuer
  processes. `m0_local_attestation` retains the independent external-issuer
  path. Both profiles still use application-attested PostgreSQL snapshot and
  WAL identities, and the final activation interval has no authorization-owned
  lease. See
  [`docs/quality-evidence-deferred.md`](docs/quality-evidence-deferred.md) and
  [`docs/authorization-consistency.md`](docs/authorization-consistency.md).
- SALT's stage graph remains crate-internal; `salt_fit::ProductionAtlasTrainer` is
  the narrow public operational façade.
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

That diagram is the strict operational contract. `m0_local_attestation` uses
the external issuer path. `evidence_deferred_local` replaces those external
decisions with local provisional signatures over the same persisted reports.
Both modes use the same artifact, candidate, CAS, and restart path, and both
substitute a repeatable-read PostgreSQL snapshot identity, live WAL revision
checks, and a locally bound extraction receipt. They check the WAL revision
immediately before activation but cannot exclude a policy mutation between that
read and the pointer replacement.

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

The fit worker loads only the release private key. Each external authority is
configured with an executable and a pinned public key; its private key must not
be readable by the fit-worker account. After immutable output exists, the
worker starts that executable directly, writes one version-1 JSON request to
standard input, and accepts one signed `ExternalGateGrant` from standard
output. The request contains `version`, absolute `atlasRoot`, exact `head`,
`gate`, `suiteVersion`, and `report`. Issuers have five minutes and 4 MiB per
output stream. A nonzero exit, timeout, malformed output, wrong report, wrong
scope, wrong key, or invalid signature fails the release.

The issuer is an independent approval boundary, not a signing oracle. It must
open the immutable generation named by `head`, rerun or validate its owned
suite and report, and sign only after that check succeeds. It must not trust
the requested report hash merely because the fit worker supplied it.

For relation-policy, authorization, and security gates, the signed report
identity is a derived envelope. It commits to the validated external report
hash and to the resolved policy or admitted geometry, edge snapshot, allow
list, and observed authorization revision as applicable. Changing a threshold
or admitted relation therefore requires new gate evidence even when the input
report file is unchanged.

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

Direct PostgreSQL extraction additionally enforces fixed aggregate ceilings of
4,000,000 type references, 256 MiB of type URL text, and 256 MiB of ontology
schema text. These process safety ceilings supplement the request's per-corpus
and per-link limits.

Projector schedules are rejected before training when their aggregate sampled
edge count or conservative host/device/autodiff working-set estimate exceeds
the M0 envelope (256 MiB per assembled batch). Optimizer schedules are capped
at 100,000 steps. Batch assembly reserves large host buffers fallibly, so an
allocation failure is reported rather than relying on the allocator abort path.

## Connect the `fit` CLI

The standalone binary uses `salt_fit::ProductionAtlasTrainer`. Both documents are
bounded to 16 MiB, reject unknown fields, and are described by:

- `schemas/fit-worker-v1.schema.json`
- `schemas/fit-request-v1.schema.json`
- `schemas/fit-input-bundle-v1.schema.json`

Start a worker directory from the checked-in documents:

```sh
mkdir -p ./atlas-worker/{inputs,issuers,secrets,var}
cp libs/@local/graph/atlas/config/m0-local-worker.default.json \
  ./atlas-worker/worker.json
cp libs/@local/graph/atlas/config/m0-local-request.default.json \
  ./atlas-worker/request.json
cp libs/@local/graph/atlas/config/m0-local-input-bundle.default.json \
  ./atlas-worker/inputs/m0-local-input-bundle.json
```

Then make these required edits:

1. Set a non-nil `actorId` and `requestId`.
2. Set PostgreSQL host, port, user, database, and write only the password plus
   one newline to `secrets/postgres.password`.
3. Create one 32-byte Ed25519 release seed. Its key file contains exactly 64
   lowercase hexadecimal characters plus an optional final newline and has
   mode `0600` (or `0400`). For `m0_local_attestation`, configure eight
   separately operated issuer executables through `issuerCommand`; each command
   must be a regular executable file beneath the worker directory. Put only
   each issuer's raw 32-byte public key in `expectedPublicKey`. The eight issuer
   secrets must be unavailable to the fit worker. `evidence_deferred_local`
   ignores these external command and key placeholders and derives visibly
   provisional local authorities from the release seed.
4. Place every input-bundle asset under `inputs/`; symlink and `..` escapes are
   rejected. Replace every `sha256` with the lowercase SHA-256 of the exact
   file bytes, then put the completed bundle's SHA-256 in
   `request.json` at `inputBundle.sha256`. Replace the five zero manifest
   provenance hashes with the identities issued by the embedding and relation
   evaluation pipelines.
5. Choose the web scope, sample target, deterministic seed, and hard limits in
   `request.json`. M0 requires at least one explicit `webIds` entry; it does not
   yet perform authorization-aware sampling across every database web.

The worker accepts loopback PostgreSQL only. Relative worker paths resolve
against the directory containing `worker.json`; generated serving
configuration records the resulting absolute Atlas root.

Command documents and the bundle document are limited to 16 MiB. Individual
content-addressed assets are limited to 512 MiB so a full relation-policy
matrix can cover the configured relation-type ceiling. Request limits cannot
raise the fixed process ceilings: 100,000 entities, 1,000,000 links, 4,096
relation types, 1,024 required types per link, 1 MiB of labels, 1,024 web IDs,
and 128 Rayon threads.

Run the worker from a dedicated OS account and do not allow another process to
rename or replace directories beneath the worker configuration or input roots
during a fit. M0 opens final files with no-follow semantics and verifies every
input content hash, but it does not yet traverse parent directories through a
persistent `openat`-style capability.

The input bundle must contain:

- an inline non-generated manifest contract naming the embedding producer,
  relation/annotation corpora, classifier/applicability versions, and serving
  wire/companion versions;
- a complete `classifier.salt` SALT classifier artifact;
- one full 3,072-component relation-card embedding and unit strength for every
  extracted relation type;
- passing relation-policy and security reports bound to both the classifier
  and relation-policy-input SHA-256 values;
- a canvas companion; and
- a passing companion report bound to the companion SHA-256.

External reports use this strict envelope:

```json
{
  "schemaVersion": 1,
  "suiteVersion": "your-suite-v1",
  "outcome": "pass",
  "subjects": {
    "classifier": "<classifier-sha256>",
    "relationPolicyInputs": "<policy-input-sha256>"
  }
}
```

The companion report uses one `companion` subject instead. Report files are
content-addressed independently; a subject artifact cannot masquerade as its
report. `suiteVersion` is not a free label: the relation-policy report must
equal `manifest.relations.policyPrecedenceVersion`, the security report must
equal `manifest.serving.authorizationAdapterVersion`, and the companion report
must equal `manifest.serving.canvasCompanionVersion`.

The public bundle contract cannot supply a generation ID, artifact hash,
release head, execution contract, or gate result. SALT creates those claims
from measured output. All five provenance hashes in the inline contract must
be nonzero, and class priors and volume fractions are validated as
probabilities.

Relation-policy inputs use:

```jsonc
{
  "schemaVersion": 1,
  "relations": {
    "https://example.com/types/entity-type/related-to/v/1": {
      "embedding": [0.1, -0.2 /* exactly 3,072 finite f32 values */],
      "strength": 1.0,
      "humanOverride": null,
      "humanReviewed": null,
      "synthetic": {
        "coincident": 0.0,
        "proximal": 1.0,
        "overlay": 0.0,
      },
    },
  },
}
```

`m0-local-v1` rejects a strength-head input and any non-unit strength. The
classifier remains authoritative unless a higher-precedence posterior is
present. Multi-direct-type link selection is documented in
[`docs/relation-type-selection.md`](docs/relation-type-selection.md).

The immutable recommended numerical profile uses five conditions from zero to
one and publishes the fully relation-conditioned `V = 1` field, 30 semantic
graph neighbors, up to 4,096 landmarks, 200 landmark epochs, the 512-wide
four-block projector, 2,000 optimizer steps, a 512-square analytic raster,
exact representation-prefix auditing through 50 neighbors, bounded semantic
probes, web-scoped subgroup probes, and a two-sided persistence envelope with
three planted-shape checks. At least 51 complete embedding rows and one induced
relation are required. A single-web fit has only the whole web as an eligible
subgroup, so its subgroup gate is reported as `partially_measured`.

Run a fit first:

```sh
cargo run -p hash-graph-atlas --bin hash-graph-atlas -- \
  fit --config ./atlas-worker/worker.json \
  --request ./atlas-worker/request.json
```

Success prints one versioned JSON receipt containing exact request, worker
configuration, input-bundle, and resolved numerical-profile hashes;
request/actor/snapshot identities; distinct extraction-time and
permission-time authorization revisions; entity/link/relation counts;
multi-type ambiguity count; generation, manifest, and release-report hashes; a
provenance class for every mandatory gate; measured phase timings; the
explicit activation result; restart verification; and the generated
serving-configuration path. `activation` is `activated` or `already_active`.

In `m0_local_attestation`, the receipt classifies numerical, recall,
relation-satisfaction, persistence,
and reproducibility gates as `runner_measured`; relation-policy, security, and
companion reports as `externally_measured`; the reduced M0 subgroup audit as
`partially_measured`; and authorization/snapshot claims as
`local_attestation`. These labels describe evidence provenance and do not
upgrade the documented authorization consistency envelope. In
`evidence_deferred_local`, every gate is explicitly classified as `deferred`.

The local semantic suite uses up to 256 deterministic anchors. For each anchor
it chooses the expected neighbor from 32 deterministic candidates using the
cosine distance over the full 3,072-component canonical embedding, then
measures that neighbor's rank in the projected field. This is a bounded sampled
gate, not a claim of exhaustive full-corpus map-neighbor recall.

The fit captures and authenticates the existing active head before numerical
work. A replacement activates only if that exact head is still current; a
concurrent activation fails closed. On success the worker atomically writes
`servingConfigOutput` with public verification keys only. Pass that generated
path to the separate `serve` command; there is no combined fit-and-serve mode:

```sh
cargo run -p hash-graph-atlas --bin hash-graph-atlas -- \
  serve --config ./atlas-worker/var/atlas-api.json
```

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
  ],
  "allow_evidence_deferred": false,
  "tile_point_budget": 4096
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

Set `allow_evidence_deferred` to `true` only for a server intentionally
accepting generations fitted with `evidence_deferred_local`. The `fit` command
sets this field in its generated serving configuration to match the fitted
generation.

Startup behavior is fail-closed:

- No `active.json`: startup fails and instructs the operator to run `fit`.
- Invalid trust configuration: startup fails.
- Evidence-deferred active generation without explicit permission: startup fails.
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

Fetch the root tile for the active generation and canonical variant:

```sh
generation="$(curl -fsS http://127.0.0.1:4010/v1/atlas/current | jq -r .generation)"
variant="$(curl -fsS http://127.0.0.1:4010/v1/atlas/current/manifest | \
  jq -r .variants.canonical_variant)"
curl -fS \
  "http://127.0.0.1:4010/v1/atlas/tile/${generation}/${variant}/0/0/0" \
  --output root.atlas-tile-v2
```

Fetch quadrant `(x = 2, y = 1)` at zoom 3:

```sh
curl -fS \
  "http://127.0.0.1:4010/v1/atlas/tile/${generation}/${variant}/3/2/1" \
  --output quadrant.atlas-tile-v2
```

Tile responses include:

- `Content-Type: application/vnd.hash.atlas.tile-v2`;
- `ETag` set to the quoted hash of the exact response bytes;
- exact `Content-Length`;
- complete visible and delivered counts in both the binary header and response
  headers; and
- `Cache-Control: public, max-age=31536000, immutable`.

The generation must be active, the variant must be published and have a
materialized base, `z` must be at most 16, and each axis must be below `2^z`.
The unrestricted artifact-stream route is not public. See
[`docs/tile-wire-v2.md`](docs/tile-wire-v2.md) for exact bytes and quadrant
math.

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

Exercise the direct current-snapshot SQL against a migrated development
database with `pgvector` (the test uses temporary shadow tables and does not
touch graph rows):

```sh
HASH_GRAPH_PG_HOST=127.0.0.1 \
HASH_GRAPH_PG_PORT=5432 \
HASH_GRAPH_PG_USER=graph \
HASH_GRAPH_PG_PASSWORD=graph \
HASH_GRAPH_PG_DATABASE=graph \
cargo test -p hash-graph-atlas --lib \
  live_repeatable_read_extracts_one_complete_current_snapshot \
  -- --ignored --nocapture
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

### Fit fails before connecting to PostgreSQL

Check non-nil identities, file-relative paths, content hashes, key-file modes,
distinct authority names/keys, and expected public keys. Configuration and
input-bundle validation intentionally completes before opening the database.

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

### Tile request returns 400 or 404

Confirm the generation matches the active head, use the manifest's canonical
variant, keep zoom in `0..=16`, and keep both axes below `2^z`. A 404 for the
former raw-artifact route is expected.

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

- replace the local WAL revision with an authorization-owned revision and
  activation lease;
- replace application snapshot identities with a store-issued extraction
  receipt;
- add additional versioned numerical profiles or a production accelerator
  backend;
- add authenticated and authorized HTTP middleware;
- add operational key rotation;
- implement enabled base-plus-delta readers, replay, and compaction; and
- add deployment-specific metrics and health/readiness policy.

Keep these additions outside immutable numerical and evidence contracts unless
they genuinely change generated content. When they do, update the relevant
versioned content-hash domain or artifact format rather than relying on an
untracked configuration field.
