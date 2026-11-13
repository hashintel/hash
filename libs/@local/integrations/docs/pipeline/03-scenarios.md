# Integration pipeline: test scenarios

Each scenario is a sequence of runs over the aviation example, with the expected content of every stored file and the expected requests to the Graph. The expected output of one stage is the input fixture of the next, so a stage test and an end-to-end test read the same expectation.

The file and column names are those of [`01-contracts.md`](01-contracts.md). The decision IDs are those of [`00-overview.md`](00-overview.md).

## Fixture

The base definition is `definition/examples/aviation.yaml`, called D0 below. It has two SQL sources, two sinks and one link pipeline:

| Target | Reads | Entity type | ID column |
| --- | --- | --- | --- |
| `entity/sink-airfields` | Source `airfields` | `airfield/v/1` | `ICAO` |
| `entity/sink-aircraft` | Source `aircraft` | `aircraft/v/1` | `TAIL` |
| `link/aircraft-based-at` | Definition checkpoint `aviation/aircraft` | `based-at/v/1` | `TAIL` to `HOME_BASE` |

D0's rows:

| Source | Rows |
| --- | --- |
| `airfields` | `('ESSA', 'Arlanda')`, `('ESSB', 'Bromma')` |
| `aircraft` | `('SE-XXX', 'DC-3', '1946-04-02', '8030', 'KG', 'ESSA')`, `('N100', 'L-1049', '1957-07-15', '69000', 'LB', 'ESSA')` |

Every scenario uses web `00000000-0000-4000-8000-000000000001`, connector `aviation` and namespace `aviation`. A scenario changes D0 by editing the `VALUES` list of a source or the definition text, as stated per run.

### Entities

The UUIDs are UUID v5 values under the namespace UUID `d6e2c7a1-f84b-4e3a-9c0d-5b7f1e3a2d4c` over `"aviation::{entity type URL}::{source ID}"`. The type URLs start with `https://example.com/@demo/types/entity-type/`. The source ID of a link is `"{aircraft type URL}::{TAIL}::{airfield type URL}::{ICAO}"`.

| Name | UUID | Type | Source ID |
| --- | --- | --- | --- |
| `AC-SEXXX` | `468da978-f2fd-52d7-ad32-e319a155c918` | `aircraft/v/1` | `SE-XXX` |
| `AF-ESGG` | `5054d5ab-24dc-52f3-a197-36e4224907ce` | `airfield/v/1` | `ESGG` |
| `AF-ESSB` | `9a1348a1-6ded-5391-bd06-f2a96b5bffcb` | `airfield/v/1` | `ESSB` |
| `AF-ESSA` | `9ec2610c-ca36-53f4-b809-e9af4c4b3b68` | `airfield/v/1` | `ESSA` |
| `AC-GABCD` | `aa71f1d3-a8cc-5b22-b6ae-ad3688846530` | `aircraft/v/1` | `G-ABCD` |
| `AC-N100` | `e0db547f-47bc-5587-a517-7b9eb11d952c` | `aircraft/v/1` | `N100` |
| `AC2-SEXXX` | `345b1a19-003d-56e6-a008-4471367c5a5f` | `aircraft/v/2` | `SE-XXX` |
| `AC2-N100` | `b9e995c6-78ed-50af-b213-2b98cfaf5d60` | `aircraft/v/2` | `N100` |
| `L-GABCD-ESSB` | `67639262-b79b-579a-80e5-7687007d7ef1` | `based-at/v/1` | `aircraft/v/1` `G-ABCD` to `airfield/v/1` `ESSB` |
| `L-N100-ESSA` | `6ab96f70-86d5-5088-99a0-b31f86e6270c` | `based-at/v/1` | `aircraft/v/1` `N100` to `airfield/v/1` `ESSA` |
| `L-SEXXX-ESSA` | `b16436f1-2384-575c-b2d3-e5606539d19e` | `based-at/v/1` | `aircraft/v/1` `SE-XXX` to `airfield/v/1` `ESSA` |
| `L2-SEXXX-ESSA` | `abe0b07a-580f-5a18-81ec-5886fec9b2ac` | `based-at/v/1` | `aircraft/v/2` `SE-XXX` to `airfield/v/1` `ESSA` |
| `L2-N100-ESSA` | `f2142c0e-36fb-598e-8f88-8b8079a48daf` | `based-at/v/1` | `aircraft/v/2` `N100` to `airfield/v/1` `ESSA` |

The table above fixes the entity IDs used below. Each checkpoint file follows its own ordering contract: `writes` uses operation, first request, target, then entity ID. For D0, `sink-aircraft` precedes `sink-airfields`, even when an airfield UUID sorts before an aircraft UUID. The derivation was checked against the labs vector `conn-a`, `material/v/1`, `M-0001`, which gives `fdb92954-9bd5-5558-ae43-40437c693f27`.

### What a test compares

- **Entity IDs** are compared with the UUIDs above.
- **Content hashes** are compared with each other: a test asserts that a hash equals, or differs from, the hash of the same entity in another run. The literal value of a hash is asserted only in the hash vector test of step 3.
- **Request bodies** of stage 3 are compared with a snapshot.
- **Parquet tables** are compared by decoded schema and ordered rows, including exact request JSON. Equivalent files need not have the same bytes, size or sha256. A retry that reuses an existing marker still returns its exact artifact references.
- **Capture times.** Run 1 of a scenario is captured at `2026-11-06T12:00:00Z`, and each later run one hour after the run before it. A restore to a run and a reconcile use the capture time of the run whose captures they adopt.
- **Graph state** is read from the fake after each run: for every entity whether it exists, whether it is archived, its property object, and its edition count. The fake raises the edition count only when a patch changes the entity.

Every scenario runs against the fake Graph in the engine's tests. S1, S2, S3 and S9 also run against a real Graph in `tests/integrations/graph`, where the test reads the entity's edition ID in place of the edition count.

## S1: first run

| Run | Request |
| --- | --- |
| 1 | Apply D0 |
| 2 | Apply D0 |

**Run 1.** No run is committed, so every row is an insert.

- `CaptureOutput`: two sources with `rows` 2 and 2.
- `DiffOutput`: `base` absent, `resent` empty.
- `hashes`: six rows, all `live = true`.
- `changes`: `entity/sink-airfields` has `AF-ESSB` and `AF-ESSA`; `entity/sink-aircraft` has `AC-SEXXX` and `AC-N100`; `link/aircraft-based-at` has `L-N100-ESSA` and `L-SEXXX-ESSA`. Every row is `insert`.
- `archives` and `issues`: empty.
- `writes`:

| `seq` | `batch` | `operation` | `change` | Entity |
| --- | --- | --- | --- | --- |
| 0 | 0 | `upsert_entity` | `insert` | `AC-SEXXX` |
| 1 | 0 | `upsert_entity` | `insert` | `AC-N100` |
| 2 | 0 | `upsert_entity` | `insert` | `AF-ESSB` |
| 3 | 0 | `upsert_entity` | `insert` | `AF-ESSA` |
| 4 | 1 | `upsert_link` | `insert` | `L-N100-ESSA` |
| 5 | 1 | `upsert_link` | `insert` | `L-SEXXX-ESSA` |

- Requests: one bulk create with four bodies, one bulk create with two bodies.
- `SendOutput`: `created` 6, no `rejected`.
- `current.json` after the run: `committed` 1, `sending` empty.

**Run 2.** Nothing changed.

- `DiffOutput`: `base` 1. Every target has no `changes` file and `unchanged` equal to its row count.
- `hashes`: equal to run 1's.
- `writes`: empty. `batches` 0.
- Requests: none.
- `current.json`: `committed` 2.

## S2: a changed row

| Run | Request |
| --- | --- |
| 1 | Apply D0 |
| 2 | Apply D0 with `N100`'s `MODEL` set to `'L-1049G'` |
| 3 | Apply run 2's definition with `SE-XXX`'s `EMPTY_MASS` set to `''` |

**Run 2.**

- `changes`: `entity/sink-aircraft` has `AC-N100` with `update`. No other target has a file.
- `hashes`: the hash of `AC-N100` differs from run 1's. The other five are equal.
- `writes`: one row, `upsert_entity`, `update`, `AC-N100`, batch 0.
- Requests: one bulk patch with one body. The body's `properties` is one replace at the empty path.
- Graph: `AC-N100` has model `L-1049G` and one more edition. No other entity has a new edition.

**Run 3.** A value that becomes blank removes the property (P7).

- `changes`: `AC-SEXXX` with `update`.
- The patch's property object has no `empty-mass` property.
- Graph: `AC-SEXXX` has no `empty-mass` property.
- `issues` of stage 3: empty. A blank value is not an issue.

## S3: a deleted row

| Run | Request |
| --- | --- |
| 1 | Apply D0 |
| 2 | Apply D0 without the `N100` row |
| 3 | Apply D0 |
| 4 | Apply D0 with an `aircraft` source that returns no rows |
| 5 | Apply run 4's definition with `coverage: complete-or-empty` on the `aircraft` source |

**Run 2.** The aircraft is gone, and so is its link, because the link pipeline reads the aircraft rows.

- `archives`: `AC-N100` (entity), `L-N100-ESSA` (link).
- `hashes`: six rows. `AC-N100` and `L-N100-ESSA` have `live = false` and keep their hash, target and source ID.
- `writes`:

| `seq` | `batch` | `operation` | `change` | Entity |
| --- | --- | --- | --- | --- |
| 0 | 0 | `archive_link` | `archive` | `L-N100-ESSA` |
| 1 | 1 | `archive_entity` | `archive` | `AC-N100` |

- Requests: two bulk patches with one archive body each.
- Graph: both are archived.

**Run 3.** The row is back with the same values. The base has it with `live = false`, so it is an update.

- `changes`: `AC-N100` and `L-N100-ESSA`, both `update`.
- `writes`: `upsert_entity` `update` `AC-N100`, then `upsert_link` `update` `L-N100-ESSA`.
- Graph: both exist and are no longer archived.

**Run 4.** The source is `complete` and returned no rows, so the coverage rule applies to the sink and to the link pipeline that reads its definition checkpoint.

- `CaptureOutput`: `aircraft` has `rows` 0.
- `archives`: empty. `hashes`: equal to run 3's, all six `live = true`.
- `writes`: empty.

**Run 5.** With `complete-or-empty` an empty source archives.

- `archives`: `AC-SEXXX`, `AC-N100`, `L-N100-ESSA`, `L-SEXXX-ESSA`.
- `writes`: two `archive_link` rows in batch 0, two `archive_entity` rows in batch 1.

## S4: a renamed sink

| Run | Request |
| --- | --- |
| 1 | Apply D0 |
| 2 | Apply D0 with the step `sink-aircraft` renamed to `sink-planes` |
| 3 | Apply run 2's definition without the `model` property |

**Run 2.** The mapping is unchanged, so no hash changes and nothing is sent (A1).

- `DiffOutput::targets` has `entity/sink-planes` and no `entity/sink-aircraft`.
- `changes`: no file for any target. `archives`: empty.
- `hashes`: `AC-SEXXX` and `AC-N100` have `target` `sink-planes` and the same `content_hash` as in run 1.
- `writes`: empty. Requests: none.
- Graph: both aircraft exist, are not archived, and have no new edition.

**Run 3.** Removing a property changes the hashed columns, so the hash of every row of the target changes.

- `changes`: `entity/sink-planes` has `AC-SEXXX` and `AC-N100`, both `update`.
- Graph: neither aircraft has a `model` property.

## S5: a type version bump

| Run | Request |
| --- | --- |
| 1 | Apply D0 |
| 2 | Apply D0 with `aircraft/v/2` in the sink and in the link's `from` |

**Run 2.** The entity ID includes the versioned type URL, so the aircraft and their links get new IDs (D2).

- `changes`: `entity/sink-aircraft` has `AC2-SEXXX` and `AC2-N100`; `link/aircraft-based-at` has `L2-SEXXX-ESSA` and `L2-N100-ESSA`. All `insert`.
- `archives`: `AC-SEXXX`, `AC-N100`, `L-N100-ESSA`, `L-SEXXX-ESSA`.
- `hashes`: ten rows, six with `live = true`.
- `writes`:

| `seq` | `batch` | `operation` | `change` | Entity |
| --- | --- | --- | --- | --- |
| 0 | 0 | `upsert_entity` | `insert` | `AC2-SEXXX` |
| 1 | 0 | `upsert_entity` | `insert` | `AC2-N100` |
| 2 | 1 | `upsert_link` | `insert` | `L2-SEXXX-ESSA` |
| 3 | 1 | `upsert_link` | `insert` | `L2-N100-ESSA` |
| 4 | 2 | `archive_link` | `archive` | `L-N100-ESSA` |
| 5 | 2 | `archive_link` | `archive` | `L-SEXXX-ESSA` |
| 6 | 3 | `archive_entity` | `archive` | `AC-SEXXX` |
| 7 | 3 | `archive_entity` | `archive` | `AC-N100` |

## S6: a rejected write

The fake answers 400 to every create that contains `AC-N100`, in run 1 only.

| Run | Request |
| --- | --- |
| 1 | Apply D0 |
| 2 | Apply D0 |

**Run 1.**

- Files of stages 2 and 3: as in S1 run 1.
- Requests:
  1. Bulk create of four entities: 400.
  2. Four single creates: three applied, `AC-N100` 400.
  3. Create of the link `L-SEXXX-ESSA`: applied. `L-N100-ESSA` is not sent, because its left endpoint was rejected.
- `rejected`:

| Entity | `operation` | `status` | `reason` |
| --- | --- | --- | --- |
| `AC-N100` | `upsert_entity` | 400 | `graph_status` |
| `L-N100-ESSA` | `upsert_link` | absent | `endpoint_rejected` |

- `SendOutput`: `created` 4, `rejected` 2.
- The run commits: `committed` 1. `hashes` has all six rows with `live = true`.

**Run 2.** The rejected IDs of the base run are in the resend set (P2).

- `DiffOutput`: `base` 1, `resent` empty.
- `changes`: `AC-N100` and `L-N100-ESSA`, both `resend`.
- `writes`: `upsert_entity` `resend` `AC-N100`, then `upsert_link` `resend` `L-N100-ESSA`.
- Requests: patch of `AC-N100`: 404; create of `AC-N100`: applied; patch of `L-N100-ESSA`: 404; create of `L-N100-ESSA`: applied.
- `SendOutput`: `created` 2, no `rejected`.

## S7: a failed send, then roll forward

The fake answers the first two requests of run 2 and is unreachable after that.

| Run | Request |
| --- | --- |
| 1 | Apply D0 |
| 2 | Apply D0 with `aircraft` rows `N100` (`MODEL` `'L-1049G'`) and `('G-ABCD', 'DH-104', '1946-09-25', '2560', 'KG', 'ESSB')`, and no `SE-XXX` row |
| 3 | Apply D0 |

**Run 2.**

- `writes`:

| `seq` | `batch` | `operation` | `change` | Entity |
| --- | --- | --- | --- | --- |
| 0 | 0 | `upsert_entity` | `insert` | `AC-GABCD` |
| 1 | 1 | `upsert_entity` | `update` | `AC-N100` |
| 2 | 2 | `upsert_link` | `insert` | `L-GABCD-ESSB` |
| 3 | 3 | `archive_link` | `archive` | `L-SEXXX-ESSA` |
| 4 | 4 | `archive_entity` | `archive` | `AC-SEXXX` |

- Batches 0 and 1 are applied. Batch 2 is unreachable `max_attempts` times and the stage fails as retryable.
- No `send/_done.json`. `current.json`: `committed` 1, `sending` [2].
- Graph: `AC-GABCD` exists, `AC-N100` has model `L-1049G`, `AC-SEXXX` and `L-SEXXX-ESSA` are not archived, `L-GABCD-ESSB` does not exist.

**Run 3.** The source is back at run 1's rows. The diff against run 1 finds nothing, and the resend set holds the five entity IDs of run 2's `writes`.

- `DiffOutput`: `base` 1, `resent` [2].
- `changes`: `AC-SEXXX`, `AC-N100` and `L-SEXXX-ESSA`, all `resend`.
- `archives`: `AC-GABCD`, `L-GABCD-ESSB`.
- `hashes`: eight rows. Run 1's six are `live = true` with run 1's hashes. `AC-GABCD` and `L-GABCD-ESSB` are copied from run 2's hash table with `live = false`.
- `writes`:

| `seq` | `batch` | `operation` | `change` | Entity |
| --- | --- | --- | --- | --- |
| 0 | 0 | `upsert_entity` | `resend` | `AC-SEXXX` |
| 1 | 0 | `upsert_entity` | `resend` | `AC-N100` |
| 2 | 1 | `upsert_link` | `resend` | `L-SEXXX-ESSA` |
| 3 | 2 | `archive_link` | `archive` | `L-GABCD-ESSB` |
| 4 | 3 | `archive_entity` | `archive` | `AC-GABCD` |

- Requests: bulk patch of two entities: applied; patch of the link: applied; archive of `L-GABCD-ESSB`: 404, counted as absent; archive of `AC-GABCD`: applied.
- Graph: `AC-N100` has model `L-1049` and one more edition. `AC-SEXXX` and `L-SEXXX-ESSA` have no new edition. `AC-GABCD` is archived.
- `current.json`: `committed` 3, `sending` empty.

## S8: a restore

| Run | Request |
| --- | --- |
| 1 | Apply D0 |
| 2 | Apply D0 with `airfields` rows `('ESSA', 'Arlanda')` and `('ESGG', 'Landvetter')`, and `N100`'s `MODEL` set to `'L-1049G'` |
| 3 | Restore to run 1 |
| 4 | Restore to empty |

**Run 2.** `AF-ESGG` is inserted, `AC-N100` is updated, `AF-ESSB` is archived.

**Run 3.** The run uses run 1's definition and capture files. It reads no source.

- `RunInput`: `operation` `Restore { target: 1 }`, `definition` equal to run 1's.
- `CaptureOutput`: run 1's files and `captured_at`, `adopted_from` 1.
- `DiffOutput`: `base` 2.
- `changes`: `entity/sink-airfields` has `AF-ESSB` with `update`; `entity/sink-aircraft` has `AC-N100` with `update`.
- `archives`: `AF-ESGG`.
- `hashes`: seven rows. `AF-ESGG` has `live = false`. The other six have run 1's hashes.
- `writes`: `upsert_entity` `update` `AC-N100` and `AF-ESSB` in batch 0, then `archive_entity` `AF-ESGG` in batch 1.
- Every request carries run 1's `captured_at` as `loadedAt`.
- Graph: the six entities of run 1 exist with run 1's values, and `AF-ESGG` is archived.

**Run 4.** The run has no definition and no rows.

- `CaptureOutput`: no sources.
- `archives`: the four live entities and the two live links.
- `hashes`: seven rows, all `live = false`.
- `DiffOutput::targets`: `entity/sink-airfields`, `entity/sink-aircraft` and `link/aircraft-based-at`, each with `archived` 2 and no `changes` file. The run has no definition, so all three come from the `archives` file.
- `writes`: `L-N100-ESSA`, `L-SEXXX-ESSA` as `archive_link` in batch 0, then `AC-SEXXX`, `AC-N100`, `AF-ESSB`, `AF-ESSA` as `archive_entity` in batch 1. Target order comes from the archive records; no definition is needed.

## S9: a reconcile

After run 1 the test changes the Graph directly: it archives `AC-N100` and sets the name of `AF-ESSA` to `'Stockholm'`. Against the fake it sends two patch bodies through the fake's own `patch`. Against a real Graph it uses a store call.

| Run | Request |
| --- | --- |
| 1 | Apply D0 |
| 2 | Reconcile |
| 3 | Apply D0 without the `N100` row |
| 4 | Reconcile |

**Run 2.** The run recomputes run 1's rows from run 1's captures and resends all of them (P11).

- `RunInput`: `operation` `Reconcile { target: 1 }`.
- `changes`: all six rows, each `resend`.
- `hashes`: equal to run 1's.
- `writes`: `AC-SEXXX`, `AC-N100`, `AF-ESSB`, `AF-ESSA` as `upsert_entity` `resend` in batch 0, then `L-N100-ESSA`, `L-SEXXX-ESSA` as `upsert_link` `resend` in batch 1.
- Requests: two bulk patches.
- Graph: `AC-N100` is not archived and `AF-ESSA` has the name `Arlanda`; each has one more edition. The other four have no new edition.

**Run 4.** Run 3 archived `AC-N100` and `L-N100-ESSA`. A reconcile archives them again.

- `changes`: the four live rows, each `resend`.
- `archives`: `AC-N100`, `L-N100-ESSA`.
- Graph: no entity has a new edition.

## Expected `SendOutput`

Counts that are not listed are 0. `rejected` is absent unless stated.

| Scenario | Run | `SendOutput::counts` |
| --- | --- | --- |
| S1 | 1 | `created` 6 |
| S1 | 2 | All 0 |
| S2 | 2 | `patched` 1 |
| S2 | 3 | `patched` 1 |
| S3 | 2 | `archived` 2 |
| S3 | 3 | `patched` 2 |
| S3 | 4 | All 0 |
| S3 | 5 | `archived` 4 |
| S4 | 2 | All 0 |
| S4 | 3 | `patched` 2 |
| S5 | 2 | `created` 4, `archived` 4 |
| S6 | 1 | `created` 4, `rejected` 2, with the `rejected` file |
| S6 | 2 | `created` 2 |
| S7 | 2 | No output. The stage fails as retryable. |
| S7 | 3 | `patched` 3, `archived` 1, `absent` 1 |
| S8 | 2 | `created` 1, `patched` 1, `archived` 1 |
| S8 | 3 | `patched` 2, `archived` 1 |
| S8 | 4 | `archived` 6 |
| S9 | 2 | `patched` 6 |
| S9 | 3 | `archived` 2 |
| S9 | 4 | `patched` 4, `archived` 2 |

## Cases tested per stage

These cases need no sequence of runs. Each stage spec lists them with its unit tests.

| Stage | Case | Expected |
| --- | --- | --- |
| 2 | Two sinks of the same entity type produce the same ID | `duplicate_entity_id` |
| 2 | A row whose ID column is null or blank | No row in `hashes` or `changes`; `without_id` 1; one `missing_id` issue |
| 2 | A link row whose `from` or `to` column is null | One `missing_endpoint` issue |
| 2 | Archives above the archive limit | `archive_limit`; passes with `allow_mass_archive` |
| 2 | A source with `coverage: partial` | Its targets archive nothing |
| 2 | An ID column of type `DECIMAL`, `DOUBLE` or `TIMESTAMP` | The entity ID equals the planner's for the same value |
| 2 | A link with a measure property whose unit changes | The link's hash changes |
| 3 | First-request bodies above 1,500,000 bytes, or more than 128 writes | A new batch starts |
| 3 | A value that cannot be converted | The write has no such property; one `property_unconverted` issue |
| 3 | The same planning inputs and engine build, planned twice | Equal schemas and ordered rows in `writes` and `issues`, including exact request JSON; Parquet bytes may differ |
| 4 | Create answers 409, then patch answers 404 | Rejected with `not_found_after_conflict` |
| 4 | A single write answers 499 | Sent again; the stage fails as retryable after `max_attempts` |
| 4 | A single write answers 500 `max_attempts` times | Rejected with `graph_status` |
| 4 | `committed` differs from `DiffOutput::base` | `base_moved`; nothing is sent |
| 4 | Against a real Graph: an entity with the number `9007199254740993` is sent twice | The test records the stored value and whether the second send keeps the edition (D18) |
| 4 | The stage runs again after `send/_done.json` exists | No request; `commit` runs |
| All | A stage runs twice with the same input | The second call returns the first call's output and writes nothing |

## Existing tests and the scenarios

`reference/monorepo.md` Part B and `reference/labs.md` Part B list every test. These are the ones a scenario replaces or extends:

| Test | Covers today | Scenario |
| --- | --- | --- |
| `tests/integrations/graph/aviation` `delivery_replay` | Sends the six aviation writes to a real Graph twice and compares the stored entities | S1 and S9 against a real Graph. It gains the edition ID check, a load time, a changed value and an archive. |
| `engine/tests/pipeline.rs` `definition_aviation_tables` | Runs the aviation definition's pipelines in a workspace | S1, steps 2 and 3 |
| `engine/src/graph/plan/tests.rs`, snapshot `plan_aviation` | The request bodies of the aviation plan | S1, stage 3. The patch bodies change under P7. |
| `engine/src/graph/client/tests.rs` | Create, patch on 409, archive, 404 on archive against a mock server | Stage 4, the single-write table |
| `engine/tests/entity_id.rs` | The eight ID vectors | Step 3 |
| Labs `tests/worker_e2e_test.rs:163` | One submission, one create | S1 |
| Labs `src/graph/apply.rs:1408-1452` | A refused write ends the run | S6. The expected result changes: the run commits. |
| Labs inline tests of `restore.rs` and `reconcile.rs` | Resend of every stored object | S8 and S9. The expected writes change: only what differs is sent in S8. |

Labs has no test for S4 or S5, and none for the guards.
