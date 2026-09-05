# `hash-graph-atlas`

Fits 2D maps over the entity embeddings stored in the HASH Graph, blending semantic similarity (what entities mean) with relational structure (how they connect), and serves the fitted maps as a read-only HTTP API of binary tiles that a GPU renderer consumes directly.

The design trades flexibility for verifiability: a fit publishes one **immutable, content-addressed generation** of typed binary artifacts, every pipeline stage is deterministic (an equal seed over an equal snapshot replays every draw), and everything downstream is fail-closed - a generation that cannot prove its own integrity does not serve, and the server refuses by name any request it cannot answer exactly rather than answering approximately.

## Quick start

The workspace pins the required nightly toolchain. Build from the repository root. The operator commands ride the `hash-graph` binary's `atlas` subcommand. Projector devices are selected at runtime through `--device`. macOS uses Metal by default. Other hosts use CUDA by default. Pass `--device cpu` for the cross-platform CPU path.

```sh
cargo build -p hash-graph
```

Fit a generation from a running graph store and activate it (store flags default to the graph's `HASH_GRAPH_PG_*` environment; exactly one of `--annotations` and `--classifier` supplies the relation classifier):

```sh
cargo run -p hash-graph -- \
  atlas fit --root /var/lib/hash/atlas \
  --annotations annotation-corpus.json
```

Quality thresholds default to maximally permissive values (the gate demands evidence presence rather than fidelity); impose measured bounds with `--quality-thresholds thresholds.json`:

```json
{
  "minimum_recall": 0.95,
  "maximum_density_spread": 0.5
}
```

The fields are `minimum_recall`, `minimum_trustworthiness`, `minimum_continuity`, `maximum_intrusion_rate`, `minimum_triplet_agreement` (each in `[0, 1]`) and `maximum_density_spread` (finite, non-negative). Out-of-domain values and unknown fields refuse the run before it starts.

Success prints a receipt and writes an admission report:

```text
generation  2481c360...
nodes       864738
edges       1204211
recall      0.9873
...
report      admission-report.json
```

`hash-graph atlas fit --help` documents the full option set: seeding, landmark capacity, relation-annotation inputs, projector steps, and the baseline escape hatch.

Serve the active generation and read from it (`atlas` with no subcommand serves - the deployment default):

```sh
cargo run -p hash-graph -- atlas --root /var/lib/hash/atlas
```

The manifest and every data route name their actor in `X-Authenticated-User-Actor-Id`, which the surrounding service sets. `current` and the OpenAPI routes take no actor. A data request also replays the `Atlas-Authority` token the manifest response minted for that actor:

```sh
actor="00000000-0000-0000-0000-000000000000"   # whatever actor the gateway authenticated
generation="$(curl -fsS http://127.0.0.1:4003/v1/atlas/current | jq -r .generation)"
curl -fsS -X POST -D manifest.headers \
  -H "X-Authenticated-User-Actor-Id: ${actor}" \
  "http://127.0.0.1:4003/v1/atlas/generation/${generation}/manifest" | jq
authority="$(tr -d '\r' < manifest.headers | awk 'tolower($1) == "atlas-authority:" { print $2 }')"
curl -fS -X POST \
  -H "X-Authenticated-User-Actor-Id: ${actor}" \
  -H "Atlas-Authority: ${authority}" \
  "http://127.0.0.1:4003/v1/atlas/tile/${generation}/plain/0/0/0" \
  --output root.saltile
```

Without the actor header a request answers `missing-actor` (400). A data request presenting no live token for that actor answers `unauthorized` (401).

## Concepts

- A **generation** is one fitted, published map: a directory of binary artifacts named by the SHA-256 of its metadata document. Generations never change after publication. New data means a new generation.
- A **variant** is one layout of a generation. Version 1 publishes exactly one, named `plain`.
- A **row id** identifies a node row within one generation; edges carry their link entity's raw 32-byte identity instead. On the wire, row ids are opaque values issued through a keyed permutation of the full u32 range. One generation's ids stay consistent across every endpoint and are never bounded by that generation's row count. They do not stay stable across generations, so clients re-translate after a generation change. The permutation's design target is that ids carry no ordering, adjacency, or count information; that hiding is the construction's target, not a demonstrated boundary. Treat ids as meaningless handles either way.
- **Tiles** quadtree the map. Each fitted point carries an importance bucket, and a tile at zoom `z` delivers exactly the points whose bucket clears the zoom's cut - deeper zooms deliver less important points. The manifest's `bucketSchedule` publishes the schedule, so delivery is a pure function of `(generation, z, x, y)`.
- The **manifest** is the per-generation bootstrap read. It carries the wire version, the variant names, the bucket schedule, and `limits` - request limits published as data, each read from the value its handler enforces. Everything a client needs before its first tile.

The serving read path is `current` (which generation?) then `manifest` (how does it speak?) then tiles, edges, locate, and translate - geometry and configuration pinned per generation, detail trailers hydrated live.

## The serving surface

| Route                                               | Method | Answer                                                                                    |
| --------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| `/status`                                           | GET    | process liveness                                                                          |
| `/v1/atlas/current`                                 | GET    | the served generation id - the one mutable read                                           |
| `/v1/atlas/generation/{generation}/manifest`        | POST   | wire version, variants, bucket schedule, this caller's delivery schedule, enforced limits |
| `/v1/atlas/tile/{generation}/{variant}/{z}/{x}/{y}` | POST   | one tile: positions, row ids, optional type masks and detail trailer                      |
| `/v1/atlas/edges/{generation}/{variant}`            | POST   | the edges among the listed tiles' delivered rows                                          |
| `/v1/atlas/locate/{generation}/{variant}`           | POST   | an ego-graph by entity id or wire row id: fly-to cell, the source's edges, their partners |
| `/v1/atlas/translate/{generation}/{variant}`        | POST   | upstream entity ids to row ids and positions (JSON)                                       |
| `/v1/atlas/openapi.json`                            | GET    | the OpenAPI document, pre-rendered at startup                                             |
| `/v1/atlas/openapi`                                 | GET    | a browsable API reference                                                                 |

The API documents itself - the OpenAPI reference is the authoritative per-route contract. The notes below are the semantics that span routes.

Binary responses are `application/vnd.hash.saltile-v1` envelopes with `Cache-Control: private, no-store`: the client's application-layer cache is the cache, keyed by authorization context, generation, route, and canonical query. Identical requests yield identical geometry bytes, per generation, server secret, and serving limits; detailed responses hydrate their trailers live from the store and leave the immutable cache - cache the geometry surfaces, refetch detail. The manifest is `no-store` too. Each of its responses mints one caller's authority token and states that caller's own delivery schedule, so a shared copy would hand a second caller both.

Rejections from the handlers are RFC 9457 `application/problem+json` documents whose `type` is a stable root-relative URI (`/problems/atlas/unknown-generation`, `/problems/atlas/invalid-coordinate`, ...). Extraction failures answer problem documents too. An absent required body answers `missing-body`. A body that is not the operation's JSON shape answers `invalid-body`, and an unparsable tile address answers `invalid-coordinate`. Only the router's own rejections - an unmatched route, a wrong method - stay plain. `unknown-generation` means the route names a generation this process does not serve: re-read `current` and retry. Entities that do not exist and entities the caller may not see answer byte-identically - existence is never disclosed through an error shape.

### Server configuration

Flags have environment fallbacks, and absent flags read documented defaults. Each published manifest limit reads the value its handler enforces (one source, so an advertised limit never disagrees with enforcement); the manifest does not publish every limit - the edge-count truncation limit (`--edges`) shapes responses without a manifest row:

| Flag                                                                                                                | Environment                | Default             | Meaning                                                                                          |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| `--root`                                                                                                            | `HASH_GRAPH_ATLAS_ROOT`    | **required**        | the generation root                                                                              |
| `--atlas-host`                                                                                                      | `HASH_GRAPH_ATLAS_HOST`    | `127.0.0.1`         | listener address                                                                                 |
| `--atlas-port`                                                                                                      | `HASH_GRAPH_ATLAS_PORT`    | `4003`              | listener port                                                                                    |
| `--user`, `--password`, `--host`, `--port`, `--database`                                                            | `HASH_GRAPH_PG_*`          | local dev store     | the store connection; detail trailers hydrate from it live                                       |
| `--secret`                                                                                                          | `HASH_GRAPH_ATLAS_SECRET`  | **required**        | server secret behind the wire row-id codec: 64 lowercase hex characters (`openssl rand -hex 32`) |
| `--colored-type-ids`, `--edges-tiles`, `--edges`, `--translate-entity-ids`, `--locate-edges`, `--locate-properties` | `HASH_GRAPH_ATLAS_LIMIT_*` | documented defaults | serving limits (request validation and response shaping)                                         |

Startup is fail-closed. A missing or malformed wire secret, no activated generation, any artifact failing validation (shape, integrity, or identity tables whose keys are not store identities), or an unreachable store all refuse to serve. `ctrl-c` drains in-flight requests and stops the server.

### The compose stack

The `atlas` service in `infra/compose/compose.yml` serves the repository's `var/atlas-generations` directory (bind-mounted, gitignored) against the stack's `postgres`. Fitting stays outside the stack: run `hash-graph atlas fit --root var/atlas-generations ...` on the host and the service serves the activated generation from the shared directory. Serving and fitting never combine implicitly - a serve refuses an empty root rather than fitting one, and the service reports unhealthy until a generation exists. No other service waits on it.

## Storage model

A generation id is the SHA-256 of its metadata document:

```text
<root>/
  current                  <- the served generation, replaced atomically
  <generation>/
    metadata.json          <- names every artifact role and content hash
    <artifact files>
```

Generation directories are immutable and publication is no-clobber. A publish whose metadata document already has its directory fails and leaves that directory untouched, so re-publishing an identical generation is a reported error rather than a silent no-op. The id is the SHA-256 of the metadata document. That document names every artifact's content hash, so a change to any artifact's bytes yields a different id and its own directory. Readers open artifacts by role through the metadata, never by guessing file names. Activation is an atomic rename of `current`; a serving process resolves the pointer once at startup, so activation changes take effect on the next start. Back up a pointer together with its generation directory - a pointer without its generation is not recoverable state.

## Security posture

The API serves only reads, and the trust boundary runs through the surrounding service rather than through this crate. **Atlas does not authenticate a user.** It trusts `X-Authenticated-User-Actor-Id` as stated by whatever fronts it. What it authenticates is token continuity: a data request replays the `Atlas-Authority` token its manifest response minted, and that token's tag binds the actor presenting it. One visibility scope resolves per actor. Authenticating the user, and overwriting any actor header the caller supplied, belongs to the surrounding service, which in this repository is hash-api's `/atlas` proxy. Exposing this port directly therefore hands actor identity, and every scope with it, to the caller. Bind it to loopback or a trusted internal network and put TLS and rate limits in front of it.

What the crate does guarantee, independent of the surrounding service:

- Row ids cross the wire through a keyed permutation derived from the server secret (`HASH_GRAPH_ATLAS_SECRET`) per generation. The permutation's design target is that id values and response orders carry no information about internal row assignment; that hiding is the construction's target, not a demonstrated boundary. The secret is mandatory - the server refuses to start without one - and comes from a deployment secret store. Replicas serving one generation share it.
- Missing and forbidden answer byte-identically on every id-bearing route.
- Published manifest limits and their handler enforcement read the same value, by construction.
- A server-held visibility proof governs every corpus-bearing response (tile, edges, locate, translate). The proof carries one mask per identity domain, so a link row's authorization is a statement the proof holds and its endpoints do not imply. Hidden rows are indistinguishable from nonexistent ones on every id-bearing route. A manifest request resolves the caller's scope and seals it into the authority token the data routes require.

## Limitations

- Each process serves one generation, pinning `current` at startup and never hot-swapping. Restart to serve a newly activated generation.
- The server rejects `filter` fields rather than ignoring them: request bodies deny unknown members at parse and answer `invalid-body`. The specification defines the filter surface, and no handler serves it.
- Row ids do not survive a refit. A client persists anything it keeps in entity-identity terms and re-translates it per generation.
- The server secret keys wire ids per generation, and nothing fingerprints the secret. Changing it for an already-served generation re-keys every wire id under unchanged cache identity. Treat the secret as immutable per generation, and rotate generations to rotate secrets.
- Output-affecting serving limits (edge truncation, locate limits) are the same class of operator contract. Nothing fingerprints them, so keep them stable while a generation serves, or rotate the generation and clear application caches.
- Incremental ingestion stays off. New entities enter through the next fit.
- The fit pipeline requires a live HASH Graph PostgreSQL store. No offline corpus format exists.

## Crate layout

Domain-independent foundations with the SALT pipeline on top:

- `math`, `random`, `bitset`, `integrity`, `morton` - SIMD-native 2D geometry and kernels, unbiased sampling, dense row sets, SHA-256 content identity, Z-order keys.
- `file` - the on-disk artifact formats: plain files in a directory, described by metadata beside them.
- `dataset` - the data one fit runs over, wherever it lives.
- `salt` - the pipeline, covering graph construction, landmark layout, projector training, evaluation, and wire encoding.
- `cli`, `progress` - the operator seam: the commands that fit a generation and serve the atlas, and the observations a running fit reports.
- `serve` - opened generations answering reads as wire bytes.

## Development

```sh
cargo nextest run --package hash-graph-atlas --all-features
cargo test --package hash-graph-atlas --doc
cargo clippy --all-features --package hash-graph-atlas
```

Tests never require a GPU or a live store; fixture fits run the production pipeline end to end on synthetic corpora, and the fixtures under `fixtures/wire/` pin the wire formats.

Cargo features (all off by default):

- `bench` - exposes the benchmark hooks the `[[bench]]` targets consume. The projector backend target measures the CPU and host-derived accelerator, requiring Metal on macOS or CUDA elsewhere.
- `cli` - builds the standalone `hash-graph-atlas` binary: the fit path with its live dashboard, and the lab instruments under `report`.

The operator commands (`cli` module) and the read API (`api` module) build unconditionally, so the `hash-graph` binary consumes them feature-free. The feature gates only the standalone binary's shell.

The lab instruments read published artifacts and print their readings - the clump-threshold calibration, the neighbour-construction audits, the search-backend sweep, the certified classifier refit, the fold probe, and one live quality assessment:

```sh
cargo run -p hash-graph-atlas --features cli --release -- \
  report clumps --table /var/lib/hash/atlas/<generation>/knn.sprs
```

```text
rows 985932  neighbours 30

  epsilon       clumps       groups   grouped_rows   coverage  mean_size
   0.0005       716583       117106         386455      39.2%       3.30
   0.0012       637115       131773         480590      48.7%       3.65
   0.0020       566791       131760         550901      55.9%       4.18
```

Every instrument's defaults are the deployed settings, so a bare invocation re-derives the evidence behind a configured default. `hash-graph-atlas report --help` lists them. Serving stays exclusive to the `hash-graph` binary.

## License

AGPL-3.0 - see [LICENSE.md](./LICENSE.md).
