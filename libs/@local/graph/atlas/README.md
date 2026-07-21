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
flags default to the graph's `HASH_GRAPH_PG_*` environment):

```sh
cargo run -p hash-graph --features hash-graph-atlas/gpu -- \
  atlas fit --root /var/lib/hash/atlas
```

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
- A **row id** identifies a node or edge within one generation. On the
  wire, row ids are opaque values: consistent across every endpoint of one
  generation, carrying no ordering or adjacency information, and not
  stable across generations - clients re-translate after a generation
  change.
- **Tiles** quadtree the map. Each fitted point carries an importance
  bucket, and a tile at zoom `z` delivers exactly the points whose bucket
  clears the zoom's cut - deeper zooms deliver less important points. The
  manifest's `bucketSchedule` publishes the schedule, so delivery is a
  pure function of `(generation, z, x, y)`.
- The **manifest** is the per-generation bootstrap read: wire version,
  variant names, bucket schedule, and `limits` - the server's enforced
  request caps, published as data. Everything a client needs before its
  first tile.

The serving read path is `current` (which generation?) then `manifest`
(how does it speak?) then tiles, edges, locate, and translate, all
immutable per generation.

## The serving surface

| Route                                               | Method | Answer                                                                        |
| --------------------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| `/status`                                           | GET    | process liveness                                                              |
| `/v1/atlas/current`                                 | GET    | the served generation id - the one mutable read                               |
| `/v1/atlas/generation/{generation}/manifest`        | GET    | wire version, variants, bucket schedule, enforced limits                      |
| `/v1/atlas/tile/{generation}/{variant}/{z}/{x}/{y}` | POST   | one tile: positions, row ids, optional type masks and detail trailer          |
| `/v1/atlas/edges/{generation}/{variant}`            | POST   | the edges among the listed tiles' delivered rows                              |
| `/v1/atlas/locate/{generation}/{variant}`           | POST   | a spotlight by entity id or wire row id: fly-to cell, neighbours, their edges |
| `/v1/atlas/translate/{generation}/{variant}`        | POST   | upstream entity ids to row ids and positions (JSON)                           |
| `/v1/atlas/openapi.json`                            | GET    | the OpenAPI document, pre-rendered at startup                                 |
| `/v1/atlas/openapi`                                 | GET    | a browsable API reference                                                     |

The API documents itself - the OpenAPI reference is the authoritative
per-route contract; the notes below are the semantics that span routes.

Binary responses ship `application/vnd.hash.saltile-v1` envelopes with
`Cache-Control: private, no-store`: the client's application-layer cache
is the cache, keyed by the immutable generation id. The manifest is
cacheable for the generation's lifetime. Identical requests yield
identical bytes, per generation and server secret.

Rejections are RFC 9457 `application/problem+json` documents with stable
type slugs (`unknown-generation`, `invalid-coordinate`, `too-many-tiles`,
`missing-body`, ...). `unknown-generation` means the route names a
generation this process does not serve: re-read `current` and retry.
Entities that do not exist and entities the caller may not see answer
byte-identically - existence is never disclosed through an error shape.

### Server configuration

Flags with environment fallbacks; absent flags read documented defaults.
The manifest publishes exactly the values the handlers enforce, so
advertised and enforced limits cannot disagree:

| Flag                                                                                                                                       | Environment                  | Default                   | Meaning                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ------------------------- | -------------------------------------------------------------- |
| `--root`                                                                                                                                   | `HASH_GRAPH_ATLAS_ROOT`      | `<tmp>/atlas-generations` | the generation root                                            |
| `--atlas-host`                                                                                                                             | `HASH_GRAPH_ATLAS_HOST`      | `127.0.0.1`               | listener address                                               |
| `--atlas-port`                                                                                                                             | `HASH_GRAPH_ATLAS_PORT`      | `4003`                    | listener port                                                  |
| `--user`, `--password`, `--host`, `--port`, `--database`                                                                                   | `HASH_GRAPH_PG_*`            | local dev store           | the store connection; detail trailers hydrate from it live     |
| `--cache-dir`                                                                                                                              | `HASH_GRAPH_ATLAS_CACHE_DIR` | absent                    | locate index cache; absent rebuilds the spatial index per open |
| `--secret`                                                                                                                                 | `HASH_GRAPH_ATLAS_SECRET`    | pinned dev value          | server secret behind the wire row-id codec                     |
| `--colored-type-ids`, `--edges-tiles`, `--edges`, `--translate-entity-ids`, `--locate-neighbours`, `--locate-edges`, `--locate-properties` | `HASH_GRAPH_ATLAS_CAP_*`     | documented defaults       | per-request caps                                               |

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
Serving and fitting never combine implicitly — a serve refuses an empty
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
  server secret (`HASH_GRAPH_ATLAS_SECRET`) per generation, so id values
  and response orders carry no information about internal row assignment.
  Set the secret from a deployment secret store; the unconfigured
  development default keeps wire ids predictable to anyone with the crate.
- Missing and forbidden answer byte-identically on every id-bearing
  route.
- Request caps are enforced at the handlers and published in the manifest
  from the same value, by construction.

Row-level visibility enforcement (per-principal masking) is specified and
under construction; see `SPEC-ADDENDUM-AUTHZ.md`.

## Limitations

- One generation per process: the server pins `current` at startup and
  never hot-swaps. Restart to serve a newly activated generation.
- `filter` fields are rejected by name (`unsupported-feature`), not
  silently ignored - the filter surface is specified but not yet served.
- Row ids do not survive a refit. Anything a client persists must be
  stored in entity-identity terms and re-translated per generation.
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

The design documents live beside the code: `SPEC.md` and its addenda carry
the ratified contracts (`SPEC-ADDENDUM-WIRE.md` for the envelope and
column formats, `-API.md` for the HTTP surface, `-AUTHZ.md` for serve-time
visibility, `-QUALITY.md` and `-CLOUD.md` for measurement and deployment);
the `PLAN*.md` files carry spec-to-module traceability.

## Development

```sh
cargo nextest run --package hash-graph-atlas --all-features
cargo test --package hash-graph-atlas --doc
cargo clippy --all-features --package hash-graph-atlas
```

Tests never require a GPU or a live store; fixture fits run the production
pipeline end to end on synthetic corpora, and wire formats are pinned by
golden fixtures under `fixtures/wire/`.

Cargo features (all disabled by default):

- `gpu` - trains the projector on the Metal GPU backend. Compiles
  anywhere; running a fit with it requires an Apple GPU. Without it,
  fitting uses the CPU backend that CI exercises.
- `bench`, `bench-gpu` - expose the measurement seams the bench and
  example targets consume.

The operator commands (`cli` module) and the read API (`api` module)
build unconditionally; the `hash-graph` binary's `atlas` subcommand is
their one entry point.

## License

AGPL-3.0 - see [LICENSE.md](./LICENSE.md).
