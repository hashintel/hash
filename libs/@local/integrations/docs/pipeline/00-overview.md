# Integration pipeline: overview and plan

The monorepo tickets plan to port the labs integration pipeline as it is: a stored projection of every Graph request, an effect index, and separate apply, restore and reconcile work. This document replaces that plan with a smaller pipeline. A run has four stages, three of them write a checkpoint to object storage, and the only state kept between runs is one hash table per run. Restore and reconcile are ordinary runs with different inputs.

Nothing described here is implemented. This file is the entry point for the specs that follow. It records the goal, the architecture, what the review of labs and the monorepo found, which decisions are made, which are open, and how the specs will be written.

## Documents

| File | Content | State |
| --- | --- | --- |
| `00-overview.md` | This file. | Reviewed |
| `01-contracts.md` | Shared types, error kinds, storage layout, checkpoint schemas, stage functions, operations, module tree, names. | Draft for review |
| `02-reference-inventory.md` | Per stage: what each stage takes from labs and the monorepo, and what is new. | Draft for review |
| `reference/monorepo.md`, `reference/labs.md` | The existing code and tests in detail: signatures, rules, expected values, recommendations. | Collected from the code |
| `03-scenarios.md` | The multi-run test scenarios and their expected checkpoint contents. | Draft for review |
| `shared-run.md` | The shared `run` module: types, error codes, markers, tables, `current.json`, `start`, the runner, the entry points. | Draft for review |
| `stage-1-capture.md` | Stage 1. | Draft for review |
| `stage-2-rows.md` | Stage 2, steps 2 and 3: running the definition, hashes, entity IDs. | Draft for review |
| `stage-2-diff.md` | Stage 2, step 4: the stage function, the diff, the guards, the files. | Draft for review |
| `stage-3-plan.md` | Stage 3. | Draft for review |
| `stage-4-send.md` | Stage 4. | Draft for review |

Earlier material, kept for its history and ticket numbers:

- [`integrations-pipeline-simplification.md`](../../../../../integrations-pipeline-simplification.md) is the proposal this plan grew from. It holds the ticket-by-ticket line estimates and the notes on sources that send only changes.
- `integration-pipeline-map.html` and `simplified-integration-pipeline.html` in the repository root draw the labs design and the proposed design.

Code references in these documents use labs `pocs/integrations_rs` at `40a8d14` and the monorepo at `origin/main` `c47a17eed3`, unless a branch is named.

## Terms

- **Run:** one execution of one integration definition. A definition can have several sinks and link pipelines, and one run processes all of them.
- **Committed run:** the last run whose writes were all sent. The next run compares against it.
- **Sink:** a step in a definition that writes each row of a table as an entity. A link pipeline does the same for links.
- **Source ID:** the value of the sink's `entityId` column for a row.
- **Namespace:** a string per integration that is part of every entity ID, so that two integrations cannot produce the same ID from the same source ID.
- **Entity ID:** `{web}~{uuid}`, where the UUID is a UUID v5 over `"{namespace}::{entity type URL}::{source ID}"` (`engine/src/entity_id.rs`). The sink's name is not part of it.
- **Content hash:** an md5 over the values of the columns a sink maps to properties (`_content_hash`, `engine/src/workspace/connection/pipeline.rs`).
- **Hash table:** one file per run with one row for every entity the integration has written, live or archived: entity ID, sink, source ID, content hash, live flag.
- **Checkpoint:** the files a stage writes when it finishes, with a marker file written last. The definition crate also has a `checkpoint` step, which names a table inside a pipeline. That is a different thing, and these documents call it a definition checkpoint.
- **Resend set:** entity IDs that must be sent again whatever their hash says, because an earlier run may have left them in an unknown state.

## Goal

Build the transformation and ingestion pipeline from the definition YAML to the writes sent to the Graph API, with these properties:

- The pipeline is a sequence of data transformations. Each stage reads files and writes files.
- A failure inside a stage is handled by running the stage again from the previous checkpoint.
- The same code runs under a workflow engine such as Restate and from a local command with no engine attached.
- The core mechanism from labs stays: capture to Parquet, SQL in DuckDB, content hashes, a diff, deterministic entity IDs, planned requests.
- The code is plain Rust with one module per stage and shared code in one place.

## Why

Labs keeps two full copies of an integration's previous state: a DuckDB snapshot with the content hashes, and a stored projection with the exact request bytes for every object. It needs the bytes because it writes the run's load time into every property's provenance (`row_to_entity_op`, labs `graph/planner.rs:711-715`). Resending an unchanged entity would change its property metadata and create a new edition in the Graph.

The monorepo planner puts the provenance it is given, with the load time, only into the edition provenance of a request (`engine/src/graph/plan/request.rs:204-246`). Property metadata holds only the data type (`engine/src/graph/property/mod.rs:241-247`). The Graph skips a patch that changes nothing and does not compare edition provenance (`prepare_entity_patch`, `postgres-store/.../knowledge/entity/patch.rs:414-425`). Resending an unchanged entity therefore costs one request and writes nothing.

With that, the projection, the comparison against it, the effect index, the delivery cursor and the separate restore and reconcile code have no job left. By the tickets' own estimates this removes about 8,500 planned lines and defers another 1,500. The proposal document has the table.

## Scope

This plan covers the path from a definition to Graph writes: capture, staging and SQL, hashing, the diff, request planning, sending, the commit, the object storage layout, and the operations restore, reconcile and cancel.

It leaves these to other work:

- Coordination, durability and retry policy. A workflow engine will provide them. The stages only have to be safe to run again.
- Fair scheduling across integrations and per-class request rates (BE-1114, BE-1110).
- Retention and deletion of old runs (BE-944).
- Sources that send only changed rows (BE-1033). The section "Later: sources that send only changes" lists what the first version must keep for that.
- Replacing the durable kernel.

## Architecture

### Stages and steps

A run has seven steps in four stages.

| Stage | Steps | Reads | Writes |
| --- | --- | --- | --- |
| 1 Capture | 1 Capture | The definition's sources | Checkpoint 1: one Parquet file per source, and the capture time |
| 2 Hash and diff | 2 Stage and SQL, 3 Hash, 4 Diff | Checkpoint 1, the committed run's hash table, the resend set | Checkpoint 2: the hash table and the changed rows |
| 3 Plan writes | 5 Plan requests | Checkpoint 2 | Checkpoint 3: the request bodies in send order, and the rows that could not be planned |
| 4 Send and commit | 6 Deliver, 7 Commit | Checkpoint 3 | The rejected writes, then `current.json` |

What each step does:

1. **Capture** reads every source in full and writes its rows to a Parquet file.
2. **Stage and SQL** loads the captures into a new DuckDB workspace and runs the definition's SQL steps. The result is one table per sink and link pipeline.
3. **Hash** adds the content hash and the entity ID to every row.
4. **Diff** compares all rows of the run with the committed run's hash table in one join on entity ID. It labels each entity insert, update, archive or resend, applies the guards, and writes the new hash table.
5. **Plan requests** turns each changed row into the request bodies the Graph will receive, orders them and cuts them into batches.
6. **Deliver** sends the batches to the Graph.
7. **Commit** makes the run the committed run.

### Rules for a stage

- A stage is one function. It takes an input struct and returns a description of its checkpoint.
- A stage reads only its input struct and the files that struct names. Stages 2 and 4 also read `current.json`.
- A stage writes its checkpoint files first and its marker file last. The checkpoint exists once the marker exists.
- A stage that finds its own marker returns the existing checkpoint without doing any work.
- A stage can be run any number of times with the same input and leaves the same result.
- A stage has no knowledge of the workflow engine, of other stages' code, or of how it was started.

The contract between two stages is therefore a set of files: the Parquet schema of each file, the content of the marker, and the rules the content obeys. `01-contracts.md` fixes these. Stage 2 can be rewritten without touching stage 3 as long as checkpoint 2 keeps its schema and rules.

### Traits

A stage is a function, and its signature is its contract. Replacing a stage means replacing the function. There is no trait per stage, because each would have one implementation.

A trait is used where two implementations exist:

| Dependency | Implementations | State |
| --- | --- | --- |
| Secret store | Graph and Vault, in-memory for tests | Exists: `SecretStore` (`engine/src/sources/secrets/mod.rs:50`) |
| Graph client | HTTP client, in-memory fake for tests | New: `Graph`. The HTTP client exists as the struct `GraphClient`. |
| Clock | System clock, fixed time for tests | New: `Clock` |

Object storage and the source readers need no trait of our own. `ArtifactStorage` is a struct over `object_store`'s trait, with a local and an S3 constructor. `SourceReader` is a struct that matches on the source kind.

### How a run is driven

A runner calls `start` and the four stage functions in order and passes each checkpoint description to the next stage. `start` resolves the request into the run input and stores it.

- **Local runner:** a loop in the `hash-integrations` app. A run that failed is started again by hand with the same run ID, and each finished stage returns at once because its marker exists.
- **Workflow engine:** each stage call is one step of the run interface (`StepContext::run`, hashintel/hash#10410). The recorded step output is the checkpoint description. The engine restarts a crashed run, allows one active run per integration, and handles cancel.

The engine stores no pipeline data. It stores where each checkpoint is.

### Object storage layout

`01-contracts.md` fixes the layout. In short:

```text
tenants/{web}/integrations/{integration}/
  current.json                       committed run, runs that started sending
  artifacts/sha256/…                 every data file, stored under its sha256
  runs/{run}/
    input.json                       the run input: definition as written, web, namespace, actor, operation
    capture/_done.json               checkpoint 1: capture time, file and row count per source
    diff/_done.json                  checkpoint 2: base run, resent runs, hashes, changes, archives, issues
    plan/_done.json                  checkpoint 3: writes, issues
    send/_done.json                  rejected writes; written before commit
```

- Every data file is stored under its sha256 (P10), as the BE-933 branch already does for captures. A `_done.json` names its files by reference and is written only if absent.
- The hash table is one file per run for the whole integration. The changed rows are one file per sink or link pipeline, because each has its own columns.
- `current.json` holds two fields: the committed run, and the runs that started sending and never committed.

### Operations

Every operation is a run of the same four stages. The operation is a field of the run input, and it changes what stages 1 and 2 read.

| Operation | Started by | Stage 1 | Stage 2 | Stages 3 and 4 |
| --- | --- | --- | --- | --- |
| Apply | Schedule or operator | Captures the sources | Diffs against the committed run | Unchanged |
| Restore to run K | Operator | Reads no source. The run adopts K's captures and uses K's definition | Recomputes K's rows and diffs them against the committed run | Unchanged |
| Restore to empty | Operator | Reads no source and has no captures | Uses no rows, so every live entity and every entity in the resend set is archived | Unchanged |
| Reconcile | Operator or timer | Reads no source. The run adopts the committed run's captures and uses its definition | Recomputes the committed run's rows, then marks every live row resend and every archived entity archive | Unchanged |

Two behaviours need no operation of their own:

- **Roll forward.** A run that fails while sending stays listed in `current.json`. Stage 2 of the next run puts every entity ID from that run's `writes.parquet` into the resend set. An ID still present in the rows is sent again with its current values. An ID no longer present is archived.
- **Cancel.** The engine stops the run. If the run had not started sending, nothing reached the Graph and the run is abandoned. If it had, the run stays listed in `current.json` and the next run rolls forward.

A restore to run K is one run, whatever lies between K and the committed run. The committed run's hash table describes everything the Graph holds from this integration, K's rows describe the target, and one diff between them gives every write needed. A restore sticks only if the integration is paused or its definition is reverted too, because the next apply run reads the source again.

### What happens on failure

| Event | Result |
| --- | --- |
| A worker stops inside a stage | The stage runs again from the previous checkpoint. Finished stages return at once. |
| The Graph is unavailable or limits the rate | The send stage fails as retryable and runs again from checkpoint 3. |
| The Graph refuses one write | The write goes to `rejected.parquet` and the run commits. The entity ID joins the next run's resend set. |
| A run fails for good while sending | `current.json` still names the previous committed run. The next run rolls forward. |

## What exists today

| Piece | Where | State |
| --- | --- | --- |
| Definition model and YAML parser | `definition/` on `main` | Done. Full reads only. `coverage` is parsed and used only in the capture fingerprint. |
| DuckDB workspace, staging, SQL steps, assertions, content hash | `engine/src/workspace`, `engine/src/pipeline` on `main` | Done. Links get no content hash yet. |
| Source readers and capture to Parquet | `engine/src/sources`, `engine/src/capture.rs` on `main` | Done. No capture time is recorded. |
| Object storage, content-addressed files, run bindings | `engine/src/storage` on the BE-933 branch | In review. Bindings are written only if absent. There is no conditional overwrite. |
| Entity ID derivation | `engine/src/entity_id.rs` on `main` | Done. Called only by the planner. |
| Request planner | `engine/src/graph/plan`, `engine/src/graph/property` on `main` | Done. No production caller. Patches use one `add` per property. |
| Graph HTTP client | `engine/src/graph/client` on `main` | Done for single requests. No bulk requests, no retry classification, no production caller. |
| Run interface | `orchestration/` in hashintel/hash#10410 | In review. |
| State version and work manifest records | hashintel/hash#10453 | In review. This plan replaces them with `current.json` and the marker files. |
| Diff, guards, link diff, sending, commit, operations | Labs only | Not ported. |

## What the review found

These findings come from reading the code. `verification/results.md` has since run the ones the design depends on, and the points below say where a result differs.

### Graph behaviour the pipeline depends on

- **A patch that changes nothing writes nothing.** The comparison covers properties, property metadata, entity types, draft, archived and confidence. It does not cover edition provenance. It applies to each entity of a bulk patch and to links. The existing test (`tests/graph/integration/postgres/partial_updates.rs:1007`) covers an empty patch, and no test covers resending identical values.
- **A replace at the root path replaces the whole property object** and goes through the same comparison.
- **Bulk create and bulk patch each run in one transaction.** One bad entity fails the whole request. A failed bulk create does not say which entity already existed.
- **The request body limit is axum's default 2 MB.** A larger body returns 400.
- **Create with an existing ID returns 409,** also when the entity is archived. A patch with `archived: false` brings an archived entity back.
- **A patch on an ID that never existed returns 404.** The monorepo client treats 404 on an archive as success (`client/mod.rs:134`).
- **Status codes do not separate bad data from temporary failure.** A missing link endpoint and a bad patch path return 500. 404 also covers a missing entity type and a clock difference. A lock conflict on the same entity returns 499. A purged entity returns 409 on create and 404 on patch for ever.
- **Links.** Creating a link needs both endpoints to exist. Archiving an entity does not archive its links. A patch cannot change a link's endpoints.
- **Numbers.** The Graph stores every number as a 64-bit float, which holds about 15 significant digits. A number with more digits is stored rounded: `9007199254740993` becomes `9007199254740992`. At store level a resend of such a number writes a new edition. Whether that also happens over HTTP was not run (D18).
- **Read-only entities.** The planner creates entities with `readOnly: true`. A global policy forbids user and AI actors from updating or archiving read-only entities (`seed_policies.rs`). Machine actors are not restricted.

### How labs differs from the earlier description

- Labs keys its state tables by source ID per sink. Entity IDs are computed in Rust, row by row.
- Labs renders the ID text in Rust for upserts and in DuckDB for archives. For ID columns that are not text the two differ, and the archive targets the wrong entity.
- The labs load time is the run's submission time.
- Labs advances the baseline for the next plan when work is planned, before delivery. A restore resets it.
- One permanently rejected write fails the whole labs run and starts a restore. The next run hits the same row.
- The labs restore always targets the last applied state and resends every object of it.
- Labs reads the previous run's intermediate tables only for `links_only` runs. The monorepo definition has no such runs and validates that every definition checkpoint has a producer.
- Labs leaves unit maps out of its config hash, so a corrected unit map is never sent.
- Labs has no archive guard for links. An empty source empties its definition checkpoint, and dependent link pipelines archive every link.

## Decisions

### Agreed

| ID | Decision | Reason |
| --- | --- | --- |
| A1 | The hash table is one table per run across all sinks and link pipelines, and the diff is one join on entity ID. | A per-sink diff archives a live entity when its sink is renamed or the row moves to another sink of the same type. |
| A2 | The entity ID is derived once, in Rust, in step 3, and stored as a column. The diff, the planner and the archives read that column. | DuckDB has no UUID v5 function and renders decimals and timestamps differently from the Rust code. |
| A3 | Checkpoint 2 records the committed run it diffed against and the runs whose writes it resent. | Commit has to verify the base and clear exactly those runs. |
| A4 | Restore is an ordinary run that recomputes the target run's rows from its captures. It can target any retained run. | It needs no stored request bytes and no lookup through earlier runs. |
| A5 | A stage is a function. Traits exist only where two implementations exist: the secret store, the Graph client and the clock. | A trait per stage would have one implementation. |
| A6 | Operations are a field of the run input and use the same four stages. | Restore and reconcile need no code path of their own. |
| A7 | The specs are several files, with shared contracts fixed before the step specs are written. | Parallel step specs need the same types and schemas. |

### Agreed in review

| ID | Decision | Reason |
| --- | --- | --- |
| P1 | Each run stores its input in `runs/{run}/input.json`: the definition as written, web, namespace, actor and operation. | A restore to run K needs K's definition, and the workflow engine is not a data store. |
| P2 | The committed run's rejected entity IDs join the next run's resend set. | Otherwise the hash table records a refused write as delivered and it is never tried again. Labs also tries a refused write again on the next run, by failing the whole run. |
| P3 | A run that fails while sending is repaired by the next run. A restore happens only when an operator asks for one. | Roll forward sends only what the failed run touched. |
| P4 | Cancel during sending leaves the run listed in `current.json`. | It is the same state as a failed send. |
| P5 | Withdrawn. Step SQL may call any function. | Inside a run nothing is computed twice once checkpoint 2 exists. D12 records the effect on restore. |
| P6 | Checkpoint 3 stays. | It fixes the requests across a deploy and keeps the send stage free of DuckDB and the planner. |
| P7 | A patch replaces the whole property object. | With one `add` per property, a value that becomes empty stays in the Graph. |
| P8 | The send stage retries a failed batch one write at a time, caps the attempts per write, tries create and patch at most once each, and records a link as rejected when one of its endpoints was rejected in the same run. | Status codes cannot tell bad data from temporary failure. |
| P9 | The planner always reads `changes/{sink}.parquet`, also when the DuckDB table is still on the worker's disk. | The planner encodes by column type, and a second input path could produce different bytes. |
| P10 | Every checkpoint file is stored under its sha256, and each `_done.json` is written only if absent. | Two attempts of one stage cannot overwrite each other, and the BE-933 code already does this for captures. |
| P11 | Reconcile recomputes the committed run's rows from its captures and resends all of them. It does not read the source. "Resend everything" is a flag of stage 2, so an apply run can set it too. | Labs and BE-1155 deliver the applied state again without reading the source. A reconcile then does not depend on the source being reachable, and it reuses the restore path. |
| P12 | Restore to empty archives every live entity and every entity in the resend set. | It covers a first run that failed while sending. |
| P13 | The guards work on the whole integration: duplicate entity IDs, an archive limit for entities and for links, and source coverage. A source that is `complete` and returns no rows archives nothing. | Labs applies them per sink and has none for links. |
| C1 | The rows a run archives are a file of their own, apart from the changed rows. | An archive has no row values, and its sink may have left the definition. |
| C2 | Batches are sent one after another. | Sending several at once can be added later without changing a file. |
| C3 | A single write that answers 500 is sent again up to the attempt limit and is then rejected. | The Graph returns 500 for some errors that belong to one write, such as a missing link endpoint. |
| C4 | A row without an ID is left out of the hash table and reported. An entity it had before is archived, subject to the guards. | Labs neither rejects nor plans such a row. |
| C5 | The capture binding key moves under `runs/{run}/capture/`. | Every file of a run is then under one prefix. It changes one function on the BE-933 branch. |
| P14 | Checkpoint 1 records the capture time, and every request of the run uses it as `loadedAt`. A restore uses the target run's capture time. | Nothing records a capture time today, and planning the same checkpoint twice must give the same bodies. |

### Open

No question is open. The names in code are settled in `01-contracts.md`: the definition crate already has `Checkpoint` and `CheckpointName`, so the stored result of a stage is named `CaptureOutput`, `DiffOutput`, `PlanOutput` and `SendOutput`. The config hash is deferred (D1).

### Deferred

Each item states what the first version does and what has to happen before the item is settled.

| ID | Item | First version | Settle before |
| --- | --- | --- | --- |
| D1 | A config hash: a hash over a target's mapping that makes every row count as changed when the mapping changes. Candidates for its inputs are listed in the proposal document under "Open decisions". One design makes it part of each row's hash, so the diff keeps one rule. | There is no config hash. The row hash covers the values of the columns the property accessors read. Adding or removing a property changes it. Another property type URL for the same column, another coercion or a changed unit map does not, and is sent only by an apply run with `resend_all`. | The first production integration whose mapping changes in one of those three ways. |
| D2 | Type version bumps. The entity ID includes the versioned type URL. The Graph can change an entity's types in place and keep its UUID, which would need IDs derived from the base URL. | A bump creates every entity again under a new ID and archives the old ones, as labs does. | The first type version bump in production (BE-750). |
| D3 | The namespace value for each integration. It cannot change once entities exist. | The pipeline takes the namespace as run input. | The first production run (BE-1152). |
| D4 | The actor the worker sends writes as. If it is a user, the read-only policy refuses every update and archive. | The pipeline takes the actor as run input. | The first run that updates or archives against a real Graph. |
| D5 | Links whose endpoint is archived. The diff could archive them. | The links stay live, as in labs. | A report of stale links. |
| D6 | Sources with `coverage: partial`. Rows that were not read have a hash and no values. | Sinks fed by a partial source archive nothing. Reconcile and restore resend only the rows that were read. | The first source declared partial. |
| D7 | Per-property provenance (H-6831). Values that are the same in every run are compatible with this design. A value that changes per run would make every resend create an edition. | The planner writes none. | H-6831. |
| D8 | A progress counter for the send stage. | A restarted send stage sends every batch again. | A restart of the send stage takes too long. |
| D9 | The conditional overwrite of `current.json`. `object_store` supports it for S3 and returns `NotImplemented` for the local file system. | The contracts state the condition. The implementation belongs to the coordination work. | The coordination work. |
| D10 | Retention. The committed run, every run listed in `current.json`, and every run that should stay restorable must be kept. | Nothing is deleted. | BE-944. |
| D11 | Fair scheduling across integrations (BE-1114, BE-1110). | All workers share one rate limit. | One integration starves others. |
| D12 | Step SQL that calls `now()`, `random()` or `uuid()`. A column mapped from such a value changes its hash on every run, so every row is sent on every run. A restore or reconcile recomputes such a column with the value of the day it runs. | Allowed. | A definition check that warns is wanted. |
| D13 | A version tag in the stored JSON. `ArtifactRef` has one; `RunInput`, the stage outputs and `current.json` have none. | The stored types are written without a tag. | The first change to a stored field after a production run. |
| D14 | A limit on rejected writes. A Graph that answers 500 to every write rejects every write, the run commits, and the next run sends them all again (P2, C3). | Each repeated 500 waits before the next attempt. There is no limit. | The first production integration. |
| D15 | A REST read that stops at `maxPages` counts as a full read. With `coverage: complete` the entities past the page limit are archived, or the run fails with `archive_limit`. | As in labs. A definition check that requires `coverage: partial` together with `maxPages` does not exist. | The first REST source with `maxPages` in production. |
| D16 | Errors that hide their cause. `SourceError::Postgres` covers a wrong password and a failed connection, and `StatementError::Failed` covers a memory limit and an IO error. | Each is mapped to retryable, so a permanent fault is retried until the retry policy ends. | A source error variant per cause is added. |
| D17 | A `HUGEINT` column, which a `SUM` over integers produces, has no Parquet type. It comes back from a `changes` file as `DECIMAL(38,0)`, and a value with more than 38 digits fails the load. | The contracts state the type change. No cast and no check exist. A 39-digit value fails the run with a data error. | A source has integers above 10^38, or the planner has to tell a 128-bit integer from a decimal. |
| D18 | The Graph rounds a number with more than about 15 significant digits. The stored value then differs from the source, and nothing reports it. A resend of such a value wrote a new edition at store level. | The pipeline sends the number as it is. A definition should map such a column as text. The test against a real Graph records whether a resend over HTTP keeps the edition. | A customer needs exact long numbers, or the test shows a new edition on every resend. The fix is a check in stage 3 that leaves the property out and writes an issue (`05-change-requests.md`, CR-8). |

## Later: sources that send only changes

The first version reads every source in full. A later version will receive only changed rows (BE-1033). The proposal document describes what changes then. The first version must keep two properties so that this stays possible:

- `changes/{sink}.parquet` holds the full mapped row of every changed entity.
- The hash table is one file per run.

## How the specs are written

The specs are written in three passes. Each pass ends with a review before the next starts.

### Pass 1: contracts, inventory, scenarios

**`01-contracts.md`** fixes everything that more than one stage uses:

- the shared types: run ID, entity ID, file reference, operation, run input;
- the error kinds a stage can return: retryable, permanent, and for the send stage rejected;
- the storage layout and the functions used to read and write a checkpoint;
- the Parquet schema and the rules of every checkpoint file, and the content of every marker;
- the signature, input struct and output struct of each stage function;
- the operations table in full, with the run input for each operation;
- the runner, for the local case and for the run interface;
- the module tree and the names of modules, types and files.

A change to this file after its review is made in this file first and then in the specs that depend on it.

**`02-reference-inventory.md`** lists, per stage, the functions and tests in labs and the monorepo, each marked reuse, move, rewrite or drop, with the path and the reason. Labs code that nothing calls at `40a8d14` is marked drop. Existing functions may be split or renamed where that makes a module easier to follow. Behaviour stays the same unless a decision above changes it.

**`03-scenarios.md`** defines the test scenarios once. Each scenario is a sequence of runs over the aviation example, with the expected content of every checkpoint and the expected Graph writes:

1. first run;
2. a changed row;
3. a deleted row;
4. a renamed sink;
5. a type version bump;
6. a rejected write;
7. a failed send, then roll forward;
8. a restore;
9. a reconcile.

The expected output of one stage is the input fixture of the next. Stage tests and end-to-end tests then use the same files. Existing labs and monorepo tests are mapped onto these scenarios in the inventory.

### Pass 2: one spec per stage

Each stage spec is written by one subagent that owns one file. Stage 2 is the largest and is split between two: staging, SQL, hash and entity ID in one, the diff, the guards and links in the other. Stage 1 is mostly existing code.

A stage spec contains:

- the purpose of the stage and of each step;
- the modules and files, with what each one holds;
- the types, with fields;
- each function with its signature and pseudocode;
- the errors each function returns and their kind;
- the code it reuses, by path and function name, taken from the inventory;
- the tests: the scenarios it covers, and unit tests for each function;
- the questions it could not settle.

A subagent reads this file, the contracts, the inventory and the scenarios. It does not change a contract. When a contract does not fit, it reports the problem and the change it needs.

### Pass 3: one pass over all specs

One reader checks that the specs use the same names and types, that every contract is implemented by exactly one stage and read as written by the next, and that shared code is specified once.

### Open points for pass 3

The six specs agree with the contracts. These points are left for the pass over all specs:

- **Error codes of lower frames.** The shared mapping functions take a report of their own error type. A `SourceError` holds those types as lower frames, so `stage-1-capture.md` repeats some mapping rows. `shared-run.md` should offer one function that returns the code of a frame.
- **`TargetRows` and `_key`.** `TargetRows` does not say whether a target's table has a `_key` column, so `stage-2-diff.md` asks the workspace for each `changes` file. A `has_key` field would remove that.
- **`archives` has no row number.** `stage-3-plan.md` numbers the rows itself to read them in ranges.
- **Two codes of stage 4.** `stage-4-send.md` keeps `reader_stopped` and `invalid_writes` where `shared-run.md` would give `scratch_unavailable`.
- **Statements that were written and never run:** the diff SQL against DuckDB and the workspace's `SELECT` check; DuckDB's `rowid` as the row key and `UNION ALL` in a workspace statement; that the same rows give the same Parquet file, byte for byte; that a resent replace patch creates no edition in a real Graph.

### Code rules for the specs

- One module per stage. Code that two stages use lives in one shared module.
- A trait is added only when two implementations exist.
- Concrete types are preferred over generic parameters.
- No new macros.
- Each stage can be tested from files alone, with the fake Graph client where it sends.
- Errors follow the repository's `error-stack` conventions. A stage returns its error kind at its boundary.

## Map

**Done**

- The review of the proposal against labs and the monorepo.
- Decisions A1 to A7, P1 to P14 and C1 to C5.
- The contracts, the reference inventory and the scenarios.
- First drafts of the six specs.

**Now**

- Review of the six specs.

**Later**

- The pass over all specs.
- Implementation from the specs.
- Changes to the tickets BE-1108, BE-1111, BE-1112, BE-1115 to BE-1120, BE-1137 and BE-1153 to BE-1155. No ticket has changed yet.
