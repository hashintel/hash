# `hash-graph-atlas`

Fits 2D maps over the entity embeddings stored in the HASH Graph, blending
semantic similarity (what entities mean) with relational structure (how they
connect), and serves the fitted maps as a read-only HTTP API of binary tiles
that a GPU renderer consumes directly.

The design trades flexibility for verifiability: a fit publishes one
**immutable, content-addressed generation** of typed binary artifacts, every
pipeline stage is deterministic (an equal seed over an equal snapshot
replays every draw), and everything downstream is fail-closed - a
generation that cannot prove its own integrity does not serve, and a
request that cannot be answered exactly is refused by name rather than
answered approximately.

## Quick start

The workspace pins the required nightly toolchain; build from the
repository root. The operator commands ride the `hash-graph` binary's
`atlas` subcommand; a production fit on macOS additionally wants the
crate's `gpu` feature (Metal-backed projector training - the CPU
backend is the test harness):

```sh
cargo build -p hash-graph
```

Fit a generation from a running graph store and activate it (store
flags default to the graph's `HASH_GRAPH_PG_*` environment; exactly
one of `--annotations` and `--classifier` supplies the relation
classifier):

```sh
cargo run -p hash-graph --features hash-graph-atlas/gpu -- \
  atlas fit --root /var/lib/hash/atlas \
  --annotations annotation-corpus.json
```

Quality thresholds default to maximally permissive values (the gate
demands evidence presence rather than fidelity); impose measured
bounds with `--quality-thresholds thresholds.json`:

```json
{
  "minimum_recall": 0.95,
  "maximum_density_spread": 0.5
}
```

The six fields are `minimum_recall`, `minimum_trustworthiness`,
`minimum_continuity`, `maximum_intrusion_rate`,
`minimum_triplet_agreement` (each in `[0, 1]`) and
`maximum_density_spread` (finite, non-negative); out-of-domain
values and unknown fields refuse the run before it starts.

Success prints a receipt and writes an admission report:

```text
generation  2481c360...
nodes       864738
edges       1204211
recall      0.9873
...
report      admission-report.json
```

`hash-graph atlas fit --help` documents the full option set: seeding,
landmark capacity, relation-annotation inputs, projector steps, and the
baseline escape hatch.

Serve the active generation and read from it (`atlas` with no
subcommand serves - the deployment default):

```sh
cargo run -p hash-graph -- atlas --root /var/lib/hash/atlas
```

```sh
generation="$(curl -fsS http://127.0.0.1:4003/v1/atlas/current | jq -r .generation)"
curl -fsS "http://127.0.0.1:4003/v1/atlas/generation/${generation}/manifest" | jq
curl -fS -X POST \
  "http://127.0.0.1:4003/v1/atlas/tile/${generation}/plain/0/0/0" \
  --output root.saltile
```

## Concepts

Five terms carry the whole model:

- A **generation** is one fitted, published map: a directory of binary
  artifacts named by the SHA-256 of its metadata document. Generations
  never change after publication; new data means a new generation.
- A **variant** is one layout of a generation. Version 1 publishes exactly
  one, named `plain`.
- A **row id** identifies a node row within one generation; edges carry
  their link entity's raw 32-byte identity instead. On the
  wire, row ids are opaque values issued through a keyed permutation of
  the full u32 range: consistent across every endpoint of one
  generation, never bounded by the generation's row count, and not
  stable across generations - clients re-translate after a generation
  change. The permutation's design target is that ids carry no
  ordering, adjacency, or count information; that hiding is the
  construction's target, not a demonstrated boundary. Treat ids as
  meaningless handles either way.
- **Tiles** quadtree the map. Each fitted point carries an importance
  bucket, and a tile at zoom `z` delivers exactly the points whose bucket
  clears the zoom's cut - deeper zooms deliver less important points. The
  manifest's `bucketSchedule` publishes the schedule, so delivery is a
  scheduled delivery a pure function of `(generation, z, x, y)`.
- The **manifest** is the per-generation bootstrap read: wire version,
  variant names, bucket schedule, and `limits` - request caps published
  as data, each read from the value its handler enforces. Everything a
  client needs before its first tile.

The serving read path is `current` (which generation?) then `manifest`
(how does it speak?) then tiles, edges, locate, and translate - geometry
and configuration pinned per generation, detail trailers hydrated live.

## The serving surface

| Route                                               | Method | Answer                                                                                    |
| --------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| `/status`                                           | GET    | process liveness                                                                          |
| `/v1/atlas/current`                                 | GET    | the served generation id - the one mutable read                                           |
| `/v1/atlas/generation/{generation}/manifest`        | GET    | wire version, variants, bucket schedule, enforced limits                                  |
| `/v1/atlas/tile/{generation}/{variant}/{z}/{x}/{y}` | POST   | one tile: positions, row ids, optional type masks and detail trailer                      |
| `/v1/atlas/edges/{generation}/{variant}`            | POST   | the edges among the listed tiles' delivered rows                                          |
| `/v1/atlas/locate/{generation}/{variant}`           | POST   | an ego-graph by entity id or wire row id: fly-to cell, the source's edges, their partners |
| `/v1/atlas/translate/{generation}/{variant}`        | POST   | upstream entity ids to row ids and positions (JSON)                                       |
| `/v1/atlas/openapi.json`                            | GET    | the OpenAPI document, pre-rendered at startup                                             |
| `/v1/atlas/openapi`                                 | GET    | a browsable API reference                                                                 |

The API documents itself - the OpenAPI reference is the authoritative
per-route contract; the notes below are the semantics that span routes.

Binary responses ship `application/vnd.hash.saltile-v1` envelopes with
`Cache-Control: private, no-store`: the client's application-layer cache
is the cache, keyed by authorization context, generation, route, and
canonical query. The manifest is cacheable for the generation's
lifetime. Identical requests yield identical geometry bytes, per
generation, server secret, and serving caps; detailed responses hydrate their trailers
live from the store and leave the immutable cache - cache the geometry
surfaces, refetch detail.

Rejections from the handlers are RFC 9457 `application/problem+json`
documents whose `type` is a stable root-relative URI
(`/problems/atlas/unknown-generation`, `/problems/atlas/invalid-coordinate`,
...). Requests the framework's extractors reject - malformed bodies,
unparsable paths - answer plain rejections instead. `unknown-generation`
means the route names a generation this process does not serve: re-read
`current` and retry.
Entities that do not exist and entities the caller may not see answer
byte-identically - existence is never disclosed through an error shape.

### Server configuration

Flags with environment fallbacks; absent flags read documented defaults.
Each published manifest limit reads the value its handler enforces (one
source, so an advertised limit never disagrees with enforcement); not
every cap is published - the edge-count truncation cap (`--edges`)
shapes responses without a manifest row:

| Flag                                                                                                                | Environment               | Default                   | Meaning                                                    |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------- | ---------------------------------------------------------- |
| `--root`                                                                                                            | `HASH_GRAPH_ATLAS_ROOT`   | `<tmp>/atlas-generations` | the generation root                                        |
| `--atlas-host`                                                                                                      | `HASH_GRAPH_ATLAS_HOST`   | `127.0.0.1`               | listener address                                           |
| `--atlas-port`                                                                                                      | `HASH_GRAPH_ATLAS_PORT`   | `4003`                    | listener port                                              |
| `--user`, `--password`, `--host`, `--port`, `--database`                                                            | `HASH_GRAPH_PG_*`         | local dev store           | the store connection; detail trailers hydrate from it live |
| `--secret`                                                                                                          | `HASH_GRAPH_ATLAS_SECRET` | pinned dev value          | server secret behind the wire row-id codec                 |
| `--colored-type-ids`, `--edges-tiles`, `--edges`, `--translate-entity-ids`, `--locate-edges`, `--locate-properties` | `HASH_GRAPH_ATLAS_CAP_*`  | documented defaults       | serving caps (request validation and response shaping)     |

Startup is fail-closed: no activated generation, any artifact failing
validation (shape, integrity, or identity tables whose keys are not store
identities), or an unreachable store all refuse to serve. `ctrl-c` stops
the server gracefully.

### The compose stack

The `atlas` service in `infra/compose/compose.yml` serves the
repository's `var/atlas-generations` directory (bind-mounted, gitignored)
against the stack's `postgres`. Fitting stays outside the stack: run
`hash-graph atlas fit --root var/atlas-generations ...` on the host and
the service serves the activated generation from the shared directory.
Serving and fitting never combine implicitly - a serve refuses an empty
root rather than fitting one, and the service reports unhealthy until a
generation exists. No other service waits on it.

## Storage model

A generation id is the SHA-256 of its metadata document:

```text
<root>/
  current                  <- the served generation, replaced atomically
  <generation>/
    metadata.json          <- names every artifact role and content hash
    <artifact files>
```

Generation directories are immutable and publication is no-clobber:
republishing an identical generation is a no-op, and a same-id publish
with different bytes fails loudly as corruption. Readers open artifacts by
role through the metadata, never by guessing file names. Activation is an
atomic rename of `current`; a serving process resolves the pointer once at
startup, so activation changes take effect on the next start. Back up a
pointer together with its generation directory - a pointer without its
generation is not recoverable state.

## Security posture

The API is read-only and performs no authentication: bind it to loopback
or a trusted internal network and put authentication, TLS, and rate limits
in the surrounding service.

What the crate does guarantee, independent of the surrounding service:

- Row ids cross the wire through a keyed permutation derived from the
  server secret (`HASH_GRAPH_ATLAS_SECRET`) per generation. The
  permutation's design target is that id values and response orders
  carry no information about internal row assignment; that hiding is
  the construction's target, not a demonstrated boundary. Set the
  secret from a deployment secret store; the unconfigured development
  default keeps wire ids predictable to anyone with the crate.
- Missing and forbidden answer byte-identically on every id-bearing
  route.
- Published manifest limits and their handler enforcement read the same
  value, by construction.
- Every corpus-bearing response (tile, edges, locate, translate) is
  computed over a server-held visibility proof: row
  sets intersect it, edges inherit visibility from their endpoints, and
  hidden rows are indistinguishable from nonexistent ones. Current
  serving uses the explicit full-visibility operator proof: the
  sealed-bitmap session path that would supply per-scope proofs is
  specified but not built.

## Limitations

- One generation per process: the server pins `current` at startup and
  never hot-swaps. Restart to serve a newly activated generation.
- `filter` fields are rejected by name (`unsupported-feature`), not
  silently ignored - the filter surface is specified but not served.
- Row ids do not survive a refit. Anything a client persists must be
  stored in entity-identity terms and re-translated per generation.
- Wire ids are keyed by the server secret per generation, and nothing
  fingerprints the secret: changing it for an already-served generation
  silently re-keys every wire id under unchanged cache identity. Treat
  the secret as immutable per generation; rotate generations to rotate
  secrets.
- Output-affecting serving caps (edge truncation, locate caps) are the
  same class of operator contract: nothing fingerprints them, so keep
  them stable while a generation serves, or rotate the generation and
  clear application caches.
- Incremental ingestion is not enabled: new entities enter through the
  next fit.
- The fit pipeline requires a live HASH Graph PostgreSQL store; there is
  no offline corpus format.

## Crate layout

Domain-independent foundations with the SALT pipeline on top:

- `math`, `random`, `bitset`, `integrity`, `morton` - SIMD-native 2D
  geometry and kernels, unbiased sampling, dense row sets, SHA-256 content
  identity, Z-order keys.
- `file` - the on-disk artifact formats: plain files in a directory,
  described by metadata beside them.
- `dataset` - the data one fit runs over, wherever it lives.
- `salt` - the pipeline: graph construction, landmark layout, projector
  training, evaluation, and wire encoding.
- `run` - the operator seam: one production run over a live store.
- `serve` - opened generations answering reads as wire bytes.

## Development

```sh
cargo nextest run --package hash-graph-atlas --all-features
cargo test --package hash-graph-atlas --doc
cargo clippy --all-features --package hash-graph-atlas
```

Tests never require a GPU or a live store; fixture fits run the production
pipeline end to end on synthetic corpora, and wire formats are pinned by
the fixtures under `fixtures/wire/`.

Cargo features (all disabled by default):

- `gpu` - trains the projector on the Metal GPU backend. Compiles
  anywhere; running a fit with it requires an Apple GPU. Without it,
  fitting uses the CPU backend that CI exercises.
- `bench` - exposes the measurement seams the bench and example
  targets consume; combined with `gpu` those seams gain their
  Metal-backed flavor.

The operator commands (`cli` module) and the read API (`api` module)
build unconditionally; the `hash-graph` binary's `atlas` subcommand is
their one entry point.

## License

AGPL-3.0 - see [LICENSE.md](./LICENSE.md).
