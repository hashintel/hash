# Integration pipeline: change requests

These are requested changes to the contracts and the six specs. CR-1 to CR-6 are not applied. CR-7 and CR-8 are settled in a reduced form: the contracts and the overview state the limit, and the code change is deferred as D17 and D18 in `00-overview.md`. Each request names what changes, why, which files it touches, and what it needs before it can be applied.

The requests come from a review of the specs against the goal of a small pipeline. The specs describe 209 functions. The requests below remove an estimated 35 to 45 of them.

| ID | Request | Needs first | Estimated effect |
| --- | --- | --- | --- |
| CR-1 | Order `writes` by target inside an operation | Nothing | About 6 functions less in stage 3 |
| CR-2 | Read query results as a stream | Nothing | About 12 functions and the `_row` column less |
| CR-3 | Require the same rows, drop byte identity | Nothing | About 6 functions less, simpler `RowFile` |
| CR-4 | Compute the entity ID in SQL | A decision. Verification A8 holds. | About 12 functions less in stage 2 |
| CR-5 | Take the rows of a failed run from its `writes` file | Nothing | One download and one table less in stage 2 |
| CR-6 | Merge error codes that no caller tells apart | Nothing | Fewer variants of `Code` |
| CR-7 | State what happens to a `HUGEINT` column | Settled: stated in the contracts, the cast is deferred (D17) | One sentence in the contracts |
| CR-8 | State what happens to an integer above 2^53 | Settled: recorded as a limit, the check is deferred (D18) | One test case |

## CR-1: Order `writes` by target inside an operation

**Change.** The contract "`writes`" orders rows by operation, then first request, then `entity_id`. The new order is operation, then first request, then target, then `entity_id`.

**Reason.** The Graph needs entities before links and archives last. It does not need an order by entity ID across targets. The current order forces stage 3 to merge one reader per target, because each `changes` file is ordered on its own.

**Touches.**

- `01-contracts.md`, "`writes`": the order rule.
- `stage-3-plan.md`: `plan_upserts` handles one target after another. `smallest` and the check that entity IDs rise across targets go.
- `stage-4-send.md`: the expected order of requests in its tests.
- `03-scenarios.md`: the `writes` tables of S1, S5, S7 and S8, where entities of two sinks share one operation.

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

**Change.** The contract "Tables as files" says the same rows give the same file. The new rule is that the same input gives the same rows in the same order. Tests compare rows.

**Reason.** A marker is written only if absent, so the files of the attempt that finishes first are the ones every later stage reads. Two attempts that write different bytes for the same rows cause no error. Byte identity makes `RowFile` flush by row count and by bytes, makes stage 3 buffer around it, and depends on the versions of the `parquet` and `serde_json` crates.

**Touches.**

- `01-contracts.md`, "Tables as files": the sentence on equal files.
- `shared-run.md`: `RowFile::write_pending` loses its flush rule. `RowFile` writes batches of a fixed row count.
- `stage-3-plan.md`: the four functions of `BufferedFile` go. The section "Determinism" keeps the rules for row order and for the key order of JSON, which make the request bodies equal.
- `03-scenarios.md`, "Cases tested per stage": "the same `writes` file, byte for byte" becomes "the same rows".

**Risk.** None found. `sorted_json` stays, so a request body is still the same text in every attempt.

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

**Status.** The contract "Tables as files" now states the type change. The explicit cast described below is deferred as D17.

**Change.** The contracts state that a `HUGEINT` column of a target's table is written to `changes` as `DECIMAL(38,0)`, and that a value with more than 38 digits fails stage 2 as permanent.

**Reason.** The verification shows that a `HUGEINT` column comes back from Parquet as `DECIMAL(38,0)`, so the planner sees `Value::Decimal`, and that a value with 39 digits makes `Workspace::load_capture` fail (`verification/results.md`, A7). The contracts say a column keeps the type DuckDB gives it when it reads the file, and name no exception. All other tested types keep their type.

**Touches.**

- `01-contracts.md`, "Tables as files" and "`changes`".
- `stage-2-diff.md`, `changes_sql`: an explicit cast, so that the failure comes from stage 2 with a code and not from stage 3's load.
- `stage-3-plan.md`, "P9".

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

- **CR-3.** The same rows give byte-identical Parquet files today, from `Workspace::capture` and from a writer with the settings of `RowFile`. The request stands, because the rule still depends on crate versions and still costs the flush rules.
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

After CR-1 to CR-3 stage 3 is small, so this option is recorded here and not requested.
