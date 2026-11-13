# Integration pipeline: reference inventory

This file says where the existing code for each stage is, what each stage takes from it, and what does not exist yet. A stage spec starts from the two reference files below and names the code it reuses by path and function.

| File | Content |
| --- | --- |
| [`reference/monorepo.md`](reference/monorepo.md) | Part A: the public types and signatures of the monorepo code, quoted from the source. Part B: every test with what it asserts. Part C: per stage, each piece of code with a recommendation (reuse as is, reuse with change, move, rewrite, drop) and the gaps. |
| [`reference/labs.md`](reference/labs.md) | Part A: per stage and step, the labs functions that hold the logic, with their rules and a recommendation (take the logic, take with change, leave behind). Part B: every labs test with its expected values. Part C: 66 behaviours a rewrite could lose. Part D: 35 defects the new design must not copy. |

Both files were collected by reading the code. Nothing was compiled or run. Signatures are quoted from the source, and a stage spec checks a signature against the source before it depends on it.

## Where the code is

No single branch holds everything a stage needs.

| Code | Where | Commit |
| --- | --- | --- |
| `definition/`, `engine/` with `graph/`, `apps/hash-integrations`, `tests/integrations/graph` | `origin/main` | `c47a17eed3` |
| `engine/src/storage`, the changed `engine/src/sources` | The BE-933 branch | In review |
| `orchestration/` (the run interface) | `origin/asa/be-1132-orchestration-run-interface` | `da9fb175a8` |
| `apps/hash-integrations/src/service` (`RunInput`, the integration service) | `pe/be-1136-add-the-integration-service-with-submit-status` | `b053dd6578` |
| Labs | `pocs/integrations_rs` in the labs repository | `40a8d14` |

The first implementation step is a branch that has `graph/`, `storage/` and `orchestration/` together.

## What each stage takes

The tables name the main pieces. The reference files have the full lists with line numbers.

### Stage 1: Capture

| From | Code | Use |
| --- | --- | --- |
| Monorepo | `SourceReader::capture_sources` (`engine/src/sources/mod.rs:203`) | Reuse with change. It already stores each capture under its sha256 and binds it to the run. It has to return the file reference and the row count per source. |
| Monorepo | The REST and Postgres readers, `SecretStore`, `CaptureStore`, `fingerprint` | Reuse as is. |
| Monorepo | `Workspace::capture` (`engine/src/workspace/mod.rs:189`) | Reuse as is. SQL sources use it. |
| Labs | `engine/source_capture.rs`, `snapshot.rs`, `connectors/` | Read for rules only: a source column named `_op`, `_key` or `_before` fails the capture; a missing primary key column fails it. |

New for stage 1: the capture time, the clock, `CaptureOutput` and its marker, and the adoption of another run's captures for a restore or a reconcile.

### Stage 2: Hash and diff

| From | Code | Use |
| --- | --- | --- |
| Monorepo | `SourceReader::stage_sources`, `Workspace::load_capture`, `stage_table` | Reuse with change. `stage_sources` takes `&SourceCaptures`, which only `capture_sources` builds; stage 2 starts from file references. |
| Monorepo | `Workspace::prepare_pipeline`, `prepare_link_pipeline`, `hash_expression` (`engine/src/workspace/connection/pipeline.rs:245`) | Reuse as is for SQL steps, definition checkpoints and the value hash. Links need a value hash. |
| Monorepo | The loop that runs a whole definition (`tests/integrations/graph/aviation/mod.rs:63-146`, `engine/tests/pipeline.rs:502`) | Move into the engine. It exists only in tests. |
| Monorepo | `derive_entity_id`, `SinkRow::text`, `value::text`, the link ID derivation in `LinkUpsert::new` | Move so that step 3 can call them (A2). They are private to `graph` today. |
| Labs | The diff SQL and its helpers (`graph/sink.rs` `plan_entity_sink`, `graph/link_pipeline.rs` `plan_link_table`) | Take with change: one join over all targets (A1), keyed by entity ID (A2). |
| Labs | The guards (`graph/sink.rs:177-190`, `:919-953`, `engine/candidate.rs:76-103`) | Take with change (P13): per kind over the whole integration, and for links too. |
| Labs | The config hash (`graph/hash.rs:109-162`) | Leave behind. The first version has no config hash (D1). |

New for stage 2: the column computed in Rust, the hash table, `changes`, `archives`, `issues`, the resend set, the labels, `DiffOutput`.

### Stage 3: Plan writes

| From | Code | Use |
| --- | --- | --- |
| Monorepo | `SinkRow`, `SinkColumns`, `resolve`, `value.rs`, `coerce.rs` | Reuse as is. |
| Monorepo | `Planner::plan_entities`, `plan_links` (`engine/src/graph/plan/mod.rs:282`, `:316`) | Reuse with change: read the entity ID and the endpoint IDs from columns (A2). |
| Monorepo | `Request::upsert`, `PatchEntity`, `PropertyPatch` (`engine/src/graph/plan/request.rs:204-295`) | Rewrite the patch: one replace of the whole property object (P7). |
| Monorepo | `CreateEntity`, `ArchiveEntity`, `integration_provenance` | Reuse as is. |
| Monorepo | `Payload`, `Delivery`, `GraphPlan`, `FinishedPlan` | Drop or reduce. `writes` stores one row per write with the two bodies as text, so the payload envelope has no reader. The sort order of `finish` is the send order. |
| Labs | Request shapes and golden bodies (`tests/golden/graph-delivery-v1.json`) | Port the create and archive bodies and the UUIDs as test vectors. The patch body changes. |

New for stage 3: reading `changes` in ranges, planning archives and resends, batches, `writes`, `issues`, `PlanOutput`.

### Stage 4: Send and commit

| From | Code | Use |
| --- | --- | --- |
| Monorepo | `GraphClient::new`, `request` (`engine/src/graph/client/mod.rs:77`, `:142`) | Reuse with change: the HTTP implementation of the `Graph` trait sends bulk requests with the same URL check, headers and HTTP client. |
| Monorepo | `GraphClient::send` | Drop. It takes a `PlannedWrite`, which stage 4 does not have. Its create-then-patch logic moves into the stage. |
| Monorepo | The mock server in `engine/src/graph/client/tests.rs:47-104` | Move. It is the starting point of the in-memory fake. |
| Labs | `classify` and the upsert, bulk and archive flows (`graph/executor.rs:1728-1764`, `:1067-1094`, `:1211-1336`, `:1413-1525`) | Take with change (P8). The contracts fix the response tables. |
| Labs | `Retry-After` handling and the wait between attempts (`graph/client.rs:173-178`, `graph/executor.rs:1780-1782`) | Take the logic. |

New for stage 4: the `Graph` trait and its fake, bulk requests, `rejected`, `current.json`, `mark_sending`, `commit`, `SendOutput`.

### Shared

| From | Code | Use |
| --- | --- | --- |
| Monorepo | `ArtifactStorage::publish`, `materialize`, `bind`, `bound`, `ArtifactRef`, `ArtifactNamespace` | Reuse as is. A marker is a JSON artifact bound at a key. `ArtifactNamespace` gets one key builder per marker and one for `current.json`. |
| Monorepo | `Workspace` | Reuse as is. Stages 1, 2 and 3 each open their own. `Workspace::snapshot` is no longer called. |
| Monorepo | `Definition::from_yaml` and the model types | Reuse as is. |
| Monorepo | `RunInput` on BE-1136 | Reuse with change: the contracts replace it. `links_only` is dropped. |
| Monorepo | The run interface (`RunFunction`, `StepContext`, `StepFailure`, `FailureKind`) | Reuse as is. |
| Monorepo | State version and work manifest records (hashintel/hash#10453) | Drop. |

New and shared: `finished` and `finish`, `store_query`, `load_table`, `RowFile`, `StageError` with its mapping from the existing error types, `RunId`, the runner, the `run` subcommand.

## What labs code is left behind

- The stored projection, the effect index, the delivery cursor, and the apply, restore and reconcile work: `graph/artifacts.rs`, `graph/effects.rs`, `graph/apply.rs`, `graph/restore.rs`, `graph/reconcile.rs`, and the cursor and turn logic of `graph/executor.rs`.
- The direct sync that nothing calls: `engine/batch_sync.rs` except `collect_sinks` and `compose_provenance`, `sink::diff_and_sync`, `stream_upserts`, `link_pipeline::process` and `flush`, `graph/coherence.rs`, `dlq.rs`, the event tables and the CDC connector.
- Coordination: everything under `orchestrator/` and `throttle/`.

## Defects in labs that the contracts address

`reference/labs.md` Part D has the full list. These change a contract:

| Labs defect | Contract |
| --- | --- |
| Archive IDs and link endpoint IDs are rendered by DuckDB, upsert IDs by Rust (items 1, 6) | "Entity ID": one derivation in step 3, stored as columns |
| A NULL source ID is neither rejected nor planned (item 12) | "Entity ID": the row is left out and reported |
| Link pipelines have no archive guard; an empty source archives every dependent link (items 3, 4) | "Guards": the coverage rule and the archive limit cover links |
| One protected empty source stops archives in every sink (item 18) | "Guards": the coverage rule is per target |
| The archive limit is per sink (item 14) | "Guards": per kind over the whole integration |
| A renamed sink sends every row again (item 31) | "Content hash" and "The diff": one join on entity ID |
| A patch adds properties and never removes one (item 10) | "Request bodies": one replace of the whole property object |
| A refused write ends the run (item 22) | "Sending" and the resend set |
| A 404 on an archive is a permanent failure (item 23) | "Sending": counted as absent |
| A bulk request answered with a retryable status is never split (item 24) | "Sending": any other status than 429, 502, 503 and 504 sends each write on its own |
| Batches are cut by count only (item 26) | "`writes`": 128 writes and 1,500,000 bytes |
| The link value hash covers only the amount column of a measure (item 8) | "Content hash": every column a property accessor reads |
| State advances while planning (item 20) | The hash table of a run is used by the next run only after `commit` |

Two labs defects are handled differently. Unit maps are missing from the labs config hash (item 2): the first version has no config hash, and D1 records what that leaves unsent. The hash depends on DuckDB's rendering of a struct (item 35): a changed rendering changes every hash, and every row is sent once.

## Tests to port

`03-scenarios.md` maps the existing tests onto the scenarios. The test vectors with fixed expected values are:

| Vector | Where | Used by |
| --- | --- | --- |
| Eight entity ID vectors | `engine/tests/fixtures/entity-ids-typescript.json`; labs `tests/golden/uuids.json` | Step 3 |
| Five rows with their struct hash inputs and hashes | Labs `tests/golden/fallback-hash.json` | Step 3. The expected hashes are tied to the DuckDB version. |
| Create, patch and archive bodies of one entity and one link | Labs `tests/golden/graph-delivery-v1.json`; monorepo `engine/src/graph/plan/snapshots/` | Stage 3. The patch body changes under P7. |
| Six aviation entities as the Graph stores them | `tests/integrations/graph/aviation/snapshots/aviation__aviation.snap` | The end-to-end test against a real Graph |

The aviation test against a real Graph sends its six writes twice and compares the entities. It does not read edition IDs, sets no load time, and sends no changed value and no archive.
