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

|           | Lines   |                                                                                                 |
| --------- | ------- | ----------------------------------------------------------------------------------------------- |
| Moved     | 0       |                                                                                                 |
| Adapted   | 40      | the upsert of one entity, from `engine`'s client                                                |
| New       | 804     | the steps of the stage, the plan and its batches, sending a batch with its fallback, the counts |
| **Total** | **844** | **reused 5%**                                                                                   |

The plan estimated 490. Lines count doc comments and blank lines, as on every page.

Send is built from types:

- `Plan`, `Batch` and the three write types keep the rules of a batch.
- `Delivery` holds the client and the run's actor.
- `Tally` is the only place that counts.
- `RunSend` holds what one attempt reads and writes.

Labs has the fallback as three functions of 337 lines together, written against its turns, budgets and cursor. The cases are taken from there, and the code is written new.

## Interface

One function is called from outside the stage:

```rust
// stage/send/mod.rs
pub async fn send(storage: &Storage, run: RunId, graph: &GraphClient) -> Result<(), Report<StageError>>
```

Everything it calls from other milestones is in `contracts.md`: `stage::begin` and `end`, `sync_table::read`, the three bodies of `request.rs` and `integration_provenance`, the four routes of `GraphClient` with their `Response`, and `run::current::complete`.

## Pseudo code

Send is built from types, each holding what its step needs:

- `RunSend` holds the storage, the run's record and the client.
- `Delivery` holds the client and the run's actor.

No method of `Delivery` passes the client or the actor on.

**`stage/send/mod.rs`: the steps of Send** (new, 165 lines)

```rust
pub async fn send(storage, run, graph) -> Result<(), Report<StageError>> {
    let mut open = stage::begin(storage, run, Stage::Send).await?;
    if open.record.send.is_none() {
        let result = RunSend { storage, record: &open.record, graph }.deliver().await
            .map(|part| open.record.send = Some(part));
        stage::end(storage, open, result).await?;                 // the `send` part
    }
    run::current::complete(storage, run).await                    // then current.json
        .map_err(|report| from_run(Stage::Send, report))
}

impl RunSend<'_> {
    /// The errors of reading, planning and delivering the rows become stage errors here.
    async fn deliver(&self) -> Result<SendPart, Report<StageError>> {
        let rows = self.rows().await?;                            // as many as Prepare wrote
        let plan = Plan::new(&rows, &self.provenance(), self.record.batch)
            .change_context(permanent(Stage::Send, "send_row_invalid"))?;
        let part = Delivery::new(self.graph, self.record.input.actor)
            .deliver(&plan).await
            .change_context(retryable(Stage::Send))?;             // `Unavailable`
        // logs the counts, as a warning if the Graph refused a write
        Ok(part)
    }
    async fn rows(&self) -> Result<Vec<SyncRow>, Report<StageError>>;   // `send_rows_missing` on a mismatch
    fn provenance(&self) -> ProvidedEntityEditionProvenance;    // the connector, and the submission time
}
```

If the `send` part is there, Send skips the Graph and only completes the run in `current.json`. That is the case of a Send that stopped between its two writes. `complete` does nothing when `current.json` names the run as last completed already.

Which failure is which:

| Failure                                                                                                                                                 | Kind      | Code                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------- |
| Reading the sync table or `current.json` fails in storage                                                                                               | retryable |                     |
| The Graph is not available                                                                                                                              | retryable |                     |
| `run.json` or `current.json` was changed by someone else                                                                                                | retryable |                     |
| A row of the sync table cannot be read (`SyncTableError::Invalid`, which also stands for a storage without a sync table), or its bodies cannot be built | permanent | `send_row_invalid`  |
| The sync table holds another number of the run's rows than the `prepare` part names                                                                     | permanent | `send_rows_missing` |
| `current.json` names another run when Send wants to complete this one                                                                                   | permanent | `run_not_active`    |

An error of `run` becomes a stage error by the table of `03-stage-frame-and-capture.md`. An entity the Graph refuses is not a failure of the stage. It is recorded, and Send goes on.

Two cases need someone to look:

- **The Graph never answers.** If the Graph is not available on any attempt, every Send returns the retryable error and records nothing.
- **The run is finished but not completed.** If `current.json` names another run after the `send` part is saved, `run.json` shows a finished run that `current.json` does not name. That needs two processes working on one integration at once.

**`stage/send/plan/mod.rs`: the order and the batches** (new, 337 lines)

```rust
pub(super) struct Position { pub batch: u32, pub index: u32 }
pub(super) struct Target { pub entity_id: EntityId, pub position: Position }

/// A write holds exactly the bodies its kind needs.
pub(super) struct CreateWrite { pub target: Target, pub create: Box<RawValue>, pub patch: Box<RawValue> }
pub(super) struct UpdateWrite { pub target: Target, pub patch: Box<RawValue>, pub create: Box<RawValue> }
pub(super) struct ArchiveWrite { pub target: Target, pub archive: Box<RawValue> }

pub(super) enum Writes { Create(Vec<CreateWrite>), Update(Vec<UpdateWrite>), Archive(Vec<ArchiveWrite>) }
pub(super) struct Batch { number: u32, op: Op, writes: Writes }
pub(super) struct Plan { batches: Vec<Batch>, rows: u64 }

impl Plan {
    /// The only way to make a `Batch`.
    pub(super) fn new(rows: &[SyncRow], provenance: &ProvidedEntityEditionProvenance, limits: BatchLimits) -> Result<Self, Report<RequestError>> {
        // every body of every row, then sorted by (op, seq, order_key(entity_id), the bulk body's bytes)
        // each write is offered to the last open batch, which takes it if:
        //   it has fewer than `max_writes` writes
        //   the body keeps its list within `max_bytes` (a list of n bodies is their bytes plus n + 1)
        //   the entity has no write in it yet
        //   the write has the batch's op
        // and a write it does not take starts a new batch, so a body over `max_bytes` is alone
    }
}
```

- **The same rows give the same batches.** The order is fixed by the rows and their bodies, and the limits are in `run.json`, so every attempt cuts the same batches.
- **A position means the same on every attempt.** A failed entity is recorded by its `Position`.
- **Bodies are built before anything is sent.** A row whose bodies cannot be built stops Send before the first request.
- **The bytes of the bulk body break ties.** Two rows of one entity with the same `seq` are sent in the same order on every attempt.

**`stage/send/delivery/mod.rs`: sending the batches** (238 lines: 40 adapted, 198 new)

```rust
pub(super) struct Unavailable;                                 // the Graph did not answer
enum Reply { Applied, Refused(Refusal) }                       // made from the client's `Response`, once

/// A write sent on its own when the Graph refuses its batch.
trait Upsert: Sync {
    fn target(&self) -> &Target;
    fn upsert(&self, delivery: &Delivery<'_>) -> impl Future<Output = Result<Outcome, Report<Unavailable>>> + Send;
}
// CreateWrite: create; on 409, patch               → Created, CreateExisted or Refused
// UpdateWrite: patch; on 404, create               → Updated, UpdateMissing or Refused
// ArchiveWrite: patch; on 404, nothing             → Archived, ArchiveMissing or Refused

pub(super) struct Delivery<'graph> { graph: &'graph GraphClient, actor: ActorEntityUuid }

impl Delivery<'_> {
    pub(super) async fn deliver(&self, plan: &Plan) -> Result<SendPart, Report<Unavailable>> {
        // each batch in order, with its number attached to a failure;
        // checks that the counts add up to the plan's rows
    }
    async fn batch(&self, batch: &Batch, tally: &mut Tally) -> Result<(), Report<Unavailable>>;    // one bulk request
    async fn settle(&self, batch, writes: &[impl Upsert], reply: Reply, applied: Effect, tally) -> Result<(), Report<Unavailable>>;
    async fn create(&self, body: &RawValue) -> Result<Reply, Report<Unavailable>>;
    async fn patch(&self, body: &RawValue) -> Result<Reply, Report<Unavailable>>;
}
```

A refused batch is logged with its status and message, then each of its writes is upserted on its own. A status means something only for the request that got it: a 409 means "exists" only after a create, and a 404 means "not there" only after a patch. A 404 after a create is the Graph not knowing the entity type, and it is recorded as a refusal like any other.

**`stage/send/tally.rs`: the counts** (new, 104 lines)

```rust
pub(super) enum Effect { Created, Updated, Archived, CreateExisted, UpdateMissing }
pub(super) struct Refusal { pub status: u16, pub message: Box<str> }
pub(super) enum Outcome { Applied(Effect), ArchiveMissing, Refused(Refusal) }

/// One counter per outcome, so each write adds to exactly one.
pub(super) struct Tally { created, updated, archived, create_existed, update_missing, archive_missing, failed }

impl Tally {
    pub(super) fn record(&mut self, target: &Target, outcome: Outcome);   // logs refusals and mismatches
    pub(super) fn rows(&self) -> u64;                                     // the writes counted
    pub(super) fn into_part(self) -> SendPart;                            // the combined counts below
}
```

What the counts of the `send` part mean. `created`, `updated` and `archived` count what the Graph did. The three other counts say how often that was not what the row asked for:

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

| New file               | Item                                                                                   | Comes from                                                                                                                                                                     | Kind    | Lines |
| ---------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ----- |
| `send/mod.rs`          | `send`, `RunSend`, the failure codes                                                   | none                                                                                                                                                                           | new     | 165   |
| `send/plan/mod.rs`     | `Position`, `Target`, the three write types, `Writes`, `Batch`, `Plan`, the open batch | none. The order is that of `Op` in `sync_table/row.rs`, which extends `engine`'s `OperationKind` (`graph/mod.rs:148-158`) to six kinds                                         | new     | 337   |
| `send/delivery/mod.rs` | `Upsert` for a create and an archive                                                   | `engine/graph/client/mod.rs:114-140`, `GraphClient::send` (27): a create, then a patch on a conflict; an archive that finds nothing                                            | adapted | 40    |
| `send/delivery/mod.rs` | `Delivery`, `Unavailable`, `Reply`, `Upsert` for an update                             | none. The cases are those of labs `graph/executor.rs`: `execute_create_batch_group` (`:1017-1111`), `deliver_once` (`:1413-1528`), `execute_patch_first_effect` (`:1211-1336`) | new     | 198   |
| `send/tally.rs`        | `Effect`, `Refusal`, `Outcome`, `Tally`                                                | none                                                                                                                                                                           | new     | 104   |

## Tests

- **The test Graph.** It is a small HTTP server inside the test (`send/testing.rs`). It holds entities and applies or refuses a bulk request as a whole. It refuses a request a test names with the status the test gives, with a message that names the entity. It can stop answering after a number of requests. It records every request with the status it got, its actor and the provenance of its bodies.
- **What needs a store.** The plan and delivery tests build their rows by hand and need no store. The stage tests call `send` and need a MinIO container, because Send reads the sync table.

**Moved, adapted:** `operations_sort_into_application_order` (`engine/graph/tests.rs`) and `finish_order` (`engine/graph/plan/tests.rs`) become `order_by_op_seq_and_entity`: six kinds in place of four, and `seq` in place of the entity id as the second key.

**New:**

- **Plan** (`plan/tests.rs`):
  - `limits_cut_batches`: the count and the size from `run.json`, a body over the size limit. The size is checked against the list the client sends.
  - `limits_keep_small_writes_after_large_one_together`
  - `entity_once_per_batch`
  - `positions_same_for_rows_in_any_order`
  - `order_settles_tie_by_body`
  - `writes_carry_their_fallback`
  - `link_without_ends_is_refused`
- **Delivery** (`delivery/tests.rs`). Each test also checks that the counts add up to the rows.
  - `bulk_applied_in_one_request`: an accepted batch is one request.
  - `refused_creates_sent_one_by_one`: `create_existed`, and a failed entity with its position and the Graph's message. `engine` has the middle case as `upsert_patches_existing`; labs as `rejected_bulk_create_falls_back…` (`executor.rs:3110`) and `create_409_patch…` (`:2494`).
  - `refused_updates_and_archives_sent_one_by_one`: `update_missing` and `archive_missing`, and refused updates and archives in batches 0 and 1. Labs has a create after a patch that found nothing in `…self_heals_through_the_patch_miss` (`executor.rs:3303`).
  - `fallback_refused_is_failed`
  - `status_means_something_only_for_its_request`: a 404 after a create and a 409 after a patch.
  - `unavailable_in_bulk_stops`, `unavailable_in_single_write_stops`, `unavailable_in_fallback_stops`
- **The stage** (`tests.rs`):
  - `send_completes_run`: the order, the counts, `current.json`, the actor and the provenance of every request, and a second Send that sends nothing.
  - `send_empty_run`
  - `send_rerun_after_unavailable_graph`: nothing recorded, the run still active, and the rerun ends with the same entities. Labs has this as a create whose answer was lost (`tests/crash_replay_test.rs:245`).
  - `send_row_invalid`: the failure is recorded, nothing is sent, and the run stays active.
  - `send_rows_missing`
  - `send_sent_run_only_completes`

## What was stripped

Against labs `graph/executor.rs`, about 1,080 lines on this path: turns with a request budget, the cursor, permits and the lock registry, several batches at once, the set of known conflicts, the patch-first order after a conflict, and waiting between attempts. Against `engine`: `GraphPlan::finish`, which refused a second write to an entity.

## Open points

- **Fact:** an update row holds every mapped property of its source row, the same set an insert row holds, so a create can be built from it (`08-prepare-incremental.md`, `changes.rs`).
- **Fact:** a list of n bodies takes n + 1 bytes more than the bodies (`09-graph-requests-and-client.md`).
- **Open, milestone 9:** the client returns every status but 429 and 502 to 504 as a refusal. The Graph answers a store it cannot reach with 500, and a request cancelled by a concurrent update with 499 (`graph/api/src/rest/legacy/status.rs`, `legacy/entity/mod.rs`). Send records such a write as a failed entity and completes the run, so an outage of the Graph's store fails every entity of the run. The same holds for a 404 of a route the Graph does not have, which Send counts as `archive_missing` for an archive. Both are answers of the client, so the fix belongs in milestone 9.
- **Chosen:** a body that alone is larger than `max_bytes` goes into a batch of its own. The Graph accepts it up to its own limit of 2 MiB and refuses it above that, and it is then recorded as a failed entity.
- **Chosen:** a row that cannot be read from the sync table, or whose bodies cannot be built, stops Send with `send_row_invalid`. A sync table that holds another number of the run's rows than Prepare wrote stops it with `send_rows_missing`. Neither is helped by a rerun.
- **Chosen:** the provenance of every body names the connector as its location and the run's submission time as its load time, as labs does. `engine`'s aviation test sets no load time.
- **Chosen:** a refused batch is logged once as a warning, with its number, op, size, status and message. Each refused write, and each of the three cases in which the Graph did not hold the entity as the row expected, is logged as a warning with the entity id. A finished run logs its counts.
- **Chosen:** every body of a row, the fallback included, is built before anything is sent. This holds about twice the bytes of the run's bodies in memory for the whole Send.
- **Chosen:** a failed entity's batch and index count from 0.
- **Known cost:** a rerun after a Send that stopped partway sends the batches it applied before again. A create batch is then refused with 409 as a whole, and each of its writes falls back to a create and a patch, so the batch costs about two requests per row. Waiting between attempts, or recording progress, is left for later.
- **Known limit:** the same rows give the same batches as long as the bodies encode to the same bytes. A change to how `type_system` serializes a body, between two attempts of one run, can move batch boundaries and with them the positions of failed entities.
- **Settled in `contracts.md`:** the type of the `batch` part of `run.json` is `BatchLimits`, so that `Batch` can mean a batch of writes here.
- **Decided:** the upsert rules, the counts, "not available", no shortcut for a repeated Send: `../plan.md`, step 3. D8: the failed entities are in `run.json`.
- **Decided in `../plan.md`, step 3:** an entity that is deleted and inserted again in one run is created first and archived second, so it ends up archived. Neither Prepare nor Send checks for it in the first version. `../open-issues.md` keeps the case.
