# Integration pipeline: change requests

These are change requests from the review of the contracts and the six specs. CR-1 and CR-3 are approved and applied. The later review also addresses CR-7 through producer-side validation, as described below. This does not mean the pipeline is implemented. CR-2, CR-4, CR-5 and CR-6 remain deferred. CR-7 supersedes the former D17 deferral; CR-8 remains a recorded limit with its check deferred under D18 in `00-overview.md`. Query readers still use ranges, UUID generation stays in Rust, and the four-stage pipeline stays intact.

The original drafts described 209 functions. The original estimate of 35 to 45 fewer functions covered the full list of requests, not the two approved here. CR-3 retains buffering that bounds memory and keeps blocking IO off the async executor, as agreed in review.

| ID | Request | Status / needs first | Effect |
| --- | --- | --- | --- |
| CR-1 | Order `writes` by target inside an operation | Applied to specs | Removes the cross-target merge and keeps one cursor open |
| CR-2 | Read query results as a stream | Deferred | About 12 functions and the `_row` column less |
| CR-3 | Require the same rows, drop byte identity | Applied to specs, retaining memory and IO safeguards | Removes the file-byte equality requirement |
| CR-4 | Compute the entity ID in SQL | Deferred; UUID generation stays in Rust | About 12 functions less in stage 2 if adopted later |
| CR-5 | Take the rows of a failed run from its `writes` file | Deferred | One download and one table less in stage 2 |
| CR-6 | Merge error codes that no caller tells apart | Deferred | Fewer variants of `Code` |
| CR-7 | State what happens to a `HUGEINT` column | Addressed in specs through shared export validation | Valid decimal checkpoints or a permanent producer error |
| CR-8 | State what happens to an integer above 2^53 | Settled: recorded as a limit, the check is deferred (D18) | One test case |

## CR-1: Order `writes` by target inside an operation

**Applied change.** The contract "`writes`" orders rows by operation, then first request, then target, then `entity_id`. Target and entity ID comparisons use text byte order. This applies to upserts and archives. Operation boundaries and creates-before-patches order stay; changing target alone does not start a new batch.

**Reason.** The Graph needs entities before links and archives last. It does not need an order by entity ID across targets. The former order forced stage 3 to merge one reader per target, because each `changes` file is ordered on its own. Labs at `40a8d14` sorts effects globally (`graph/planner.rs:126-145`) but already executes writes within one operation concurrently (`graph/executor.rs:866-1015`). Its effect-index reader requires global order (`graph/artifacts.rs:924-930`); this change belongs to the replacement `writes` format, not to that existing index.

**Touches.**

- `01-contracts.md`, "`writes`": the order rule.
- `stage-3-plan.md`: `plan_upserts` handles one target after another. `smallest` and the check that entity IDs rise across targets go. Checks within each target remain. `number_archives` orders by target, then entity ID.
- `stage-4-send.md`: the expected order of requests in its tests.
- `03-scenarios.md`: the first-run order used by S1 and the later scenarios, the restore order of S8, and the reconcile order of S9. S5 run 2 and S7 runs 2 and 3 already have at most one target in each group, so their write order stays the same.

**Risk.** None for the Graph. A batch then holds writes of one target more often, which changes nothing in stage 4.

## CR-2: Read query results as a stream

**Change.** `Workspace` gets one method that returns the rows of a query in batches, in place of all rows at once. Readers that work in ranges use it.

**Reason.** `Workspace::query` returns every row of a query in memory (`engine/src/workspace/connection/mod.rs:260-306`). The specs work around that with a row number column and range queries in three places. One streaming read removes all three.

**Touches.**

- `engine/src/workspace/`: the new method. The workspace already runs its connection on its own thread and answers over a channel, so batches can be sent the same way.
- `01-contracts.md`, "`changes`": the `_row` column goes. "Reserved column names": `_row` goes.
- `stage-2-rows.md`: `row_keys`, `read_range` and `unsigned` go, unless CR-4 removes the whole pass.
- `stage-2-diff.md`: `changes_sql` no longer numbers rows.
- `stage-3-plan.md`: `read_range`, `ChangePage`, the four functions of `ChangeCursor` and `number_archives` go. The point "`archives` has no row number" in `00-overview.md` no longer applies.

**Risk.** The stream has to end the query when the reader fails or is cancelled. The existing cancel path of `Workspace` (dropping the future of a request) has to cover it.

## CR-3: Require the same rows, drop byte identity

**Applied change.** For the same inputs and engine build, a stage produces the same schema and rows in the same order, including exact request JSON. Tests compare decoded tables. Equal Parquet bytes, sizes and artifact hashes are not required across attempts.

**Reason.** A marker is written only if absent, so the files of the attempt that finishes first are the ones every later stage reads. Two attempts that write different bytes for the same rows cause no error. Byte identity unnecessarily makes writer settings and library versions part of correctness. Each artifact is still verified against its own sha256, and send retries use the exact bodies of the winning checkpoint.

**Touches.**

- `01-contracts.md`, "Tables as files": the sentence on equal files.
- `shared-run.md`: flush thresholds are memory and IO settings, not byte-identity rules. Table tests compare schemas and ordered rows; marker tests cover equivalent files with different references.
- `stage-3-plan.md`: "Determinism" keeps row order and exact request JSON. `BufferedFile` and the byte-based flush limits remain for bounded memory and blocking IO; removing them without replacing those responsibilities is not part of this change.
- `03-scenarios.md`, "Cases tested per stage": "the same `writes` file, byte for byte" becomes "the same rows".

**Tradeoff.** Different encodings of the same table can occupy separate content-addressed objects, reducing deduplication. `sorted_json` stays, so a request body is still the same text for the same planning inputs and engine build.

## CR-4: Compute the entity ID in SQL

**Change.** A sink's ID column, and a link pipeline's `from` and `to` columns, shall be of type `VARCHAR`. Step 3 computes the entity ID with one SQL expression, and the Rust pass over the ID columns goes.

**Reason.** Decision A2 derives the ID once, in Rust, because DuckDB and Rust render a value that is not text differently. If the column is text, there is nothing to render, and one derivation in SQL is enough. The pass costs ten functions, a file of IDs per target, and a join.

**Touches.**

- `00-overview.md`: decision A2.
- `01-contracts.md`, "Entity ID".
- The definition crate: a check that the three columns are text, with an issue that tells the author to cast the column in SQL.
- `stage-2-rows.md`: `assign_ids`, `row_keys`, `read_range`, `row_ids`, `entity_ids`, `link_ids`, `id_cells`, `load_ids`, `final_select` and `unsigned` go. The moves of `text`, `clock` and `is_blank` out of `graph` are no longer needed for IDs.
- `engine/src/entity_id.rs`: `derive_entity_id` stays as the reference that tests compare the SQL against.

**Verified.** The engine's DuckDB accepts `sha1` over bytes, and one SQL expression gives the same UUID as `derive_entity_id` for all eight recorded vectors and five further names (`verification/results.md`, A8). One million rows took 3.3 s in SQL and 2.4 s in Rust, both in debug builds.

**Needs first.**

- A decision: a definition has to cast a numeric ID column to text itself. The rendering is then DuckDB's and is visible in the definition. For such a column the ID differs from the one labs derived, for example `1.0` in place of `1`.

**Risk.** Two of the eight recorded ID vectors use a number as the ID (`engine/tests/fixtures/entity-ids-typescript.json`). They would no longer match unless the definition casts the column to the text labs used.

## CR-5: Take the rows of a failed run from its `writes` file

**Change.** For an entity ID that only a failed run wrote, the new hash table takes `kind`, `target` and `source_id` from that run's `writes` file. The contract "The resend set" today copies the row from the failed run's hash table.

**Reason.** Stage 2 already reads the `writes` file of every run listed in `Current::sending`. Reading its hash table as well downloads a file with every entity of the integration to copy a few rows. The hash of a row with `live = false` is never compared, so it does not have to be exact.

**Touches.**

- `01-contracts.md`, "The resend set", and the table "What each function reads".
- `stage-2-diff.md`: `load_sending` loads one file. `carried_sql` reads the `writes` table. The `content_hash` of a carried row is a fixed text, for example the md5 of the empty string.

**Risk.** The `kind` of a write follows from its `operation`. An archive row in `writes` carries the same `target` and `source_id` as an upsert row, so nothing is missing.

## CR-6: Merge error codes that no caller tells apart

**Change.** `Code` has about 30 variants across the six specs. Variants are merged where the runner, the run interface and an operator all act the same way.

**Reason.** A code exists so that someone can act on it. Several codes differ only in the place that raised them.

**Touches.**

- `shared-run.md`, sections 3.3 and 6.
- Each stage spec's list of added variants. Candidates: the five source codes of stage 1 into two (a fault of the definition or credentials, and a source that is unavailable); `reader_stopped` and `invalid_writes` of stage 4 into the shared codes; `query_invalid` and `data_invalid`.

**Risk.** A merged code tells an operator less. The printed report still holds the full chain of causes.

## CR-7: State what happens to a `HUGEINT` column

**Addressed in specs.** A signed `HUGEINT` is exported as `Decimal128(38,0)` and read as `DECIMAL(38,0)`. Shared export validation checks decimal precision before writing each batch, including nested decimal arrays. Values that do not fit fail the producer permanently with `data_invalid` before capture publication or a checkpoint marker. Unsupported unsigned `UHUGEINT` logical types are rejected before Arrow conversion; a definition may explicitly cast them to a supported type.

**Implementation choice.** The original request proposed a cast in `changes_sql`. The shared export check covers SQL source captures and stage-2 exports alike, keeps ID/hash calculation unchanged, and avoids stage-specific casts or an extra file readback. It lives in the existing workspace capture path; stage 3 keeps its existing reader.

**Touches.** `01-contracts.md`, `shared-run.md` ("Checkpoint decimal validation" and error mapping), `stage-1-capture.md`, `stage-2-rows.md`, `stage-2-diff.md`, and `stage-3-plan.md`. The required cases include signed bounds, invalid data after a valid batch, nested values, unsupported unsigned types and no publication on failure.

The original verification remains historical evidence of the defect. The new validation still needs implementation and execution.

## CR-8: State what happens to an integer above 2^53

**Status.** The first version sends the number as it is. `00-overview.md` records the limit as D18, and `03-scenarios.md` has one case against a real Graph. The text below describes the check that D18 defers.

**Change.** The contracts state one of two rules for a number that a 64-bit float cannot hold exactly: stage 3 writes an issue and leaves the property out, or the pipeline accepts that every resend of the entity writes a new edition.

**Reason.** The verification shows that the Graph stores `9007199254740993` as `9007199254740992.0`, and that every resend of the same value writes a new edition (`verification/results.md`, B3). The value in the Graph is not the value of the source, and a reconcile is no longer free for such an entity. `00-overview.md` states this as an inference; it is now measured.

**Needs first.** A decision between the two rules. The first keeps wrong numbers out of the Graph and loses the property. The second keeps the rounded value.

**Touches.**

- `00-overview.md`, "What the review found", the point on numbers.
- `01-contracts.md`, "Request bodies" and "`issues`": a new `issue` value if the first rule is chosen.
- `stage-3-plan.md`: the property conversion.

## Results of the verification

`verification/results.md` has every statement with its command and output. 24 statements hold and 3 do not. Two of the three are CR-7 and CR-8. The third needs no change:

- **A duplicate create (B8a).** The check ran on this branch, whose Graph code is older than `origin/main`. On this branch a create with an existing UUID fails with a unique violation and no status. `origin/main` maps that violation to `AlreadyExists` (`postgres-store/.../knowledge/entity/mod.rs:1724-1729`), and the aviation test on `origin/main` depends on it. The specs are written against `origin/main`, so the 409 fallback of stage 4 stays. The check should be repeated on the branch that holds all the code.

Statements that hold and bear on a request above:

- **CR-3.** The verification observed byte-identical Parquet files from equal rows with the tested writer settings. That observation stays recorded; it is no longer a contract requirement. Buffering and IO safeguards remain independent of the encoding.
- **CR-2 and CR-4.** `rowid` is unique and stable, and a column named `rowid` hides it, so the reserved-name check is needed as long as the Rust pass exists.
- **The diff.** Every SQL statement of `stage-2-diff.md` passes the workspace's `SELECT` check, and fixture F gives the expected labels, totals and hash table.
- **The Graph.** A resend of identical values through one replace at the empty path gives the same edition, with and without explicit metadata, for text, for the numbers 12.5 and 8030, for a value with a unit conversion, and for a link without properties.

## Open points already recorded

`00-overview.md`, "Open points for pass 3", lists five more points. Two of them change with the requests above:

- "`archives` has no row number" no longer applies after CR-2.
- "`TargetRows` and `_key`" stays as it is.

## A larger option, not requested

Stage 3 could be merged into stage 4: the send stage would plan each changed row and send it, and no `writes` file would exist. Roll-forward would read the entity IDs of a failed run from its `changes` and `archives` files.

- **What it removes:** checkpoint 3, the `writes` file with its writer and its reader, and the batch numbers stored in a file. That is about 12 functions and one stored format.
- **What it costs:** the send stage then needs DuckDB and the planner, a restart of the send stage plans again, and a deploy between two attempts can change the request bodies of a run. Decision P6 kept checkpoint 3 for these reasons.

This option remains deferred. CR-1 and CR-3 are applied, and CR-7 is addressed in the specs through export validation; CR-2 has not been approved. Private helper simplification under `04-implementation-workflow.md` does not authorize changing these shared contracts.
