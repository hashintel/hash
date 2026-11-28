# Milestone 10: Send

## What it adds

Stage 3. It reads the rows a run left in the sync table and applies them to the Graph in batches. A batch the Graph refuses is sent again one entity at a time, each as an upsert. Send records what it did in the `send` part of `run.json` and then names the run as the last completed run of its integration.

```text
Prepare ──► [ Send ] ──► Graph
              reads   the run's rows in the sync table
              sends   bulk creates and bulk patches, then single writes for a refused batch
              last    the `send` part of run.json, then current.json
```

**Decided in:** `../plan.md`, step 3, "Send" and "How a stage writes"; step 4, "Send".

## Size

|           | Lines   |                                                                            |
| --------- | ------- | -------------------------------------------------------------------------- |
| Moved     | 0       |                                                                            |
| Adapted   | 40      | the upsert of one entity, from `engine`'s client                           |
| New       | 400     | the steps of the stage, cutting batches, sending a batch with its fallback |
| **Total** | **440** | **reused 9%**                                                              |

The plan estimated 490. The check of this batch showed the stage's own steps to be shorter than first written. Labs has the fallback as three functions of 337 lines together, written against its turns, budgets and cursor. The cases are taken from there, and the code is written new.

## Interface

One function is called from outside the stage:

```rust
// stage/send/mod.rs
pub async fn send(storage: &Storage, run: RunId, graph: &GraphClient) -> Result<(), Report<StageError>>
```

Everything it calls from other milestones is in `contracts.md`: `stage::begin` and `end`, `sync_table::read`, the three bodies of `request.rs`, the four routes of `GraphClient` with `Answer`, and `run::current::complete`.

## Pseudo code

**`stage/send/mod.rs`: the steps of Send** (new, 115 lines)

```rust
pub async fn send(storage, run, graph) -> Result<(), Report<StageError>> {
    let mut open = stage::begin(storage, run, Stage::Send).await?;
    if open.record.send.is_none() {
        let result = apply(storage, &open.record, graph).await
            .map(|part| open.record.send = Some(part));
        stage::end(storage, open, result).await?;                 // the `send` part
    }
    run::current::complete(storage, run).await?;                  // then current.json
    Ok(())
}

async fn apply(storage, record: &RunRecord, graph) -> Result<SendPart, Report<StageError>> {
    let rows = sync_table::read(storage, record.input.run).await?;
    let provenance = integration_provenance(SourceProvenance {    // the same for every body of the run
        location: the connector's id, loaded_at: record.input.submitted_at, .. });
    let writes = rows.into_iter().map(|row| Write::new(row, &provenance)).collect()?;   // a body per row
    let batches = batch::cut(writes, &record.batch);              // sorted, then cut
    let mut part = SendPart::default();
    for (number, batch) in batches.iter().enumerate() {
        delivery::deliver(graph, record.input.actor, number, batch, &provenance, &mut part).await?;
    }
    Ok(part)
}
```

If the `send` part is there, Send skips the Graph and only writes `current.json`. That is the case of a Send that stopped between its two writes. `complete` does nothing when `current.json` names the run as last completed already.

Which failure is which:

| Failure                                                                                         | Kind      | Code               |
| ----------------------------------------------------------------------------------------------- | --------- | ------------------ |
| Reading the sync table or `current.json` fails in storage                                       | retryable |                    |
| The Graph is not available                                                                      | retryable |                    |
| `run.json` or `current.json` was changed by someone else                                        | retryable |                    |
| A row of the sync table cannot be read (`SyncTableError::Invalid`), or its body cannot be built | permanent | `send_row_invalid` |
| `current.json` names another run when Send wants to complete this one                           | permanent | `run_not_active`   |

An error of `run` becomes a stage error by the table of `03-stage-frame-and-capture.md`. An entity the Graph refuses is not a failure of the stage. It is recorded, and Send goes on.

Two cases end without a described way on, and both need someone to look. If the Graph is not available on every attempt, Send returns the retryable error each time and records nothing. If `current.json` names another run after the `send` part is saved, `run.json` shows a finished run that `current.json` does not have. `begin` makes that second case possible only when two processes work on one integration at once.

**`stage/send/batch.rs`: the order and the batches** (new, 110 lines)

```rust
pub(super) struct Write { pub row: SyncRow, pub body: Box<RawValue> }       // the body for the row's own kind
pub(super) struct Batch { pub op: Op, pub writes: Vec<Write> }

pub(super) fn cut(mut writes: Vec<Write>, limits: &BatchLimits) -> Vec<Batch> {
    writes.sort_by_key(|write| (write.row.op, write.row.seq, order_key(&write.row.entity_id)));
    // A new batch starts when:
    //   the kind of change differs from the batch's
    //   the batch has `max_writes` writes
    //   the body would take the batch over `max_bytes` (a list of n bodies is their bytes plus n + 1)
    //   the entity already has a write in the batch
}
```

The order is fixed by the rows, and the limits are in `run.json`, so every attempt cuts the same batches. A failed entity is recorded by the number of its batch and its place in it, and those numbers mean the same on every attempt.

**`stage/send/delivery.rs`: one batch** (215 lines: 40 adapted, 175 new)

```rust
pub(super) async fn deliver(graph, actor, number, batch, provenance, part: &mut SendPart) -> Result<(), Report<StageError>> {
    let bodies = the bodies of the batch;
    let answer = match batch.op {
        CreateEntity | CreateLink => graph.create_bulk(actor, &bodies).await,
        _                         => graph.patch_bulk(actor, &bodies).await,    // updates and archives
    };
    match answer {
        Answer::Applied     => { count(part, batch.op, batch.writes.len()); Ok(()) }
        Answer::Unavailable => Err(retryable(Stage::Send)),                     // nothing is recorded
        Answer::Refused { status, .. } => {                                     // refused as a whole
            warn!(batch = number, status, "the Graph refused a batch, sending its entities one by one");
            for (index, write) in batch.writes.iter().enumerate() {
                match upsert(graph, actor, write, provenance).await? {
                    Outcome::Refused { status, message } =>
                        part.failed.push(FailedEntity { batch: number, index, entity_id, status, message }),
                    outcome => count_one(part, outcome),
                }
            }
            Ok(())
        }
    }
}

/// One entity alone, as an upsert. `Err` only when the Graph is not available.
async fn upsert(graph, actor, write, provenance) -> Result<Outcome, Report<StageError>> {
    match the kind of write.row.op {
        a create => match graph.create(actor, &write.body).await {
            Applied => Created,
            Refused { status: 409, .. } =>                                      // it exists
                match graph.patch(actor, &request::patch(&write.row, provenance)?).await {
                    Applied => CreateExisted,                                   // logged with the entity id
                    other   => refused(other)?,
                },
            other => refused(other)?,
        },
        an update => match graph.patch(actor, &write.body).await {
            Applied => Updated,
            Refused { status: 404, .. } =>                                      // it is not there
                match graph.create(actor, &request::create(&write.row, provenance)?).await {
                    Applied => UpdateMissing,                                   // logged with the entity id
                    other   => refused(other)?,
                },
            other => refused(other)?,
        },
        an archive => match graph.patch(actor, &write.body).await {
            Applied                     => Archived,
            Refused { status: 404, .. } => ArchiveMissing,                      // logged with the entity id
            other                       => refused(other)?,
        },
    }
}
```

`refused` turns `Unavailable` into the retryable error, and a refusal into `Outcome::Refused` with the status and the message the Graph gave. Since the client returns both for every refusal, a failed entity always has them.

The client does not say what a status means. That is decided here, where the request is known: a 409 means "exists" only after a create, and a 404 means "not there" only after a patch. A 404 after a create is the Graph not knowing the entity type, and it is recorded as a refusal like any other.

`count` and `count_one` are two small functions in this file that add to the `SendPart`. They sit beside their only caller.

What the counts mean. `created`, `updated` and `archived` count what the Graph did. The three other counts say how often that was not what the row asked for:

| The row | The Graph                          | Counted as                     |
| ------- | ---------------------------------- | ------------------------------ |
| create  | created it                         | `created`                      |
| create  | had it already, so it was patched  | `updated` and `create_existed` |
| update  | patched it                         | `updated`                      |
| update  | did not have it, so it was created | `created` and `update_missing` |
| archive | archived it                        | `archived`                     |
| archive | did not have it                    | `archive_missing`              |
| any     | refused it                         | one entry in `failed`          |

So `created + updated + archived + archive_missing` plus the entries of `failed` is the number of rows of the run.

## Source table

| New file           | Item                                                                          | Comes from                                                                                                                                                                     | Kind    | Lines |
| ------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ----- |
| `send/mod.rs`      | `send`, `apply`, the provenance source, the failure table                     | none                                                                                                                                                                           | new     | 115   |
| `send/batch.rs`    | `Write`, `Batch`, `cut`                                                       | none. The order is that of `engine`'s `OperationKind` (`graph/mod.rs:148-158`), extended to six kinds                                                                          | new     | 110   |
| `send/delivery.rs` | `upsert`, for a create and an archive                                         | `engine/graph/client/mod.rs:114-140`, `GraphClient::send` (27): a create, then a patch on a conflict; an archive that finds nothing                                            | adapted | 40    |
| `send/delivery.rs` | `deliver`, `upsert` for an update, `Outcome`, `refused`, `count`, `count_one` | none. The cases are those of labs `graph/executor.rs`: `execute_create_batch_group` (`:1017-1111`), `deliver_once` (`:1413-1528`), `execute_patch_first_effect` (`:1211-1336`) | new     | 175   |

## Tests

The Graph in these tests is a small HTTP server inside the test, as in `engine/graph/client/tests.rs`. Tests 1 to 4 build their rows by hand, call `cut` or `deliver`, and need no store. Tests 5 and 6 call `send` and need a MinIO container, because Send reads the sync table.

**Moved, adapted:** `operations_sort_into_application_order` (`engine/graph/tests.rs`) and `finish_order` (`engine/graph/plan/tests.rs`) become the first case of test 1: six kinds in place of four, and `seq` in place of the entity id as the second key.

**New, six tests:**

1. Cutting batches: one kind per batch, at most the count and the size from `run.json`, an entity never twice in a batch, and the same rows give the same batches. One test with a table of cases.
2. A batch the Graph accepts is one request, and all its rows are counted.
3. A refused batch of creates goes one by one: a new entity is created, an entity that exists is patched and counted as `create_existed`, and an entity the Graph refuses is recorded with its batch, its index, the status and the message. The counts add up to the rows. `engine` has the middle case as `upsert_patches_existing`, and labs has the cases as `rejected_bulk_create_falls_back…` (`executor.rs:3110`) and `create_409_patch…` (`:2494`).
4. A refused batch of updates and of archives: an update of an entity the Graph does not have creates it and counts `update_missing`, and an archive of one it does not have counts `archive_missing`. Labs has a create after a patch that found nothing in `…self_heals_through_the_patch_miss` (`executor.rs:3303`), there for a create batch.
5. The Graph stops answering in the second batch: Send returns the retryable error, `run.json` has no `send` part and no failed entity. Send is run again with the Graph back: it ends with the same entities, and the creates of the first batch are counted as `create_existed`. Labs has this as a create whose answer was lost (`tests/crash_replay_test.rs:245`).
6. The stage as a whole: the rows of the sync table arrive at the server in the fixed order, the `send` part has the counts, and `current.json` names the run as last completed. A second Send sends nothing. A Send on a run that has its `send` part but is still active only writes `current.json`.

Not tested on their own: `Write::new`, the provenance source and the counting. Tests 2 to 6 go through them.

## What was stripped

Against labs `graph/executor.rs`, about 1,080 lines on this path: turns with a request budget, the cursor, permits and the lock registry, several batches at once, the set of known conflicts, the patch-first order after a conflict, and waiting between attempts. Against `engine`: `GraphPlan::finish`, which refused a second write to an entity.

## Open points

- **Fact:** an update row holds every mapped property of its source row, the same set an insert row holds, so a create can be built from it (`08-prepare-incremental.md`, `changes.rs`).
- **Fact:** a list of n bodies takes n + 1 bytes more than the bodies (`09-graph-requests-and-client.md`).
- **Chosen:** a body that alone is larger than `max_bytes` goes into a batch of its own. The Graph accepts it up to its own limit of 2 MiB and refuses it above that, and it is then recorded as a failed entity.
- **Chosen:** a row that cannot be read from the sync table, or whose body cannot be built, stops Send with a permanent failure, `send_row_invalid`. It means the row is broken, which no rerun fixes.
- **Chosen:** the provenance of every body names the connector as its location and the run's submission time as its load time, as labs does. `engine`'s aviation test sets no load time.
- **Chosen:** a refused batch is logged once as a warning, with its number and the status. Without it a batch refused for one reason, such as a missing permission, would show only as many failed entities.
- **Chosen:** `Outcome`, `refused`, `count` and `count_one` are private to `delivery.rs`.
- **Chosen:** each of the three upsert cases is logged as a warning with the entity id, and counted. The ids are not stored: a Send that runs a second time meets every create it applied before.
- **Settled in `contracts.md`:** the type of the `batch` part of `run.json` is `BatchLimits`, so that `Batch` can mean a batch of writes here.
- **Chosen:** a failed entity's batch and index count from 0.
- **Decided:** the upsert rules, the counts, "not available", no shortcut for a repeated Send: `../plan.md`, step 3. D8: the failed entities are in `run.json`.
- **Decided in `../plan.md`, step 3:** an entity that is deleted and inserted again in one run is created first and archived second, so it ends up archived. Neither Prepare nor Send checks for it in the first version. `../open-issues.md` keeps the case.
