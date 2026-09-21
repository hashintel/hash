# `hash-graph-atlas`

Fits 2D maps over the entity embeddings stored in the HASH Graph, blending semantic similarity (what entities mean) with relational structure (how they connect), and serves the fitted maps as a read-only HTTP API of binary tiles that a GPU renderer consumes directly.

The design trades flexibility for verifiability: a fit publishes one **immutable, content-addressed generation** of typed binary artifacts. For a fixed build, keyed generators reproduce their sequences for equal `(seed, key, stream)` inputs. Replaying a sample also requires the same population, sampler parameters and draw order. A generation that fails validation does not become active. Edges and locate responses distinguish truncation from complete delivery with their `complete` flag.

## Quick start

The workspace pins the required nightly toolchain. Build from the repository root. The operator commands are the `hash-graph` binary's `atlas` subcommand. Select the projector device at runtime through `--device`. macOS uses Metal by default. Other hosts use CUDA by default. Pass `--device cpu` for the cross-platform CPU path.

```sh
cargo build -p hash-graph
```

Fit a generation from a running graph store and activate it (store flags default to the graph's `HASH_GRAPH_PG_*` environment; exactly one of `--annotations` and `--classifier` supplies the relation classifier):

```sh
cargo run -p hash-graph -- \
  atlas fit --root /var/lib/hash/atlas \
  --annotations annotation-corpus.json
```

Quality thresholds default to maximally permissive values, the admission check demanding evidence presence rather than fidelity. Impose measured bounds with `--quality-thresholds thresholds.json`:

```json
{
  "minimum_recall": 0.95,
  "maximum_density_spread": 0.5
}
```

The fields are `minimum_recall`, `minimum_trustworthiness`, `minimum_continuity`, `maximum_intrusion_rate`, `minimum_triplet_agreement` (each in `[0, 1]`) and `maximum_density_spread` (finite, non-negative). Out-of-domain values and unknown fields refuse the run before it starts.

Success prints the fit's verdict and writes an admission report:

```text
generation  2481c360...
nodes       864738
edges       1204211
recall      0.9873
...
report      admission-report.json
```

`hash-graph atlas fit --help` documents the full option set: seeding, landmark capacity, relation-annotation inputs, projector steps, and the baseline escape hatch.

Serve the root's generations and read from them. `serve` is one of the `atlas` subcommand's three, beside `fit` and `healthcheck`, and the subcommand is not optional:

```sh
cargo run -p hash-graph -- atlas serve --root /var/lib/hash/atlas
```

Maintenance and any configured download task start before the listener binds. Neither task waits for the other. The listener can become available before any generation is ready. Maintenance reads `<root>/current` on its own cadence, one second by default, and opens the generation that pointer names, promoting its runtime once it is ready. The process pins no generation at startup, and promotion needs no restart. Until the first promotion the read routes answer 503 `visibility-unavailable` while maintenance retries. `/status` answers 200 from the moment the listener is up.

Every atlas route runs behind the shared authentication middleware, `/status` alone outside it. A caller presents one of two credentials: a Kratos session (the browser's `ory_kratos_session` cookie or an `X-Session-Token`), or the service credential `Authorization: HASH-Service <secret>` with the delegated actor beside it in `X-Authenticated-User-Actor-Id`. The actor header on its own carries no credential. A data request additionally replays the `Atlas-Authority` token the manifest response issued for that actor:

```bash
# The actor to delegate for: a principal this deployment's store knows. The nil UUID is the
# encoding for acting for nobody, and these routes admit no anonymous caller, so it is refused
# here rather than treated as a placeholder.
actor="${ATLAS_ACTOR_ID:?set to an actor the principal store knows}"
service="${HASH_GRAPH_SERVICE_SECRET}"         # the shared internal-service secret
credentials=(-H "Authorization: HASH-Service ${service}" -H "X-Authenticated-User-Actor-Id: ${actor}")
generation="$(curl -fsS "${credentials[@]}" http://127.0.0.1:4003/v1/atlas/current | jq -r .generation)"
curl -fsS -X POST -D manifest.headers "${credentials[@]}" \
  "http://127.0.0.1:4003/v1/atlas/generation/${generation}/manifest" | jq
authority="$(tr -d '\r' < manifest.headers | awk 'tolower($1) == "atlas-authority:" { print $2 }')"
curl -fS -X POST "${credentials[@]}" \
  -H "Atlas-Authority: ${authority}" \
  "http://127.0.0.1:4003/v1/atlas/tile/${generation}/plain/0/0/0" \
  --output root.saltile
```

A request carrying no recognized credential answers `unauthenticated` (401), and so does the service credential presented without an actor header, with the nil UUID, or with an actor the principal store does not know. A malformed actor header answers 400 instead, the one distinction the credential path draws by shape rather than by outcome. A data request presenting no live token for that actor answers `unauthorized` (401).

## Concepts

- A **generation** is one fitted, published map: a directory of binary artifacts named by the SHA-256 of its metadata document. The directory never changes after publication. What does change is the in-memory publication a serving process keeps over it - entities that arrived since the fit, withdrawals, relabellings - which belongs to that process and is never written back. New fitted structure means a new generation.
- A **variant** is one layout of a generation. Version 1 publishes exactly one, named `plain`.
- A **row id** identifies a node row within one generation; edges carry their link entity's raw 32-byte identity instead. On the wire, row ids are opaque values issued through a keyed permutation of the full u32 range. One generation's ids stay consistent across every endpoint and are never bounded by that generation's row count. They do not stay stable across generations, so clients re-translate after a generation change. The permutation's design target is that ids carry no ordering, adjacency, or count information. That hiding is the construction's target, not a demonstrated boundary. Treat ids as meaningless handles either way.
- **Tiles** quadtree the map. Each fitted point carries an importance bucket, and a tile at zoom `z` delivers exactly the points whose bucket clears the zoom's cut - deeper zooms deliver less important points. The manifest's `bucketSchedule` publishes the schedule. Delivery is a function of the address `(generation, z, x, y)` together with the serving state the request captured - the caller's resolved visibility scope, which carries a delivery schedule, a density offset and the delta state it resolved against. Fix those and the same address delivers the same points. A second caller whose scope differs can receive different ones.
- The **manifest** is the per-generation bootstrap read. It carries the wire version, the variant names, the bucket schedule, and `limits` - request limits published as data, each read from the value its handler enforces. Everything a client needs before its first tile.

The serving read path is `current` (which generation?) then `manifest` (how does it speak?) then tiles, edges, locate, and translate - configuration pinned per generation and geometry pinned per generation and resolved scope, while a detail trailer reads either the publication the request captured (a tile's labels and icons) or the live store (an edge's type reference, a located entity's types and properties).

## The serving surface

| Route                                               | Method | Answer                                                                                    |
| --------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| `/status`                                           | GET    | process liveness                                                                          |
| `/v1/atlas/current`                                 | GET    | the currently promoted generation id                                                      |
| `/v1/atlas/generation/{generation}/manifest`        | POST   | wire version, variants, bucket schedule, this caller's delivery schedule, enforced limits |
| `/v1/atlas/tile/{generation}/{variant}/{z}/{x}/{y}` | POST   | one tile: positions, row ids, optional type masks and detail trailer                      |
| `/v1/atlas/edges/{generation}/{variant}`            | POST   | the edges among the listed tiles' delivered rows                                          |
| `/v1/atlas/locate/{generation}/{variant}`           | POST   | an ego-graph by entity id or wire row id: fly-to cell, the source's edges, their partners |
| `/v1/atlas/translate/{generation}/{variant}`        | POST   | upstream entity ids to row ids and positions (JSON)                                       |
| `/v1/atlas/openapi.json`                            | GET    | the OpenAPI document, pre-rendered at startup                                             |
| `/v1/atlas/openapi`                                 | GET    | a browsable API reference                                                                 |

The API documents itself - the OpenAPI reference is the authoritative per-route contract. The notes below are the semantics that span routes.

Binary responses are `application/vnd.hash.saltile-v1` envelopes with `Cache-Control: private, no-store`: the client's application-layer cache is the cache, keyed by authorization context, generation, route, and canonical query. Identical requests yield identical geometry bytes wherever the bound serving state is identical. That state covers the generation, the server secret and the serving limits, and it covers the caller's resolved scope with the schedule, density offset and delta state that scope carries. That state is not pinned by the generation alone: a scope re-resolves against the process's current delta lifetime, so placements and withdrawals admitted since the last resolution can move geometry for one unchanged address. A detail trailer has no such guarantee, for two separate reasons. Locate and edges read part of their detail from the live store at request time. And every captured label follows the publication the caller's scope resolved against, which moves when that scope re-resolves. Even a tile trailer, reading no store at all, can therefore differ between two identical requests. Cache the geometry surfaces and refetch detail. The manifest is `no-store` too. Each of its responses issues one caller's authority token and states that caller's own delivery schedule, so a shared copy would hand a second caller both.

Atlas handlers and extractors report failures as RFC 9457 `application/problem+json` documents whose `type` is a stable root-relative URI (`/problems/atlas/unknown-generation`, `/problems/atlas/invalid-coordinate`, ...). Required JSON-body extraction answers `missing-body` when Content-Type is absent, without inspecting body bytes. JSON extraction failures answer `invalid-body`, including an empty body with a JSON content type. An unparsable tile address answers `invalid-coordinate`.

The manifest reads raw bytes to preserve the exact filter input for its digest, including surrounding whitespace. It accepts these bytes without checking Content-Type. Its body-buffering failures remain plain-text 400 or 413 responses. The router answers unmatched routes and wrong methods with empty-body 404 and 405 responses respectively.

`unknown-generation` means the route names a generation this process does not serve: re-read `current` and retry. Entities that do not exist and entities the caller may not see answer byte-identically - existence is never disclosed through an error shape.

### Server configuration

Flags have environment fallbacks, and absent flags read documented defaults. Each limit flag sets the value its handler enforces and the value the manifest publishes under `limits`, one source, so an advertised limit never disagrees with enforcement. One flag can set more than one published limit: `--colored-type-ids` is the ceiling for `limits.tile.coloredTypeIds` and `limits.locate.coloredTypeIds` alike, because raising it means raising the ceiling on colored ids rather than one route's share of it:

| Flag                                                                                                                                                                      | Environment                                                            | Default             | Meaning                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------- |
| `--root`                                                                                                                                                                  | `HASH_GRAPH_ATLAS_ROOT`                                                | **required**        | the generation root                                                                               |
| `--atlas-host`                                                                                                                                                            | `HASH_GRAPH_ATLAS_HOST`                                                | `127.0.0.1`         | listener address                                                                                  |
| `--atlas-port`                                                                                                                                                            | `HASH_GRAPH_ATLAS_PORT`                                                | `4003`              | listener port                                                                                     |
| `--user`, `--password`, `--host`, `--port`, `--database`                                                                                                                  | `HASH_GRAPH_PG_*`                                                      | local dev store     | the store connection; detail trailers hydrate from it live                                        |
| `--secret`                                                                                                                                                                | `HASH_GRAPH_ATLAS_SECRET`                                              | **required**        | server secret behind the wire row-id codec: 64 lowercase hex characters (`openssl rand -hex 32`)  |
| `--service-secret`                                                                                                                                                        | `HASH_GRAPH_SERVICE_SECRET`                                            | **required**        | the secret an internal service presents as `Authorization: HASH-Service`, beside the actor header |
| `--colored-type-ids`, `--edges-tiles`, `--edges`, `--translate-entity-ids`, `--locate-edges`, `--locate-properties`, `--locate-link-type-ids`, `--locate-link-properties` | `HASH_GRAPH_ATLAS_LIMIT_*`                                             | documented defaults | serving limits (request validation and response shaping)                                          |
| `--generation-poll-interval`                                                                                                                                              | `HASH_GRAPH_ATLAS_GENERATION_POLL_INTERVAL`                            | `1` (seconds)       | how often maintenance re-reads `current` and advances its generation slots                        |
| `--unlink-expired-generations`                                                                                                                                            | `HASH_GRAPH_ATLAS_UNLINK_EXPIRED_GENERATIONS`                          | off                 | remove an expired generation's directory once its feeds have joined                               |
| `--download`, `--download-poll-interval`                                                                                                                                  | `HASH_GRAPH_ATLAS_DOWNLOAD`, `HASH_GRAPH_ATLAS_DOWNLOAD_POLL_INTERVAL` | off, `1` (seconds)  | acquire generations from a source prefix holding `generations/current` and `generations/active/`  |
| `--no-delta`                                                                                                                                                              | `HASH_GRAPH_ATLAS_NO_DELTA`                                            | off                 | serve fit-time data alone, starting no ingest feed                                                |

The delta flags - `--delta-poll-interval`, `--delta-safety-lag`, `--delta-retry-polls`, `--delta-placement-backlog`, `--delta-minimum-projection-interval` - tune the ingest feed's cadence, its read-behind window, and its placement backlog. `hash-graph atlas serve --help` lists every flag with the default serving reads for it.

Startup is fail-closed where it can be. Argument parsing refuses a missing or malformed wire secret. The host then validates its session-authentication configuration and constructs the storage clients, the store pool and the optional Temporal client. It then builds the serving router, which refuses a configured download source whose storage backend is unavailable, an entropy failure or invalid maintenance settings. Each of those refuses the invocation before the listener binds. Backend validation performs no source reads. Failures reading a source generation belong to the download task.

What depends on the root is the maintenance loop's business instead. No activated generation, or an artifact failing validation (shape, integrity, or identity tables whose keys are not store identities), leaves the listener up and the open retried at the maintenance cadence. What a read route answers then depends on what maintenance has published. Before the first promotion nothing is active and the read routes answer 503 `visibility-unavailable`. After one, a failed open leaves the active publication active and starts no retention clock. A request naming that generation still reads it, and a request naming none reads it too. Retention is the other case, and it starts when maintenance promotes a different generation - it bounds how long a replaced generation stays selectable by name. A store that will not answer refuses a manifest that needs a new scope resolution with the same 503 `visibility-unavailable`, because a new resolution cannot complete without reading the store. A request whose held scope is still reusable answers without reading it, and a detached refresh that fails leaves the held scope in place. Authentication and the request budgets refuse before the process selects any generation. `ctrl-c` drains in-flight requests and stops the server. A second one forces the exit.

### The compose stack

The `atlas` service in `infra/compose/compose.yml` runs `atlas serve` over the repository's `var/atlas-generations` directory (bind-mounted, gitignored) against the stack's `postgres`, with the stack's Kratos and service secret for credentials. Fitting stays outside the stack: run `hash-graph atlas fit --root var/atlas-generations ...` on the host, and the service picks the activation up on its next maintenance pass. Serving and fitting never combine implicitly - a serve over an empty root serves nothing rather than fitting one. Its healthcheck probes `/status`. That route answers as soon as the listener is up, so the service reports healthy before any generation exists, while the read routes still answer 503. No other service waits on it.

## Storage model

A generation id is the SHA-256 of its metadata document:

```text
<root>/
  current                  <- the served generation, replaced atomically
  <generation>/
    metadata.json          <- names every artifact role and content hash
    <artifact files>
```

Generation directories are immutable and publication is no-clobber. A publish whose metadata document already has its directory fails and leaves that directory untouched, so re-publishing an identical generation is a reported error rather than a silent no-op. The id is the SHA-256 of the metadata document. That document names every artifact's content hash, so a change to any artifact's bytes yields a different id and its own directory. Readers open artifacts by role through the metadata, never by guessing file names. Activation is an atomic rename of `current`, and a serving process re-reads that pointer on every maintenance pass: an activation takes effect on the first pass that opens the generation it names, without a restart. The generation it replaces stays requestable by name for the retention interval that starts at the replacement's promotion - ten minutes, as the `hash-graph` binary configures it - after which naming it answers `unknown-generation`. Back up a pointer together with its generation directory - a pointer without its generation is not recoverable state.

## Security posture

The API serves only reads, and it authenticates every atlas route it serves - `/status`, the liveness probe described above, sits outside that chain and is the only route that does. The `hash-graph` binary installs the same credential chain its REST API uses: a Kratos session first, then the service credential `Authorization: HASH-Service <secret>` carrying a delegated actor in `X-Authenticated-User-Actor-Id`. An actor header without that credential is not a credential, and a request that presents none answers `unauthenticated` - the atlas routes admit no anonymous caller. Address and principal request budgets run in the same stack of layers. Token continuity is a second check on top of that authentication. A data request replays the `Atlas-Authority` token its manifest response issued, and that token's sealed scope binds the actor presenting it. A resolved visibility scope binds the actor, generation, delta lifetime and requested filter.

The end-user leg still belongs to the surrounding service, which in this repository is hash-api's `/atlas` proxy. It authenticates the browser session and decides which actor an internal service may delegate for. It also holds the service secret. That secret is the boundary, because anyone holding it can name any actor and read that actor's whole scope. Keep it in a deployment secret store. Bind the port to loopback or a trusted internal network, and terminate TLS in front of it - this process speaks plain HTTP.

What the crate does guarantee, independent of the surrounding service:

- Row ids cross the wire through a keyed permutation derived from the server secret (`HASH_GRAPH_ATLAS_SECRET`) per generation. The permutation's design target is that id values reveal nothing about internal row assignment. That hiding is the construction's target, not a demonstrated boundary. The secret is mandatory - the server refuses to start without one - and comes from a deployment secret store. Replicas serving one generation share it.
- Missing and forbidden answer byte-identically on every id-bearing route.
- Published manifest limits and their handler enforcement read the same value, by construction.
- A server-held visibility proof governs every corpus-bearing response (tile, edges, locate, translate). The proof carries one mask per identity domain, so a link row's authorization is a statement the proof holds and its endpoints do not imply. Hidden rows are indistinguishable from nonexistent ones on every id-bearing route. A manifest request resolves the caller's scope and seals it into the authority token the data routes require.

## Limitations

- The filter surface binds at the manifest and nowhere else. The manifest body is the entity-query filter document. The data routes' bodies deny unknown members at parse, so a `filter` member there answers `invalid-body` rather than passing unread.
- Row ids do not survive a refit, and a fed-in entity's row id belongs to the delta lifetime that assigned it. A client persists anything it keeps in entity-identity terms and re-translates it per generation, and again after a refused token.
- The server secret keys wire ids per generation, and nothing fingerprints the secret. Changing it for an already-served generation re-keys every wire id under unchanged cache identity. Treat the secret as immutable per generation, and rotate generations to rotate secrets.
- Output-affecting serving limits (edge truncation, locate limits) are the same class of operator contract. Nothing fingerprints them, so keep them stable while a generation serves, or rotate the generation and clear application caches.
- Ingest feeds carry post-fit arrivals, withdrawals and relabellings into the served map, and `--no-delta` turns them off. They do not refit. The frozen projector places a fed-in entity into the existing frame, while the landmarks and the relation structure stay as the fit left them, and a fed-in node takes its delivery priority from identity order rather than from a fitted rank. New fitted structure still means a new generation.
- The `hash-graph` binary's fit path requires a live HASH Graph PostgreSQL store. An offline corpus format does exist - `atlas dump` writes a dump directory and `--offline` fits from one - but it lives in the standalone `hash-graph-atlas` binary behind the `cli` feature.

## Crate layout

Domain-independent foundations with the SALT pipeline on top:

- `math`, `random`, `bitset`, `integrity`, `morton` - SIMD-native 2D geometry and kernels, bounded and subset sampling, dense row sets, SHA-256 content identity, Z-order keys.
- `file` - the on-disk artifact formats: plain files in a directory, described by metadata beside them.
- `dataset` - the data one fit runs over, wherever it lives.
- `salt` - the pipeline, covering graph construction, landmark layout, projector training, evaluation, and wire encoding.
- `cli`, `progress` - the operator's entry points: the commands that fit a generation and serve the atlas, and the observations a running fit reports.
- `serve` - opened generations answering reads as wire bytes.

## Development

```sh
cargo nextest run --package hash-graph-atlas --all-features
cargo test --package hash-graph-atlas --doc
cargo clippy --all-features --package hash-graph-atlas
```

Unit tests require neither a GPU nor a live store. Fixture fits run the production pipeline end to end on synthetic corpora, and the fixtures under `fixtures/wire/` pin the wire formats. The `generation_transfer` integration target requires MinIO, and `route_fixture` requires PostgreSQL. Their module documentation lists the connection settings.

Cargo features (all off by default):

- `bench` - exposes the benchmark hooks the `[[bench]]` targets consume. The projector backend target measures the CPU and host-derived accelerator, requiring Metal on macOS or CUDA elsewhere.
- `cli` - builds the standalone `hash-graph-atlas` binary. It carries the fit path with its live dashboard, the `dump` command and the `--offline` fit that reads what `dump` wrote, and the measurement commands under `report`.
- `test-utils` - exposes generation-transfer and route fixtures for integration tests. The `generation_transfer` target requires this feature.

The operator commands (`cli` module) and the read API (`api` module) build unconditionally, so the `hash-graph` binary consumes them feature-free. The feature covers the standalone binary's shell alone.

The measurement commands read published artifacts and print their readings - the clump-threshold calibration, the neighbour-construction audits, the search-backend sweep, the certified classifier refit, the fold probe, and one live quality assessment:

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

Every such command's defaults are the deployed settings, so a bare invocation re-derives the evidence behind a configured default. `hash-graph-atlas report --help` lists them. Serving stays exclusive to the `hash-graph` binary.

## License

AGPL-3.0 - see [LICENSE.md](./LICENSE.md).
