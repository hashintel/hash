# Isolated Graph HTTP acceptance

These required tests call the actual ingestion runner and send its persisted request bodies over
HTTP. They never fall back to the development Graph. Missing services fail the tests; they are not
ignored or conditionally skipped.

The fixture connects only to `127.0.0.1:5432`, database `pipeline_acceptance_01a1d65f`, with the local
test user/password `postgres`. Before seeding, it verifies `current_database()`. The HTTP endpoint is
only `http://127.0.0.1:55031`, with the test-only service credential `pipeline-acceptance-only`.
Each test creates its own web and machine actor. Store APIs seed ontology and inspect results;
scenario writes, retries and replays use the real HTTP client. S9's two explicit external mutations
use the store API, as the scenario specifies.

Entity UUIDs are globally unique in the Graph, even across webs. These HTTP tests therefore use
`aviation/{web}` as their namespace, following the read-only reference suite, and independently
calculate their expected identities from the specification's UUIDv5 namespace and fixture type/source
literals. The shared S1–S9 fixture suite retains the exact `aviation` UUID vectors. The first HTTP
attempt identified this isolation requirement through create conflicts followed by missing patches
in the other test web; this was a test setup correction, not an ingestion behavior change.

The compatible server used for acceptance is:

- Image: `ghcr.io/hashintel/hash/graph@sha256:0916afc039032558037e789cd93cc1c5ced0743f4c44295b452ce5806ef690a2`
- OCI revision: `94fd0baab9c5057fceb42270c98cd575e3eb22cf`
- Migration baseline: V64
- Container: `pipeline-acceptance-graph-01a1d65f`

The digest was verified from the installed image's `RepoDigests`; the container's older Compose
revision label is not the image revision. An arbitrary older local `hash-graph` executable is not a
substitute: its conflict status behavior may differ.

## Setup

Start the repository's local Postgres and Kratos services first. The commands below assume their
existing `hash_default` Docker network and `hash-postgres-1`/`hash-kratos-1` container names. They
create only the dedicated acceptance database and server. If the dedicated database already exists,
omit the `CREATE DATABASE` command; never substitute `graph` or `graph_test`.

```sh
pipelineGraphImage=ghcr.io/hashintel/hash/graph@sha256:0916afc039032558037e789cd93cc1c5ced0743f4c44295b452ce5806ef690a2
docker pull "$pipelineGraphImage"
docker exec hash-postgres-1 psql -U postgres -d postgres \
  -c 'CREATE DATABASE pipeline_acceptance_01a1d65f'
docker run --rm --network hash_default \
  -e HASH_GRAPH_PG_HOST=hash-postgres-1 -e HASH_GRAPH_PG_PORT=5432 \
  -e HASH_GRAPH_PG_USER=postgres -e HASH_GRAPH_PG_PASSWORD=postgres \
  -e HASH_GRAPH_PG_DATABASE=pipeline_acceptance_01a1d65f \
  -e HASH_GRAPH_LOG_FOLDER=/tmp/graph-service \
  "$pipelineGraphImage" migrate
docker run -d --name pipeline-acceptance-graph-01a1d65f --network hash_default \
  -p 127.0.0.1:55031:4000 \
  -e HASH_GRAPH_PG_HOST=hash-postgres-1 -e HASH_GRAPH_PG_PORT=5432 \
  -e HASH_GRAPH_PG_USER=postgres -e HASH_GRAPH_PG_PASSWORD=postgres \
  -e HASH_GRAPH_PG_DATABASE=pipeline_acceptance_01a1d65f \
  -e HASH_GRAPH_HTTP_HOST=0.0.0.0 -e HASH_GRAPH_HTTP_PORT=4000 \
  -e HASH_GRAPH_EMBED_TYPE_FETCHER=true \
  -e HASH_KRATOS_PUBLIC_URL=http://hash-kratos-1:4433 \
  -e HASH_GRAPH_SERVICE_SECRET=pipeline-acceptance-only \
  -e HASH_GRAPH_LOG_FOLDER=/tmp/graph-service -e HASH_GRAPH_LOG_LEVEL=warn \
  "$pipelineGraphImage" server
docker exec pipeline-acceptance-graph-01a1d65f /hash-graph server --healthcheck --api-port 4000
cargo nextest run -p hash-integrations-pipeline --all-features \
  -E 'test(run::tests::graph_http::)'
```

No Temporal or external embedding service is configured. The suite seeds all ontology it uses.
The ontology comes from `c47a17eed3:tests/integrations/graph/aviation/ontology.json`, with
`empty-mass` made optional because S2 run 3 explicitly removes it. The model and first-flight
properties remain required, including for semantic validation/atomicity probes.

After the final combined acceptance run, remove only this container and database:

```sh
docker rm -f pipeline-acceptance-graph-01a1d65f
docker exec hash-postgres-1 psql -U postgres -d postgres \
  -c 'DROP DATABASE pipeline_acceptance_01a1d65f WITH (FORCE)'
```

The F3/D18 numeric case inspects the exact planned request text, raw PostgreSQL JSON text and the
store API's `Real`, then replays the actual pipeline with `resend_all`. On the pinned server:

| Observation | Value |
| --- | --- |
| Source integer | `9007199254740993` |
| Persisted planned HTTP body | `9007199254740992.0` |
| Graph's raw stored JSON number | `9007199254740990.0` |
| Store API's `Real` display | `9007199254740990` |
| Replay | Six patches accepted; all six edition IDs unchanged |

The raw SQL assertion separates the additional Graph-side rounding from read API conversion.
`Real::try_from(f64)` converts a binary float to decimal at native mantissa precision before raising
its decimal precision; this is consistent with the extra Graph-side rounding observed here. The
HTTP replay is stable despite precision loss. This evidence does not change the agreed numeric
policy, promise exact long-number preservation, or generalize to other values or server revisions.
