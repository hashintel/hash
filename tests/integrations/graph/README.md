# Integration writes to the Graph

The aviation test runs the definition crate's SQL example through DuckDB preparation, Graph planning and HTTP delivery. It reads the committed records through a separate Postgres store connection and checks the aircraft, airfields, links, properties, metadata and provenance. It replays the plan to check conflict-to-patch delivery.

Run this package against a migrated Graph and Postgres dedicated to these tests. The test commits ontology fixtures that affect the Graph store suite's type counts. CI runs this package as a separate integration-test job.

```sh
cargo nextest run -p hash-integrations-graph-tests
```

The test reads `HASH_GRAPH_HTTP_HOST`, `HASH_GRAPH_HTTP_PORT`, `HASH_GRAPH_SERVICE_SECRET` and the `HASH_GRAPH_PG_*` connection settings. The Graph server and the test must use the same database and service secret. Each run creates a separate web and integration namespace.
