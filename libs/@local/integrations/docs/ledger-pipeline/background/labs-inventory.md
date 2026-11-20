# Labs inventory for the four-stage pipeline

<!-- markdownlint-disable MD029 MD038 -->

Source: `pocs/integrations_rs` in the labs repository at `40a8d14`. All paths below are relative to that directory. The design it is mapped onto is `libs/@local/integrations/docs/pipeline/00-overview.md` in the monorepo.

Conventions:

- **Live** means reachable from `src/orchestrator/planning.rs`. **Dead** means reachable only from `engine::batch_sync::run` (`src/engine/batch_sync.rs:87`), which has no caller. A search for `batch_sync` finds three imports outside the module: `collect_sinks` and `compose_provenance` (`src/engine/candidate.rs:13`), `collect_sinks` (`src/graph/coherence.rs:70`, inside the dead `check`), and `load_run_checkpoint` (`src/graph/link_pipeline.rs:328`, inside the dead `load_inputs`).
- Recommendations are **take the logic**, **take with change** (with the decision ID from the overview), or **leave behind**.
- Code identifiers, SQL and JSON are quoted verbatim. Some test and function names contain words that the writing rules exclude. They appear only inside code formatting.
- IDs such as A1, P7 and D6 always refer to the overview. Items of Part D are cited as "Part D item N".
- Nothing in labs was run for this inventory. Some hash inputs and UUIDs were recomputed outside labs with Python `hashlib` and `uuid` and are marked "recomputed". Statements about DuckDB behaviour that no labs test covers are marked "by reading".

Scenario numbers used in Part B: S1 first run, S2 a changed row, S3 a deleted row, S4 a renamed sink, S5 a type version bump, S6 a rejected write, S7 a failed send then roll forward, S8 a restore, S9 a reconcile.

---

## Part A. Function inventory per stage

### Stage 1: Capture

#### `src/engine/source_capture.rs`

**`capture_sources`**, `src/engine/source_capture.rs:76-180`. Live.

```rust
pub(crate) async fn capture_sources(
    candidate_store: &Store, artifact_store: &ArtifactStore, bindings: &RunArtifactBindings,
    storage: &Storage, integration: &Integration, invocation: &InvocationV1, run: &RunView,
    web_id: &str, actor_id: &str, env: &Env,
) -> Result<DurableSourceCaptures, Report<SourceCaptureError>>
```

It captures each source that a pipeline reads and returns one Parquet file per source. Rules:

- A non-empty `invocation.replay` is an error (`:88-94`). A missing attempt ID is an error (`:95-98`).
- Pipelines are visited in topological order (`:101-102`). A `links_only` invocation captures nothing (`:103`).
- A source read by several pipelines is captured once (`:105-107`). An undeclared source is an error (`:108-111`). A source of kind `Checkpoint` is skipped (`:112-114`).
- If the run already has a bound capture for the source, that capture is used and the source is not read (`:115-127`).
- Otherwise the source is read into the table `_capture/{source}` (`:128-142`), copied to a staged Parquet file with `COPY (SELECT * FROM "_capture/{source}") TO '{path}' (FORMAT PARQUET)` (`:143-153`), published and bound (`:154-163`). The staged file and the table are then removed (`:164-167`).
- The returned `loaded_at` is `run.submitted_at` (`:176-179`). No capture time is taken.

The Parquet file contains the `_op`, `_key` and `_before` columns, because the table is built by `snapshot::materialize`.

Recommendation: take with change. P14: record a capture time in checkpoint 1 and stop using the submission time. P10: bind through `capture/_done.json` written only if absent. A6: drop `links_only` and `replay`.

**`hydrate_live_source`**, `src/engine/source_capture.rs:215-320`. Live.

```rust
async fn hydrate_live_source(
    store: &Store, storage: &Storage, source: &str, table: &str,
    kind: &SourceKind, access: SourceAccess<'_>,
) -> Result<(), Report<SourceCaptureError>>
```

It reads one source by kind. `Sql` runs the definition's SQL through `snapshot::materialize` (`:224-231`). `External` reads `read_parquet('{uri}')` for the storage key, and a missing key becomes the empty string (`:232-247`). `Rest` resolves a referenced secret and calls `rest_api::hydrate` (`:248-279`). `Postgres` reads the secret, captures to a staged Parquet file, materializes from it and deletes the file, also on failure (`:280-315`). `Checkpoint` does nothing (`:316`). `Table` is an error (`:317-319`).

Recommendation: take the logic for the four kinds the monorepo source readers do not already cover. Compare with the monorepo inventory first.

**`DurableSourceCaptures::planner_inputs`**, `src/engine/source_capture.rs:52-65`, and **`artifact_references`**, `:67-72`. Live. They map each source to its local file path and the shared `loaded_at`. Recommendation: take with change (P14). The checkpoint description replaces them.

**`SourceAccess::read_secret`**, `src/engine/source_capture.rs:190-213`. Live. It reads a user secret from the Graph and Vault for the run's actor. The error text names the secret's entity UUID and no value (`:208-211`). Recommendation: out of scope for the stage specs; keep the rule that error text holds no secret value.

#### `src/snapshot.rs`

**`key_expr`**, `src/snapshot.rs:13-20`. Live.

```rust
pub fn key_expr(primary_key: &[String]) -> String
```

It returns `CAST(to_json({'col1': "col1", 'col2': "col2"}) AS VARCHAR)`. Golden: `tests/golden/key-sql.json`. Recommendation: take the logic only if the new capture keeps `_key`. See the note under `materialize`.

**`materialize`**, `src/snapshot.rs:26-98`. Live.

```rust
pub async fn materialize(
    store: &Store, source: &str, staging_table: &str, read_expr: &str, primary_key: &[String],
) -> Result<Materialized, Report<SourceError>>
```

It describes the read expression (`:33-43`). It fails when the source has a column named `_op`, `_key` or `_before` (`:45-55`). It fails when a primary key column is missing, and the message lists the available columns (`:57-68`). It then creates the table (`:76-85`):

```sql
CREATE OR REPLACE TABLE "{staging_table}" AS SELECT 'snapshot' AS "_op", {key_expr} AS "_key", CAST(NULL AS JSON) AS "_before", {columns} FROM ({read_expr}) _src
```

It returns the row count (`:87-97`).

Recommendation: take with change. `_op` and `_before` exist for change streams. On the live path `_op` is read in one place, to reject delete rows (`src/graph/planner.rs:694-696`), and `_before` is never read. `_key` is read only for the quarantine entry (`src/graph/sink.rs:380`) and for ordering the input of `fn` steps (`src/steps.rs:224`). The two validations should be kept. Whether the three columns stay depends on what the monorepo capture already writes.

#### `src/connectors/rest_api.rs`

All live through `hydrate_live_source`.

| Function                                                                                       | Lines                | What it does and its rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Recommendation                                                                                             |
| ---------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `hydrate(store, source, staging_table, endpoint, primary_key, options, env) -> Result<i64, _>` | `:125-178`           | Fails if the endpoint references a secret and no resolved auth was passed (`:134-142`). Drops and fills `_raw/{source}` page by page, then calls `snapshot::materialize` and drops the raw table. **If no rows arrive it returns `0` and creates no staging table (`:161-163`).**                                                                                                                                                                                                                                         | Take with change: an empty source must produce an empty capture file (see Part D item 15).                 |
| `stream_pages_into`                                                                            | `:190-289`           | Interpolates the URL (`:200`). Defaults: `pageSize` 100, `rateLimitMs` 0, `maxPages` none (`:210-218`). Stops at `maxPages` (`:225-231`). Waits for the per-host pacer (`:234-236`). Stops on an empty or non-array result (`:245-248`). `next-link`: reads `pagination.field` (default `next`), stops when it is absent or empty (`:260-277`). `offset`: stops when a page has fewer rows than `pageSize`, otherwise adds the page length to the offset (`:278-283`). Any other pagination type reads one page (`:284`). | Take the logic.                                                                                            |
| `render_row`                                                                                   | `:293-305`           | Nested objects and arrays become JSON text. Scalars are kept.                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Take the logic.                                                                                            |
| `land_page`                                                                                    | `:308-391`           | Every column is `VARCHAR` (`:328-332`). A column first seen on a later page is added with `ALTER TABLE ... ADD COLUMN` and is NULL in earlier rows (`:341-352`). Rows are inserted in chunks of 500 (`:355`). Values are rendered with `js_string`; missing and null become NULL (`:373-376`).                                                                                                                                                                                                                            | Take the logic.                                                                                            |
| `resolve_next_link`, `same_origin`                                                             | `:407-436`           | A next link is resolved against the current page URL. It must have the same scheme, host and port as the configured endpoint, otherwise the capture fails.                                                                                                                                                                                                                                                                                                                                                                | Take the logic.                                                                                            |
| `build_url`, `urlencode`                                                                       | `:438-488`           | Query parameters come from `params`, rendered with `js_string` and interpolated. Offset pagination appends `offset` and `limit`. Every byte outside `A-Za-z0-9-_.~` is percent-encoded.                                                                                                                                                                                                                                                                                                                                   | Take the logic.                                                                                            |
| `headers`                                                                                      | `:490-519`           | Always sends `content-type: application/json`. A resolved secret is sent as given and is never interpolated (`:496-499`). Inline `header` and `bearer` auth values are interpolated.                                                                                                                                                                                                                                                                                                                                      | Take the logic.                                                                                            |
| `default_fetcher`                                                                              | `:521-558`           | Validates the URL against the egress rules, sends `GET` through `with_429_retry`, treats 2xx as success and parses JSON. On another status the error holds the status, a redacted URL label and the first 200 characters of the body (`:551-554`).                                                                                                                                                                                                                                                                        | Take with change: do not put response text into errors if it can hold row values.                          |
| `extract`                                                                                      | `:560-574`           | Reads a dotted path such as `data.items` from the response. A missing segment gives null.                                                                                                                                                                                                                                                                                                                                                                                                                                 | Take the logic.                                                                                            |
| `interpolate`, `now_token`                                                                     | `:577-616`           | Replaces `${NAME}` from the allowed environment and `${NOW}`, `${NOW+5m}`, `${NOW-2h}`, `${NOW-1d}` with a UTC time formatted `%Y-%m-%dT%H:%M:00Z`. Overflowing offsets give no value.                                                                                                                                                                                                                                                                                                                                    | Take with change (P14): `NOW` should be the capture time so that a rerun of stage 1 reads the same window. |
| `referenced_auth`, `ReferencedAuth::resolve`                                                   | `:104-118`, `:60-89` | Auth with `secretEntityUuid` must be `header` or `bearer` and must have no inline value. The stored secret must be `{"value": "<non-empty string>"}` and a valid header value. Errors hold no secret text.                                                                                                                                                                                                                                                                                                                | Take the logic.                                                                                            |
| `global_pacer`                                                                                 | `:120-123`           | One process-wide `FetchPacer`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Take the logic if per-host spacing stays.                                                                  |

Related helpers, both live for REST capture:

- **`with_429_retry`**, `src/http/retry.rs:12-30`. It resends on 429 up to 10 times (`:9`). The wait is the integer `Retry-After` in seconds, capped at 30 s, or `500 ms << attempt` capped at 30 s (`:32-49`). An HTTP-date `Retry-After` is ignored. Recommendation: take the logic.
- **`FetchPacer::await_slot`**, `src/http/pacer.rs:20-48`. Requests to one host are spaced by `rateLimitMs`. Entries older than 60 s are removed once the map holds more than 64 hosts. Recommendation: take the logic.

#### `src/connectors/postgres.rs`

All live through `hydrate_live_source`.

| Function                                                               | Lines      | What it does and its rules                                                                                                                                                                                                                                                                          | Recommendation  |
| ---------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `PostgresSource::from_value(value: &Value) -> Result<Self, String>`    | `:81-98`   | `host`, `database`, `schema`, `table` must be non-empty. `port` must not be 0 and defaults to 5432 (`:60-62`). `sslMode` defaults to `verify-full` (`:14-19`).                                                                                                                                      | Take the logic. |
| `deserialize_primary_key`                                              | `:64-78`   | `primaryKey` is one string or a list. It must not be empty and no entry may be empty.                                                                                                                                                                                                               | Take the logic. |
| `capture(source, stored_credentials, output, limits) -> Result<(), _>` | `:113-127` | Parses the credentials and runs the blocking capture on a blocking thread.                                                                                                                                                                                                                          | Take the logic. |
| `parse_credentials`                                                    | `:129-144` | The secret must be `{"username", "password"}` with no other field. Both must be non-empty. Error text holds neither names of unknown fields nor values.                                                                                                                                             | Take the logic. |
| `capture_blocking`                                                     | `:146-178` | Opens an in-memory DuckDB, applies limits, runs `SET allow_community_extensions = false; INSTALL postgres; LOAD postgres`, attaches the database `READ_ONLY`, and copies the table. The attach error is replaced by a fixed message because DuckDB puts the connection string into it (`:168-172`). | Take the logic. |
| `connection_string`, `libpq_value`                                     | `:199-217` | `host`, `port`, `dbname`, `user`, `password`, `sslmode`, each as `name='value'` with `\` and `'` escaped.                                                                                                                                                                                           | Take the logic. |
| `capture_sql`                                                          | `:219-227` | `COPY (SELECT * FROM "_capture"."{schema}"."{table}") TO '{path}' (FORMAT PARQUET)`.                                                                                                                                                                                                                | Take the logic. |

#### The capture binding: `src/orchestrator/run_artifacts.rs`

**`publish_bronze_capture`**, `src/orchestrator/run_artifacts.rs:83-146`. Live.

```rust
pub(crate) async fn publish_bronze_capture(
    &self, integration_id: &CanonicalIntegrationId, run_id: &RunId, attempt_id: &AttemptId,
    source: &str, candidate: &Path,
) -> Result<CapturedSource, Report<RunArtifactError>>
```

It returns the already bound capture when one exists (`:91-99`). Otherwise it uploads the file under its sha256 (`:101-108`), checks that the attempt is still current (`:110-117`), and records the binding in the journal (`:118-131`). If another attempt bound first, it uses that attempt's capture (`:132-143`).

**`recover_bronze_capture`**, `:148-165`, returns the bound capture or `None`. **`bound_artifact`**, `:167-191`, fails when the run is not running or the attempt changed. **`validate_reference`**, `:193-209`, requires the Parquet media type and the key prefix `{integration}/artifacts/bronze/sha256/`.

Recommendation: take with change (P10). The rule "first binding wins and later attempts read it" stays. The journal record is replaced by `capture/_done.json` written only if absent. The overview says the BE-933 branch already does this.

---

### Stage 2, step 2: Stage and SQL

#### `src/engine/candidate.rs`

**`plan_candidate`**, `src/engine/candidate.rs:40-162`. Live. This is the driver of steps 2 to 5 in labs.

```rust
pub(crate) async fn plan_candidate(
    store: &Store, integration: &Integration,
    captures: &BTreeMap<String, CapturedSourceInput<'_>>, invocation: &InvocationV1,
    transforms: &Transforms, env: &Env, submitted_at: &str,
) -> Result<CandidatePlanV1, Report<SourceError>>
```

Rules, in order:

1. Pipelines are sorted with `topology::sort_pipelines` (`:49-50`).
2. Coverage starts as `Complete`, or `Partial` for a `links_only` run (`:52-56`).
3. For each pipeline (skipped for `links_only`, `:58`): the source must be declared (`:60-63`). A source with `partial: true` sets coverage to `Partial` for the whole run (`:64-66`).
4. The capture is loaded into `{connector_id}/{source}` (`:67-75`).
5. The source row count is taken from that table, before any SQL step (`:76-83`).
6. Source assertions run with that count (`:84-93`).
7. If the count is 0 (`:97-109`): the pipeline's SQL and checkpoint steps still run on the empty table, so every definition checkpoint of the pipeline is replaced by an empty table (`:98`). Then, if the source is neither `partial` nor `archive_on_empty` and any sink of the pipeline already has a state table, nothing is planned for the pipeline and coverage becomes `Partial` for the whole run (`:99-103`). Otherwise each sink is planned with no input, which labels every prior row `delete` unless the source is partial (`:105-108`).
8. If the count is above 0, the pipeline runs and each sink is planned (`:110-124`).
9. The source table and the `_step/{id}` tables are dropped (`:125`).
10. After all pipelines, each link pipeline is materialized and planned, in definition order (`:129-150`). The provenance source label is `links:{link.id}` and the load time is `submitted_at` (`:131-136`).
11. The plan is finished: sorted, and checked for duplicate Graph identities across all sinks (`:158`, `src/graph/planner.rs:126-145`).

Recommendation: take with change. A1 and A2: this function stops calling the sink planner per sink; step 2 only produces one table per sink and link pipeline. P13: the empty-source rule becomes a guard over the whole integration in step 4, and it must not depend on whether a state table exists. D6: partial sources archive nothing. A6: drop `links_only`.

**`hydrate_captured_source`**, `src/engine/candidate.rs:164-213`. Live.

```rust
async fn hydrate_captured_source(
    store: &Store, table: &str, source: &str, kind: &SourceKind,
    captures: &BTreeMap<String, CapturedSourceInput<'_>>,
) -> Result<(), Report<SourceError>>
```

For `Sql`, `External`, `Rest` and `Postgres` it runs `CREATE OR REPLACE TABLE "{table}" AS SELECT * FROM read_parquet('{capture path}')` and fails when the source has no capture (`:195-211`). For `Checkpoint` it copies `_checkpoint/{name}` and fails when that table does not exist (`:172-191`). `Table` is an error (`:192-194`).

Recommendation: take the logic. See Part D item 19 for the `Checkpoint` case.

**`source_has_prior_sink_state`**, `:215-234`. Live. It returns true when `_state/sync/{connector}/{sink}` exists for any sink of the pipeline. Recommendation: leave behind. The new guard reads the committed hash table (P13).

**`plan_empty_source`**, `:236-272`. Live. It plans every sink of the pipeline with `input_table = None`. Recommendation: leave behind. In the new design a sink with no rows contributes no rows to the single diff.

**`materialize_empty_pipeline`**, `:274-312`. Live. It runs the pipeline's steps on the empty source table. The callback writes definition checkpoints and ignores sinks (`:286-295`). Recommendation: take the logic. A definition checkpoint must exist for dependants even when the source is empty. See Part D item 4 for the consequence labs has.

**`plan_source_pipeline`**, `:315-399`. Live. It runs `steps::run_pipeline`. For a sink step it calls `sink::plan_entity_sink` on the current table (`:344-360`). For a checkpoint step it runs `CREATE OR REPLACE TABLE "_checkpoint/{name}" AS SELECT * FROM "{current}"` (`:361-371`). Any row-build error from a sink fails the whole plan (`:392-396`). Recommendation: take with change (A1): the sink step only records which table the sink reads.

**`materialize_named_inputs`**, `:401-432`. Live. For each `inputs` entry it fails when `_checkpoint/{name}` does not exist, and copies it to `_ent_src/{source}/{alias}`. Recommendation: take the logic. A view would avoid the copy.

**`materialize_link_input`**, `:434-490`. Live.

```rust
async fn materialize_link_input(store: &Store, link: &LinkEntry) -> Result<String, Report<SourceError>>
```

The inputs are `[("input", link.source)]` when `source` is set, otherwise `link.inputs` (`:438-442`). No input is an error (`:443-446`). A missing checkpoint table is an error (`:449-458`). Each input is copied to `_link_src/{id}/{alias}` (`:459-468`). With no steps, exactly one input is required and is used directly (`:470-477`). Only `Sql` steps run; each writes `_link_step/{step.id}` and reads the previous one as `input` (`:478-486`).

Recommendation: take the logic.

**`reject_row_build_errors`**, `:492-509`. Live. Any row-build error fails the plan. The message holds the count and up to five `entity_id: message` pairs. Recommendation: take with change. The new design writes rows that cannot be planned to `plan/issues.parquet` (stage 3 in the overview) and the run continues.

**`cleanup_pipeline_tables`**, `:511-523`, and **`flatten_steps`**, `:525-536`. Live. Dropped before the snapshot: the source table `{connector_id}/{source}` and every `_step/{step.id}`. Also dropped elsewhere: `_capture/{source}` (`src/engine/source_capture.rs:165-167`), `_sync/current/{sink}` and `_diff/{connector}/{sink}` (`src/graph/sink.rs:460-465`), `_link_current/{id}` and `_link_diff/{id}` (`src/graph/link_pipeline.rs:292-296`). **Kept in the snapshot:** `_checkpoint/{name}`, `_ent_src/{source}/{alias}`, `_link_src/{id}/{alias}`, `_link_step/{step.id}`, `_state/sync/{connector}/{sink}`, `_state/links/{connector}/{id}` and `_state/meta`. Recommendation: leave behind. The new workspace is new per run and is not stored.

**`checkpoint_table`**, `:538-540`. Returns `_checkpoint/{name}`. Take the logic.

**`collect_sinks`**, `src/engine/batch_sync.rs:49-72`. Live. It lists every sink step of the given pipelines, including sinks inside branches, in definition order. Recommendation: take the logic.

#### `src/steps.rs`

| Function                                                                                                                 | Lines      | What it does and its rules                                                                                                                                                                                                                                                                                                                                                                                                                                                       | State                                                                                               | Recommendation                                                                               |
| ------------------------------------------------------------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `run_pipeline<T>(store, source_table, steps, named_inputs, transforms, on_side_effect) -> Result<PipelineOutcome<T>, _>` | `:44-73`   | Runs the steps in order and collects the callback results.                                                                                                                                                                                                                                                                                                                                                                                                                       | Live                                                                                                | Take the logic.                                                                              |
| `run_step`                                                                                                               | `:76-139`  | `Sql` writes `_step/{id}` and checks the meta columns. `Fn` looks up a transform by name and fails when none is registered (`:93-100`). `Branch`: every branch starts from the table before the branch, a branch inside a branch is an error (`:105-107`), and after the branch the main pipeline continues with the table from before the branch (`:108-133`). A sink or checkpoint step calls the callback with the current table and leaves the table unchanged (`:134-137`). | Live                                                                                                | Take the logic for `Sql`, `Branch`, sink and checkpoint. Leave `Fn` behind (Part D item 30). |
| `execute_sql_step(store, sql, input_table, output_table, named_inputs) -> Result<(), _>`                                 | `:141-186` | Creates the view `"input"` over the previous table and one view per alias, runs `CREATE OR REPLACE TABLE "{output}" AS {sql}`, then drops the views also when the SQL failed.                                                                                                                                                                                                                                                                                                    | Live                                                                                                | Take the logic.                                                                              |
| `assert_meta(store, table, step_id)`                                                                                     | `:188-212` | Fails when the step output lacks `_op`, `_key` or `_before`.                                                                                                                                                                                                                                                                                                                                                                                                                     | Live                                                                                                | Take only if the three columns stay.                                                         |
| `exec_transform`, `write_rows`, `sql_type`, `encode_param`                                                               | `:216-356` | Run an in-process row transform and write its output with inferred column types.                                                                                                                                                                                                                                                                                                                                                                                                 | Live code, never reached: the planner registers no transforms (`src/orchestrator/planning.rs:120`). | Leave behind.                                                                                |

#### `src/engine/asserts.rs`

All live, called at `src/engine/candidate.rs:84-93`.

| Function                                                                | Lines     | Rules                                                                                                                                                                                                                                          | Recommendation                                                                             |
| ----------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `run(store, source_table, source, asserts, row_count) -> Result<(), _>` | `:13-37`  | Row count checks always run. `notNull` and `unique` run only when the count is above 0 (`:22`). All failures are joined into one error.                                                                                                        | Take the logic.                                                                            |
| `row_count_failures`                                                    | `:39-54`  | `rowCount.min` and `rowCount.max`, both inclusive bounds. Messages: `rowCount: 3 < min 5`.                                                                                                                                                     | Take the logic.                                                                            |
| `not_null_failures`                                                     | `:56-89`  | Per column: `COUNT(*) FILTER (WHERE "c" IS NULL OR TRIM("c"::VARCHAR) = '')`. A blank string counts as null. Message: `notNull(c): 2 of 10 rows null or blank`.                                                                                | Take the logic.                                                                            |
| `unique_failures`                                                       | `:91-149` | A key is one column name or a list. Query: `SELECT cols, COUNT(*)::BIGINT AS n FROM t GROUP BY cols HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 5`. The message lists up to five offending keys, rendered with `js_string` and joined with `::`. | Take with change: the message holds key values. Decide whether that is acceptable in logs. |

#### `src/engine/topology.rs`

All live.

**`sort_pipelines`**, `src/engine/topology.rs:9-105`.

```rust
pub fn sort_pipelines(pipelines: &[Pipeline]) -> Result<Vec<&Pipeline>, String>
```

Errors, each prefixed `Topology error:`: duplicate pipeline source (`:21-29`); duplicate step ID across pipelines, branches included (`:36-41`); duplicate definition checkpoint name (`:44-51`); `dependsOn` itself (`:62-66`); `dependsOn` an undeclared pipeline (`:71-76`); `inputs` its own checkpoint (`:82-86`); `inputs` a checkpoint no pipeline produces (`:91-96`). Edges come from `dependsOn` and from `inputs`. A source of kind `Checkpoint` adds no edge (see Part D item 19).

**`kahn`**, `:107-149`. Kahn's algorithm. Pipelines with no open dependency keep declaration order. A cycle is an error that lists the remaining sources. **`linearize`**, `:151-162`, flattens branches.

Recommendation: take the logic. The overview says the monorepo definition already validates that every checkpoint has a producer, so part of this may exist there.

---

### Stage 2, step 3: Hash and entity ID

#### `src/graph/hash.rs` (every function)

**`struct_hash_expr`**, `src/graph/hash.rs:18-44`. Live.

```rust
pub fn struct_hash_expr(
    columns: &[String], column_types: &HashMap<String, String>, mut on_missing: impl FnMut(&str),
) -> String
```

It builds the hash SQL for a list of columns. Rules:

- No columns gives the constant `md5('')` (`:23-25`), which is `d41d8cd98f00b204e9800998ecf8427e`.
- Field names are positional: `p0`, `p1`, … (`:29-39`). Column names are not part of the hash input.
- A column missing from the table gives `p{i} := NULL` and calls `on_missing` (`:31-34`).
- A column whose described type is exactly `VARCHAR` gives `p{i} := NULLIF(TRIM("col"), '')` (`:35-37`).
- Any other type gives `p{i} := "col"` (`:38`).

Generated SQL, from `tests/golden/hash-sql.json`:

```sql
md5(struct_pack(p0 := "ERSDA", p1 := NULLIF(TRIM("MAKTX"), ''), p2 := "BRGEW")::VARCHAR)
```

**`canonical_hash_expr`**, `src/graph/hash.rs:49-78`. Live.

```rust
pub fn canonical_hash_expr(
    config: &SinkConfig, column_types: &HashMap<String, String>, on_missing: impl FnMut(&str),
) -> Option<String>
```

Column order: the sink's properties sorted by property URL (`:54-55`), then the provenance field accessors in the order `authors`, `firstPublished`, `lastUpdated`, each only when set (`:57-67`). The `entityId` column is not included. If any of these accessors is a coercion or a measure, the function returns `None` (`:69-77`).

**`whole_row_hash_sql`**, `src/graph/hash.rs:81-87`. Live. Used when `canonical_hash_expr` returns `None` (`src/graph/sink.rs:532-539`).

```rust
pub fn whole_row_hash_sql(entity_id_col: &str, input_table: &str) -> String
```

```sql
SELECT "{entityId}"::VARCHAR AS _entity_id, md5(data::VARCHAR) AS _content_hash FROM (SELECT * EXCLUDE ("_op", "_key", "_before") FROM "{input_table}") data
```

It hashes every column of the sink's input table except the three meta columns. That includes the ID column and columns no property maps. Strings are not trimmed.

**Where the entity hash is applied:** `build_current`, `src/graph/sink.rs:505-551`. With no input table it creates an empty `(_entity_id VARCHAR, _content_hash VARCHAR)` table (`:512-521`). Otherwise:

```sql
CREATE OR REPLACE TABLE "_sync/current/{sink_id}" AS SELECT "{entityId}"::VARCHAR AS _entity_id, {hash_expr} AS _content_hash FROM "{input_table}"
```

It then runs the duplicate guard (`:549`) and returns whether the struct hash was used (`:550`). Column types come from `column_types_of`, `src/graph/sink.rs:1021-1035`, which runs `DESCRIBE "{table}"`.

**The link hash:** `prepare_link_diff`, `src/graph/link_pipeline.rs:77-102`. Live. The columns are `entry.property_columns`, sorted and deduplicated (`:77-79`). `property_columns` is the column of every property accessor; for a measure it is the amount column only (`src/definition.rs:28-35`, `:1040-1044`). The struct hash is always used. There is no whole-row case for links.

```sql
CREATE OR REPLACE TABLE "_link_current/{id}" AS SELECT *, {hash_expr} AS _content_hash FROM (SELECT CAST("{from.column}" AS VARCHAR) AS _source_id, CAST("{to.column}" AS VARCHAR) AS _target_id, "{prop1}", "{prop2}" FROM "{data_table}" WHERE "{from.column}" IS NOT NULL AND "{to.column}" IS NOT NULL)
```

**`accessor_repr`**, `src/graph/hash.rs:89-104`. Live. Text form of an accessor for the config hash: a column name; `coerce:{name}:{column}`; `fn:{body}` for the imported `fn` case; `measure:{map_name}:{amount}:{unit}`; JSON null when absent.

**`sink_config_hash`**, `src/graph/hash.rs:109-139`. Live.

```rust
pub fn sink_config_hash(config: &SinkConfig, connector_id: &str) -> String
```

It is the hex sha256 of one compact JSON object. `serde_json` is built with `preserve_order` (`Cargo.toml:27`), so the key order is the order written in the code:

```json
{"entityType":"…","entityId":"…","namespace":"…","properties":[["url","accessor"],…],"propertyFields":[["url","column"],…],"provenanceFields":{"authors":…,"firstPublished":…,"lastUpdated":…},"provenance":…}
```

Inputs: `entity_type`, the `entity_id` column name, the namespace (`id_namespace`, else the connector ID), the properties as `[url, accessor_repr]` pairs sorted by their JSON text (`:110-115`), `property_fields` as `[url, column]` pairs sorted the same way (`:117-122`), the three provenance field accessors, and the sink-level `provenance` value (`:124-136`). **Not included:** `web_id`, unit maps, source-level and connector-level provenance, and the SQL steps.

**`link_config_hash`**, `src/graph/hash.rs:141-162`. Live.

```rust
pub fn link_config_hash(entry: &LinkEntry, namespace: &str) -> String
```

Hex sha256 of:

```json
{"linkType":"…","namespace":"…","from":{"entityType":"…","column":"…"},"to":{"entityType":"…","column":"…"},"properties":[["url","accessor"],…],"propertyColumns":["…"]}
```

**Not included:** `web_id`, unit maps, the link's `provenance`, and the link's SQL steps. No golden vector exists for it (`tests/golden/config-hash.json:46`).

Recommendation for `hash.rs`: take with change.

- A1: the hash becomes a column of one table for all sinks. The per-sink state table goes away.
- A2: `_entity_id` must stop being `"{entityId}"::VARCHAR`. The entity ID is derived in Rust and stored.
- D1: the config hash keeps the labs inputs in the first version. The overview records that unit maps are missing. `web_id` is also missing; with A1 the web is part of the entity ID, so a web change gives new IDs and needs no config hash input.
- Decide whether the whole-row case stays. The overview defines the content hash as "the values of the columns a sink maps to properties".

#### `src/graph/uuid.rs`

**`deterministic_uuid`**, `src/graph/uuid.rs:16-33`. Live.

```rust
pub fn deterministic_uuid(ns: &str, entity_type: &str, entity_id: &Value) -> String
```

sha1 over the 16 namespace bytes `d6e2c7a1-f84b-4e3a-9c0d-5b7f1e3a2d4c` (`:12-14`) followed by `"{ns}::{entity_type}::{js_string(entity_id)}"`, with the version and variant bits set (`:22-32`). This is a standard UUID v5 with that namespace UUID. Recomputed: Python `uuid.uuid5` gives the same result for six golden vectors.

**`composite_entity_id`**, `:35-37`. Returns `"{web_id}~{entity_uuid}"`.

Callers that fix the name string: `entity_graph_id` (`src/graph/client.rs:462-467`), `link_entity_ids` (`src/graph/client.rs:386-419`) and `archive_params` (`src/graph/client.rs:469-483`). The link UUID uses the link type as `entity_type` and the name `"{from type}::{source id}::{to type}::{target id}"` (`src/graph/client.rs:403-410`).

Recommendation: take with change (A2). The derivation runs once in step 3 for entities, link endpoints and links, and the result is stored. The overview says `engine/src/entity_id.rs` exists in the monorepo.

#### `src/value.rs`

**`js_string`**, `src/value.rs:30-47`. Live.

```rust
pub fn js_string(value: &Value) -> String
```

String: unchanged. Null: `null`. Booleans: `true`, `false`. A number that fits `i64`: its decimal text. Another number: `js_float_string`. Object or array: compact JSON.

**`js_float_string`**, `:52-58`. A finite float with no fraction and an absolute value below `1e15` prints as an integer (`1.0` gives `1`). Other floats use Rust's default formatting.

**`js_number`**, `:63-70`, parses trimmed text to an integer, else to a finite float. **`typed_value`**, `:10-12`, and **`unwrap_typed`**, `:15-25`, wrap and unwrap `{"$typedValue": true, "value": …, "dataTypeId": …}`.

The values `js_string` receives come from `from_duckdb`, `src/store.rs:609-668`. That function turns `DECIMAL` into a JSON number through its text (`:629-635`), `HUGEINT` and `UBIGINT` beyond `i64` into a float (`:618-626`), `BLOB` into hex (`:637`), `DATE` into `%Y-%m-%d` (`:638-642`), `TIME` into `%H:%M:%S%.f` (`:643-651`), and `TIMESTAMP` into `%Y-%m-%d %H:%M:%S%.f` (`:652-657`).

Recommendation: take with change (A2). One renderer for source IDs, used once.

---

### Stage 2, step 4: Diff

#### `src/graph/sink.rs`

**`prepare_entity_diff`**, `src/graph/sink.rs:104-200`. Live.

```rust
async fn prepare_entity_diff(
    store: &Store, sink_id: &str, sink: &SinkConfig, input_table: Option<&str>,
    connector_id: &str, partial: bool, env: &Env,
) -> Result<PreparedEntityDiff, Report<SourceError>>
```

Steps and rules:

1. Table names: current `_sync/current/{sink_id}`, state `_state/sync/{connector_id}/{sink_id}`, diff `_diff/{connector_id}/{sink_id}` (`:113-114`, `:148`).
2. `build_current` hashes the rows and runs the duplicate guard (`:115`).
3. Stale meta is handled only when there is an input table (`:122-126`).
4. **Partial carry-forward** (`:127-136`), when the source is partial and a state table exists:

   ```sql
   INSERT INTO "{current}" SELECT * FROM "{state}" WHERE _entity_id NOT IN (SELECT _entity_id FROM "{current}")
   ```

5. With no state table, an empty one is created from the shape of current (`:137-146`).
6. **The diff SQL, verbatim** (`:151`):

   ```sql
   CREATE OR REPLACE TABLE {diff_q} AS SELECT COALESCE(c._entity_id, p._entity_id) AS _entity_id, CASE WHEN p._entity_id IS NULL THEN 'insert' WHEN c._entity_id IS NULL THEN 'delete' WHEN c._content_hash = p._content_hash THEN 'unchanged' ELSE 'update' END AS _diff_op FROM {current_q} c FULL OUTER JOIN {state_q} p ON c._entity_id = p._entity_id
   ```

7. Counts per label (`:158-176`): `SELECT _diff_op, COUNT(*)::BIGINT AS n FROM {diff} GROUP BY _diff_op`.
8. **Mass-archive guard** (`:177-190`): `state_rows = updates + deletes + unchanged`. The plan fails when `deletes > max(1000, 0.5 * state_rows)` and `HASH_ALLOW_MASS_ARCHIVE` is not `1` (`src/config.rs:212-214`). The current and diff tables are dropped first. Message: `sink "{id}": refusing to archive {deletes} of {state_rows} previously synced rows (truncated source file?). Set HASH_ALLOW_MASS_ARCHIVE=1 if this mass archive is intended.`

Recommendation: take with change. A1: one join on entity ID over all sinks, against the committed hash table. A2: join on the stored entity ID. P13: the archive limit applies to the whole integration and to links. D6 replaces the carry-forward: sinks fed by a partial source archive nothing. The override stays as a run input.

**`plan_entity_sink`**, `src/graph/sink.rs:319-477`. Live.

```rust
pub async fn plan_entity_sink(
    store: &Store, sink_id: &str, sink: &SinkConfig, input_table: Option<&str>,
    ctx: &EntityPlanningContext<'_>,
) -> Result<EntitySinkPlanV1, Report<SourceError>>
```

Rules:

- Namespace: `sink.id_namespace`, else the connector ID (`:344-347`).
- With an input table it reads every input row joined to its diff label (`:353-363`):

  ```sql
  SELECT i.*, c._entity_id AS "__state_entity_id", d._diff_op AS "__diff_op" FROM {input_q} i JOIN {current_q} c ON CAST(i.{id_q} AS VARCHAR) = c._entity_id JOIN {diff_q} d ON d._entity_id = c._entity_id ORDER BY c._entity_id
  ```

- Every row is turned into an upsert, including unchanged rows (`:370-391`). The row counts as changed when the selection is `ForceAll` or its label is not `unchanged` (`:385-386`).
- Conversion audits are collected into `quarantined` (`:372-384`).
- A row that cannot be built is recorded as an error and as a quarantine entry whose `raw_value` is the whole row as JSON (`:392-411`).
- Deleted IDs are read with `SELECT _entity_id FROM {diff} WHERE _diff_op = 'delete' ORDER BY _entity_id` (`:416-422`). Each becomes an archive whose source ID is the `_entity_id` text from DuckDB (`:423-436`).
- Rows that could not be built are deleted from current, so the next run sees them as inserts (`:438-451`).
- **State is replaced here** (`:452-459`): `CREATE OR REPLACE TABLE "{state}" AS SELECT * FROM "{current}"`. This happens during planning, before anything is sent.
- Current and diff are dropped (`:460-465`).

Recommendation: take with change. A1 and A2 as above. The new step 4 writes labels and the new hash table and builds no requests. P9: request building moves to stage 3 and reads `changes/{sink}.parquet`. P2: an entity whose write is refused keeps being sent because its ID joins the resend set; the labs rule "remove the row from state" has the same purpose.

**`migrate_meta`** (entities), `src/graph/sink.rs:553-608`. Live.

```rust
async fn migrate_meta(
    store: &Store, sink_id: &str, sink: &SinkConfig, connector_id: &str,
    canonical: bool, has_previous: bool,
) -> Result<(), Report<crate::error::StoreError>>
```

The expected hash version is 2 for the struct hash and 1 for the whole-row hash (`:561`). The meta row is stale when it is missing, or its hash version differs, or its config hash differs (`:565-571`). When stale and a state table exists, it runs `UPDATE "{state}" SET _content_hash = NULL` (`:583-589`). In the diff SQL a NULL previous hash makes every row that still exists an `update`. It then writes the new meta row and keeps `graph_identity`, `web_id` and `namespace` from the old one (`:591-605`).

Recommendation: take with change (A1, D1). The rule to keep: a changed config hash or hash version makes every entity of that sink differ from the committed run once. The config hash can be stored per sink in checkpoint 2's marker, or be part of the content hash.

**`assert_unique_entity_ids`**, `src/graph/sink.rs:919-953`. Live. The duplicate guard:

```sql
SELECT _entity_id, COUNT(*)::BIGINT AS n FROM {current} GROUP BY _entity_id HAVING COUNT(*) > 1 LIMIT 5
```

Message: `sink "{id}": duplicate entity ids in pipeline output: A (2 rows), B (3 rows). Deduplicate upstream, e.g. SELECT DISTINCT ON ({entityId column}).`

A second duplicate check exists across sinks: `GraphPlanV1::finish`, `src/graph/planner.rs:126-145`, fails with `duplicate planned Graph identity` when two planned objects have the same kind and identity.

Recommendation: take with change (P13): one check over the entity ID column of the whole run.

**`report_coverage`**, `src/graph/sink.rs:955-1019`. Live. For each mapped plain column that exists it counts non-blank values with `COUNT(NULLIF(TRIM("c"::VARCHAR), ''))`. It warns when a column has no value in any row. The warning holds the sink ID, the row count and column names. Recommendation: take the logic. It is a log line and has no effect on the plan.

**`acknowledged_upserts`**, `:479-503`; **`diff_and_sync`**, `:202-313`; **`stream_upserts`**, `:611-705`; **`upsert_staged`**, `:716-838`; **`archive_deletes`**, `:841-917`. Dead. Recommendation: leave behind.

#### `src/graph/link_pipeline.rs`

**`prepare_link_diff`**, `src/graph/link_pipeline.rs:67-155`. Live.

```rust
async fn prepare_link_diff(
    store: &Store, entry: &LinkEntry, data_table: &str, connector_id: &str, namespace: &str,
) -> Result<PreparedLinkDiff, Report<SourceError>>
```

It builds the current table (see step 3), runs the duplicate-pair guard (`:103`), creates the state table `_state/links/{connector}/{id}` with columns `(_source_id VARCHAR, _target_id VARCHAR, _content_hash VARCHAR)` when missing (`:104-120`), handles stale meta (`:121-123`), and runs the diff.

**The link diff SQL, verbatim** (`:126`):

```sql
CREATE OR REPLACE TABLE {diff_q} AS SELECT COALESCE(c._source_id, p._source_id) AS _source_id, COALESCE(c._target_id, p._target_id) AS _target_id, CASE WHEN p._source_id IS NULL THEN 'insert' WHEN c._source_id IS NULL THEN 'delete' WHEN c._content_hash = p._content_hash THEN 'unchanged' ELSE 'update' END AS _diff_op FROM {current_q} c FULL OUTER JOIN {state_q} p ON c._source_id = p._source_id AND c._target_id = p._target_id
```

There is no archive guard.

**`plan_link_table`**, `src/graph/link_pipeline.rs:209-305`. Live.

```rust
pub async fn plan_link_table(
    store: &Store, entry: &LinkEntry, data_table: &str, ctx: &LinkPlanningContext<'_>,
) -> Result<LinkPipelinePlanV1, Report<SourceError>>
```

Namespace: `entry.id_namespace`, else the connector ID (`:215-218`). It reads every current pair with its label (`:226-233`):

```sql
SELECT c.*, d._diff_op AS "__diff_op" FROM {current_q} c JOIN {diff_q} d ON c._source_id = d._source_id AND c._target_id = d._target_id ORDER BY c._source_id, c._target_id
```

Every pair becomes a link upsert; it counts as changed under the same rule as entities (`:236-255`). Deleted pairs are read with `SELECT _source_id, _target_id FROM {diff} WHERE _diff_op = 'delete' ORDER BY _source_id, _target_id` (`:257-263`) and become archives with the source ID `"{from type}::{source id}::{to type}::{target id}"` and the link type as entity type (`:265-283`). State is replaced with `CREATE OR REPLACE TABLE {state} AS SELECT _source_id, _target_id, _content_hash FROM {current}` (`:284-291`). Conversion audits are collected into `quarantined` (`:239-251`).

**`assert_unique_pairs`**, `src/graph/link_pipeline.rs:372-404`. Live. The duplicate-pair guard:

```sql
SELECT _source_id, _target_id, COUNT(*)::BIGINT AS n FROM {current} GROUP BY _source_id, _target_id HAVING COUNT(*) > 1 LIMIT 5
```

Message: `link pipeline "{id}" produced duplicate source-target pairs: A::B (2 rows)`.

**`migrate_meta`** (links), `src/graph/link_pipeline.rs:406-479`. Live. Stale when the meta row is missing, the hash version is not 2, or the config hash differs (`:416-422`). When stale with prior state it deletes the link's rows from the pending table (`:436-449`, dead data) and sets every previous hash to NULL (`:454-460`). It then writes the new meta row (`:462-476`).

Recommendation for the three live functions: take with change. A1: links join the same hash table, keyed by the link's entity ID. A2: the link ID and both endpoint IDs are derived in step 3. P13: links get an archive limit. D5: links whose endpoint is archived stay live, as in labs.

Dead: `process` `:157-203`, `load_inputs` `:307-370`, `stage_ops` `:481-622`, `stage_next_state` `:624-644`, `flush` `:646-803`, `commit_link_state` `:808-838`, `link_op_id` `:840-848` (still called by `row_to_link_op` to fill an unused field), `ensure_pending_table` `:850-863`, `insert_pending` `:865-922`, `delete_pending` `:924-943`, `encode_link_op` `:947-966`, `decode_link_op` `:968-998`, `provenance_wire` `:1000-1019`, `provenance_from_wire` `:1021-1055`. Recommendation: leave behind.

#### `src/graph/state_meta.rs`

Live, called from both `migrate_meta` functions.

| Item                                                                   | Lines    | What it is                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `HASH_VERSION`                                                         | `:13`    | `2`.                                                                                                                                                                                                                           |
| `Meta`                                                                 | `:15-22` | `hash_version`, `config_hash`, `graph_identity`, `web_id`, `namespace`, all optional. The last three are only written by the dead coherence check.                                                                             |
| `ensure_table`                                                         | `:24-31` | `CREATE TABLE IF NOT EXISTS "_state/meta" (scope VARCHAR, connector_id VARCHAR, sink_id VARCHAR, hash_version INTEGER, config_hash VARCHAR, graph_identity VARCHAR, web_id VARCHAR, namespace VARCHAR, updated_at TIMESTAMP)`. |
| `read(store, scope, connector_id, sink_id) -> Result<Option<Meta>, _>` | `:33-58` | Scope is `entity` or `link`.                                                                                                                                                                                                   |
| `write(store, scope, connector_id, sink_id, meta)`                     | `:60-98` | Delete then insert, with `now()` as `updated_at`.                                                                                                                                                                              |

Recommendation: leave the table behind. Keep the two values it protects, the hash version and the config hash per sink, in checkpoint 2 (A1, A3, D1).

#### `finalize_projection_plan`, `src/graph/planner.rs:156-252`

Live. It is the second half of the labs diff: it compares the planned objects with the stored projection of the last applied state.

```rust
pub fn finalize_projection_plan(
    applied: &[ResolvedDesiredObjectV1], generated: GraphPlanV1,
    selection: EffectSelectionV1, coverage: ProjectionCoverageV1,
) -> Result<GraphPlanV1, CompatError>
```

Rules: a planned object marked unchanged, with the same live or archived state as before, keeps the stored bytes (`:211-215`). A planned object marked changed is sent only if its bytes differ from the stored bytes (`:216-217`, `:453-461`). An object in the projection that the plan does not mention is archived when it was live and coverage is `Complete`, and is carried unchanged otherwise (`:233-249`). `ForceAll` sends everything (`:225`, `:243`).

Recommendation: leave behind. The overview drops the stored projection. Two of its rules must reappear in the new diff: an entity ID in the committed hash table that no row of this run has is archived, and a partial source prevents that (D6).

---

### Stage 3: Plan writes

#### Request building in `src/graph/planner.rs`

**`row_to_entity_op`**, `src/graph/planner.rs:687-734`. Live. Called from `plan_entity_sink` at `src/graph/sink.rs:370`.

```rust
pub fn row_to_entity_op(
    row: &Row, sink: &SinkConfig, namespace: &str, provenance: &Provenance,
    unit_maps: &Map<String, Value>,
) -> Result<(EntityOp, Vec<(String, Audit)>), String>
```

Rules:

1. A row with `_op = 'delete'` is an error (`:694-696`). This is the only row-build error.
2. The source ID is the value of the `entityId` column, or null when the column is missing (`:698`). There is no check for a null or blank ID.
3. Provenance fields are applied (`:699`).
4. For each property, in definition order: the accessor is resolved (`:704`); the value is trimmed (`:705`); the property's source column is looked up in `property_fields` (`:706-710`); a per-property provenance `{"sources": [source]}` is built, where the location name is `"{location}/{column}"` when a column is known (`:711-715`); a conversion audit is kept (`:716-718`).

It calls:

- **`apply_provenance_fields`**, `:799-842`. For `authors`, `firstPublished` and `lastUpdated` it resolves the accessor, renders with `js_string`, trims, and drops blank values (`:812-823`). `authors` becomes a one-element list (`:832-834`). The two dates go through `datestamp`. Audits are labelled `provenanceFields.{name}` (`:816`).
- **`datestamp`**, `:844-854`. A value of exactly ten characters shaped `dddd-dd-dd` gets `T00:00:00Z` appended.
- **`with_field`**, `:856-864`. Location name `"{base}/{field}"`, or the field alone when the base is empty.
- **`trimmed`**, `:785-797`. A string is trimmed; a blank string becomes null; other values are unchanged.
- **`resolve_audited`** in `src/graph/accessor.rs` (below).

**`row_to_link_op`**, `src/graph/planner.rs:736-783`. Live. It reads `_source_id` and `_target_id` as strings (missing gives the empty string, `:743-752`), resolves and trims each property (`:755-761`), and sets `properties` to `None` when the link maps no property (`:778`).

**`plan_entity_upsert`**, `:299-327`; **`plan_entity_archive`**, `:329-353`; **`plan_link_upsert`**, `:355-387`; **`plan_link_archive`**, `:389-395`. Live. Each builds the request bodies through `src/graph/client.rs` and stores them in one payload: an upsert holds `create`, `patch` and `archive` bodies; an archive holds only `archive`. `plan_entity_upsert` renders the archive's source ID with `js_string` (`:304`), so the archive stored with an upsert targets the same entity as the upsert.

**`validate_delivery`**, `:866-903`, and **`validate_request_identity`**, `:905-918`. Live. The identity must be non-empty and hold no whitespace (`:872-876`). `create` must be an object (`:883-885`). `patch.entityId` and `archive.entityId` must equal the identity. `patch.archived` must be `false` (`:892-894`) and `archive.archived` must be `true` (`:897-901`). One encoded payload may be at most 4 MiB (`:31`, `:936-941`).

**`GraphPlanV1::add`, `merge`, `finish`**, `:112-145`. Live. `finish` sorts objects by kind and identity, fails on a duplicate, and sorts the writes by `(operation.order(), graph_identity)` (`:140-143`).

Recommendation for request building: take with change.

- P14: `loadedAt` is the capture time and appears only in the edition provenance. The per-property provenance at `:711-715` goes (D7).
- P7: the patch replaces the whole property object.
- A2: the planner reads the entity ID column. It does not derive IDs.
- P9: the planner reads `changes/{sink}.parquet`. The JSON values labs gets from `from_duckdb` (`src/store.rs:609-668`) must be defined for the Parquet reader, by column type.
- P6: the output is one row per write in `plan/writes.parquet`. The three-body payload and its codec (`:46-71`, `:254-297`, `:927-1016`) go.

Leave behind: `bind_apply_effects` `:520-577`, `plan_restore_effects` `:582-639`, `plan_reconcile_effects` `:643-684` (see Operations).

#### `src/graph/accessor.rs`

**`resolve_audited`**, `src/graph/accessor.rs:28-77`. Live.

```rust
pub fn resolve_audited(
    accessor: &Accessor, row: &Row, unit_maps: &Map<String, Value>,
) -> (Value, Option<Audit>)
```

- `Column`: the row value, or null when the column is missing (`:34`).
- `Coerce`: applies the coercion. For `date`, `time`, `number`, `integer` and `year` (`:22`), a null result from a non-blank input gives an audit with the raw value, `coerce:{name}`, and the reason `coerce:{name} produced nil` (`:36-50`). `boolean` and `trim` never audit.
- `Measure`: looks up the unit map by name (a missing map is an empty map, `:58-62`) and calls `coerce::measure`. A null result from a non-blank amount gives an audit with the reason `measure amount not numeric` (`:63-74`).

**`resolve`**, `:24-26`, drops the audit. **`blank`**, `:79-84`: null, or blank after `js_string` and trim.

Recommendation: take with change. The audits go to `plan/issues.parquet`. Part D item 5 shows that labs drops them.

#### `src/coerce.rs`

All live through `resolve_audited`.

| Function                                           | Lines      | Rules                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apply(name: &str, value: &Value) -> Value`        | `:20-51`   | Dispatches by name. `integer` takes the number, then its `i64` value or the float truncated toward zero (`:26-32`). `year` trims, gives null for blank, else `js_number` (`:33-41`). `trim` trims strings only (`:42-45`). An unknown name panics (`:46-49`).                                                                                                              |
| `coerce_date(value: &Value) -> Option<String>`     | `:76-101`  | Trim. Blank gives none. Text starting `dddd-dd-dd` gives its first ten characters. `dd.dd.dddd` or `dd/dd/dddd` is read as day, month, year. `00000000` gives none. Eight digits are read as `yyyymmdd`. The result must match `^\d{4}-\d{2}-\d{2}$`; the values are not checked as a calendar date (`:100`). Day `00`, month `00` or year `0000` gives none (`:103-114`). |
| `coerce_time(value: &Value) -> Option<String>`     | `:116-137` | Trim. Blank and `000000` give none. Six digits become `hh:mm:ss`. `hh:mm:ss` gets `+00:00` appended. `hh:mm:ss.fff` gets `+00:00` unless its last six characters hold `Z`, `z`, `+` or `-`. Anything else is returned unchanged.                                                                                                                                           |
| `coerce_number(value: &Value) -> Option<Value>`    | `:148-164` | A JSON number is returned as is. Text is trimmed. When it holds a comma after its last dot it is read as `1.234,56`: dots are removed and the comma becomes a dot. Otherwise `js_number`. `1,234.56` gives none.                                                                                                                                                           |
| `coerce_boolean(value: &Value) -> bool`            | `:172-181` | A JSON boolean is returned. Otherwise true for `X`, `TRUE`, `1`, `YES`, `Y` after trim and upper-casing.                                                                                                                                                                                                                                                                   |
| `measure(row_amount, row_unit, unit_map) -> Value` | `:185-209` | The amount goes through `coerce_number`; none gives null. The unit code is trimmed text. An unmapped code logs one warning per code per process (`:197-199`, `:218-231`). Lookup order: the code, then `"*"`. With a data type ID the result is a typed value; with none it is the bare amount.                                                                            |

`REGISTRY`, `:12-14`: `date`, `time`, `boolean`, `number`, `integer`, `year`, `trim`.

Recommendation: take the logic. Replace the panic at `:46-49` with a definition error.

#### Request bodies in `src/graph/client.rs`

All live. They are called from the planner, so the JSON is fixed at plan time.

**`entity_create_params`**, `src/graph/client.rs:357-367`.

```json
{
  "webId": "<web>",
  "entityTypeIds": ["<entity type URL>"],
  "properties": {"value": {"<base property URL>": {"value": <v>, "metadata": {"dataTypeId": <id or null>, "provenance": {"sources": [<source>]}}}}},
  "draft": false,
  "provenance": {"actorType": "machine", "origin": {"type": "api"}, "sources": [<source>]},
  "entityUuid": "<uuid>",
  "readOnly": true
}
```

**`entity_patch_params`**, `:369-377`.

```json
{
  "entityId": "<web>~<uuid>",
  "provenance": {"actorType": "machine", "origin": {"type": "api"}, "sources": [<source>]},
  "archived": false,
  "entityTypeIds": ["<entity type URL>"],
  "properties": [{"op": "add", "path": ["<base property URL>"], "property": {"value": <v>, "metadata": {…}}}]
}
```

**`archive_params`**, `:469-483`.

```json
{"entityId": "<web>~<uuid>", "provenance": {"actorType": "machine", "origin": {"type": "api"}, "sources": [<source>]}, "archived": true}
```

**`link_create_params`**, `:421-438`.

```json
{
  "webId": "<web>",
  "entityTypeIds": ["<link type URL>"],
  "properties": {"value": {}},
  "draft": false,
  "provenance": {…},
  "entityUuid": "<link uuid>",
  "linkData": {"leftEntityId": "<web>~<source uuid>", "rightEntityId": "<web>~<target uuid>"},
  "readOnly": true
}
```

With properties, `properties` has the same shape as for an entity, without per-property provenance (`:423-426`).

**`link_patch_params`**, `:440-460`.

```json
{"entityId": "<web>~<link uuid>", "provenance": {…}, "archived": false}
```

`properties` is added only when at least one property value is non-null (`:448-457`). The code comment says the Graph rejects an empty property patch (`:450-451`). `entityTypeIds` is never sent for a link.

**`<source>`**, `Provenance::source_json`, `src/graph/mod.rs:43-58`:

```json
{
  "type": "integration",
  "authors": ["…"],
  "location": { "name": "…" },
  "firstPublished": "…",
  "lastUpdated": "…",
  "loadedAt": "…"
}
```

`authors`, `firstPublished` and `lastUpdated` appear only when set. `location` and `loadedAt` always appear. `Provenance::op_json` is at `:61-67`.

Helpers:

- **`map_properties`**, `:516-532`. Unwraps a typed value, skips null values, and keys by `to_base_url(url)`.
- **`map_properties_as_patch`**, `:534-553`. One `add` per non-null property.
- **`property_with_metadata`**, `:499-514`. `dataTypeId` is the typed value's ID or null. `provenance` is added when the property URL has an entry.
- **`to_base_url`**, `:485-497`. Removes a trailing `v/<digits>` and returns everything before it.
- **`link_entity_ids`**, `:386-419`. Both endpoint UUIDs and the link UUID, with the source and target IDs as strings.

The exact bytes for one entity and one link are in `tests/golden/graph-delivery-v1.json` (see Part B).

Recommendation: take with change. P7: `entity_patch_params` and `link_patch_params` send one replace of the whole property object. P14 and D7: no per-property provenance. A2: `entityUuid`, `entityId` and `linkData` come from the stored columns. `draft: false`, `readOnly: true`, `archived`, and the provenance envelope stay. The overview says the monorepo planner exists; compare field by field.

**`compose_provenance`**, `src/engine/batch_sync.rs:804-850`. Live.

```rust
pub fn compose_provenance(
    integration: &Integration, source_level: Option<&Value>, source: &str, loaded_at: &str,
) -> Provenance
```

Each of `authors`, `firstPublished`, `lastUpdated` and `location.name` is taken from the source-level provenance, else from the connector-level provenance (`:815-832`). The default location name is `"{connector_id}/{source}"` (`:833`). Recommendation: take with change (P14) for `loaded_at`.

#### Order of writes: `src/graph/effects.rs`

**`GraphOperationV1::order`**, `src/graph/effects.rs:69-77`. Live.

```rust
pub const fn order(self) -> u8 {
    match self {
        Self::UpsertEntity => 0,
        Self::UpsertLink => 1,
        Self::ArchiveLink => 2,
        Self::ArchiveEntity => 3,
    }
}
```

Writes are sorted by this number, then by the `web~uuid` string (`src/graph/planner.rs:140-143`, `:572-575`). Entities are created before links that need them, and links are archived before entities.

Recommendation: take the logic. The rest of the file (`GraphEffectV1`, effect IDs, payload references, the codec, `:39-373`) is the effect index. Leave it behind.

---

### Stage 4: Send and commit

#### Response classification, `src/graph/executor.rs:1728-1764`

Live. Verbatim:

```rust
fn classify(response: EffectResponseV1, duplicate_body_proves_conflict: bool) -> Classified {
    match response {
        EffectResponseV1::Success => Classified::Success,
        EffectResponseV1::Transport(_) => Classified::Retryable { retry_after: None },
        EffectResponseV1::Http {
            status: 409,
            diagnostic: _,
            retry_after: _,
        } => Classified::Conflict,
        // Parity with the reference engines: the Graph reports a duplicate
        // create as a 500 whose body names the unique-constraint violation,
        // so the body markers are part of the conflict contract. Checked
        // before the 5xx retry rule or the duplicate would retry forever.
        EffectResponseV1::Http { diagnostic, .. }
            if duplicate_body_proves_conflict
                && (diagnostic.contains("duplicate key")
                    || diagnostic.contains("ALREADY_EXISTS")) =>
        {
            Classified::Conflict
        }
        EffectResponseV1::Http {
            status,
            retry_after,
            diagnostic: _,
        } if status == 429 || (500..=599).contains(&status) => {
            Classified::Retryable { retry_after }
        }
        EffectResponseV1::Http {
            status,
            diagnostic,
            retry_after: _,
        } => Classified::Permanent {
            status: Some(status),
            diagnostic: bounded_diagnostic(diagnostic),
        },
    }
}
```

`duplicate_body_proves_conflict` is true for single create requests (`:1595`) and for bulk creates (`:1172`). It is false for patches and archives. The body check has no status condition, so it also applies to a 4xx create response.

**`bounded_diagnostic`**, `:1766-1778`: the response body is replaced by `Graph response body omitted: {n} bytes, sha256 {digest}`, at most 1,000 characters (`:43`). An empty body gives `Graph response contained no diagnostic body`.

**`retry_delay`**, `:1780-1782`: `min(500 ms << min(requests_used, 6), 30 s)`.

Recommendation: take with change (P8). The overview states that status codes cannot tell bad data from temporary failure, so 5xx cannot stay "retry until the budget ends" for a single write. The conflict rule, the body markers and the diagnostic rule should be kept.

#### One write: `deliver_once`, `src/graph/executor.rs:1413-1528`

Live.

Upsert (`:1422-1495`):

1. Unless a conflict is already known for this write, send the create (`:1427-1437`). Success ends the write. 409 or a duplicate body records the conflict and continues to the patch (`:1443-1445`). A retryable or permanent result ends the attempt (`:1446-1451`).
2. Send the patch (`:1454-1462`). Success ends the write. A retryable result ends the attempt; the next attempt starts with the patch (`:1471-1473`). A 409 on the patch is permanent with the text `PATCH returned conflict; only create 409 is authoritative` (`:1474-1481`). A 404 on the patch, when the conflict was known before this attempt, clears the conflict and is retryable, so the next attempt starts with the create (`:1484-1489`). Any other permanent result ends the write as failed (`:1490-1493`).

Archive (`:1496-1526`): one `PATCH`. Success and 409 both end the write as done (`:1510`, `:1521`). A retryable result is retried. Any other 4xx, including 404, is permanent (`:1522-1524`).

Request cost used for budgets: 2 for an upsert, 1 for an archive (`:1674-1681`).

Recommendation: take with change (P8): create and patch at most once each per write, a cap on attempts, and a rejected record. Decide what a 404 on an archive means; the overview notes the monorepo client treats it as success.

#### Patch first: `execute_patch_first_effect`, `src/graph/executor.rs:1211-1336`

Live. Used after a bulk create was answered with a conflict. Sequence: patch (`:1230-1238`); on 404, create (`:1253-1264`); on a 409 for that create, patch again (`:1279-1289`). At most three requests. A 409 on either patch is permanent (`:1248-1252`, `:1304-1313`). Recommendation: take with change (P8).

#### Turns and batches

**`execute_permitted_turn`**, `src/graph/executor.rs:706-864`. Live. It takes the per-integration lock (`:712`), checks the cursor (`:715-729`) and then either runs the parallel path (`:736-740`) or sends the writes one after another (`:742-799`). In the serial path a retryable result waits `Retry-After` capped at 30 s, or `retry_delay`, and sends again while the budget allows another write of that cost (`:761-781`). The first permanent result ends the turn (`:782-789`). The cursor then advances over the writes that succeeded without a break (`:801-835`).

**`execute_parallel_turn`**, `:866-900`. Live when the transport allows more than one request at a time, which the HTTP client does (`src/graph/client.rs:287-289`). The writes considered are those from the start of the window that have the same operation as the first write (`:883`, `:913`). The batch path is used when that operation is an entity or link upsert, the batch size is above 1, the budget is at least 4, the first write has no known conflict, and more than one write was selected (`:884-897`).

**`select_parallel_batch_prefix`**, `:937-964`. Number of batches: `min(max(budget / 4, 1), max_in_flight)`. Writes taken: batch size times that number, stopping before the first write with another operation or a known conflict.

**`execute_create_batches`**, `:966-1015`. Cuts the selection into batches of the batch size, gives each batch `budget / batch_count` requests, and runs up to `max_in_flight` batches at once (`:997-1000`). Results are read in batch order. After the first batch that did not fully succeed, the successes of later batches are not counted (`:1003-1013`); those writes are sent again in the next turn.

**`execute_create_batch_group`**, `:1017-1111`. One `POST /entities/bulk` with the array of create bodies (`:1025-1048`).

- Success: every write of the batch is done (`:1057-1061`).
- Retryable: nothing is done and the turn ends. The batch is not split (`:1062-1066`).
- Conflict: every write of the batch is marked as a known conflict (`:1069-1075`). The writes are then sent one by one, in order, patch first, each needing a budget of 3 (`:1078-1090`).
- Permanent: the writes are sent one by one, in order, create then patch, each needing a budget of 2 (`:1091-1094`).
- The loop stops at the first write that does not succeed (`:1096-1102`).

Labs does not halve a failed batch. It goes from the whole batch to single writes.

**`execute_parallel_prefix`**, `:1113-1146`, and **`execute_parallel_effect`**, `:1175-1209`. Without the batch path, the selected writes are sent at once, up to `max_in_flight`, one attempt each. Successes count up to the first write that did not succeed.

**`finish_turn`**, `:1338-1411`; the known-conflict set, `:1530-1580`; **`charged_send`**, `:1587-1615`; **`admit_send`**, `:1620-1622`; **`send`**, `:1626-1647`; **`wait_retry`**, `:1649-1659`. These record the cursor and charge requests to a scheduler budget.

Recommendation: take with change.

- P8: a failed batch is retried one write at a time. A batch answered with a retryable status also needs this, because one bad entity can make a bulk request return 500.
- D8: no cursor in the first version; a restarted send stage sends every batch again. The turn budget, the cursor, the lock registry and the lease permit are coordination and are out of scope.
- P6: batches are cut in stage 3 and stored in `writes.parquet`. Labs cuts them at send time by count. The overview's 2 MB body limit needs a cut by body size as well.
- The rule "never send writes of two operations at once" and the order of operations stay.

Leave behind: `ExecutionPlanLoader`, `src/graph/executor.rs:264-551` (loads the manifest, the state version, the projection and the effect pages and cross-checks their digests); `delivery_from_payload`, `:570-599`; `ChunkBudget`, `:69-82`; `EffectTurnPermit`, `:173-206`; `WorkCursorCommitter`, `:161-168`, `:208-239`; `EffectLaneRegistry`, `:632-649`.

#### HTTP requests in `src/graph/client.rs`

**`effect_request_once`**, `src/graph/client.rs:133-189`. Live.

```rust
async fn effect_request_once(&self, actor_id: &str, request: EffectRequestV1) -> EffectResponseV1
```

It takes one token from the rate limiter (`:138-145`). Create is `POST {base}/entities`; patch and archive are `PATCH {base}/entities` (`:146-154`). Headers: `content-type: application/json` and `x-authenticated-user-actor-id: {actor}` (`:156-157`). The timeout is `HASH_GRAPH_TIMEOUT_MS` (`:158`). A timeout and any other send error are reported as transport failures (`:161-171`). `Retry-After` is read as integer seconds and capped at 30 s (`:173-178`). Any 2xx is success and the body is not inspected (`:180-181`). Each call sends once; it does not retry.

**`create_batch_once`**, `:191-254`. Live. The bulk request code.

```rust
async fn create_batch_once(&self, actor_id: &str, requests: Vec<Value>) -> EffectResponseV1
```

`POST {base}/entities/bulk` with a JSON array of create bodies (`:200-208`). It takes one token for the whole batch (`:192-199`). `Retry-After` is handled as above (`:220-225`). The first rejected bulk request of the process logs a warning with the status and the first 512 characters of the response body, with control characters replaced by spaces (`:230-247`).

**`impl GraphEffectTransport for HttpClient`**, `:258-290`. Batch size: `durable_bulk_size` (`:283-285`). Requests at once: `concurrency.max(1)` (`:287-289`).

**`HttpClient::new`**, `:55-84`. When `HASH_GRAPH_SERVICE_SECRET` is set and non-blank, every request carries `Authorization: HASH-Service {secret}`, marked sensitive (`:57-66`). The base URL has trailing slashes removed (`:68`).

Recommendation: take with change. The overview says the monorepo client exists for single requests and has no bulk request and no classification; `create_batch_once` and the `Retry-After` parsing are the parts to add. Review the 512-character body log (see Part D).

Dead in the same file, leave behind: `request` `:86-131`, `upsert_main` `:556-568`, `upsert_patch_first` `:570-583`, `bulk` `:588-634`, `run_chunk` `:636-704`, `Breaker` `:320-346`, `has_entity` `:713-744`, `archive_entity` `:746-757`, `bulk_upsert_entities` `:759-771`, `bulk_upsert_links` `:773-785`. One rule from the dead path differs from the live path: `archive_entity` treats 404 as success (`:754`).

#### Settings

| Setting                                     | Default                 | Where                                    | Used on the live path                                                |
| ------------------------------------------- | ----------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `HASH_GRAPH_BULK_SIZE`                      | 128                     | `src/config.rs:59-61`                    | Yes, through the next row.                                           |
| `INTEGRATIONS_DURABLE_GRAPH_BULK_SIZE`      | the bulk size           | `src/config.rs:65-69`                    | Yes: writes per bulk create.                                         |
| `HASH_GRAPH_CONCURRENCY`                    | 16                      | `src/config.rs:55-57`                    | Yes: requests or batches at once.                                    |
| `HASH_GRAPH_TIMEOUT_MS`                     | 120,000, at least 1,000 | `src/config.rs:75-77`                    | Yes: per request.                                                    |
| `INTEGRATIONS_MAX_GRAPH_REQUESTS_PER_CHUNK` | 64, at least 2          | `src/orchestrator/activation.rs:230-239` | Yes: requests per turn.                                              |
| `HASH_GRAPH_MAX_FAILED_BATCHES`             | 5                       | `src/config.rs:71-73`                    | No (dead `Breaker`).                                                 |
| `HASH_SYNC_WINDOW`                          | 20,000                  | `src/config.rs:140-142`                  | No (dead windows), except a warning threshold in `src/steps.rs:233`. |
| `HASH_ALLOW_MASS_ARCHIVE`                   | off; on when `1`        | `src/config.rs:212-214`                  | Yes: the mass-archive guard.                                         |
| `MAX_EFFECTS_PER_WINDOW`                    | 2,048                   | `src/graph/executor.rs:46`               | Yes: writes loaded per turn.                                         |

All integer settings are parsed with a floor of 1 (`src/config.rs:44-48`).

#### Rate limiting for one integration: `src/throttle.rs`

**`RateLimiter`**, `src/throttle.rs:17-20`:

```rust
#[async_trait::async_trait]
pub trait RateLimiter: Send + Sync {
    async fn acquire(&self, scope: &str, ops: u64, rate: Option<u64>) -> Result<(), String>;
}
```

**`Throttle::acquire_local`**, `:37-65`. A token bucket per scope. No rate or a rate of 0 turns it off (`:38-40`). Capacity is twice the rate (`:42`). Tokens refill at `rate` per second up to the capacity, then the full charge is taken, which may leave a negative balance (`:50-57`). With a negative balance the caller sleeps `ceil(-balance / rate * 1000)` ms (`:60-64`). Each caller reserves its charge before waiting, so callers that arrive together wait for different lengths of time.

On the live path the worker passes `rate_limit: None` (`src/orchestrator/runner.rs:133-145`), so this bucket is off there. Pacing is done by `src/throttle/coordinator.rs`, `src/throttle/drr.rs` and `src/throttle/rate.rs`, which share a rate across integrations.

Recommendation: take the logic of `Throttle` for the first version (D11: all workers share one rate limit). Leave the three scheduler files behind.

#### `Retry-After`

- Live for Graph writes: parsed at `src/graph/client.rs:173-178` and `:220-225` (integer seconds, capped at 30 s; other forms are ignored). Used at `src/graph/executor.rs:761-764`: the wait is that value capped at 30 s, else `retry_delay`. When the turn's budget has no room for another attempt, the value is returned to the scheduler (`:779`).
- Live for REST capture: `with_429_retry`, `src/http/retry.rs:12-49` (see stage 1).

Recommendation: take the logic. Under P8 and the overview's failure table, a 429 makes the send stage fail as retryable; the wait value should be passed on with that error.

---

### Operations

**`src/graph/apply.rs`.** `plan_apply` (`:211-400`) takes the planned objects, loads the stored projection of the last applied state, calls `finalize_projection_plan` (`:272-278`), and then stores four things in order: the new projection (`:279-283`), a state version record (`:286-305`), the effect index (`:308-317`) and a work manifest (`:320-355`). It then records `WorkPlanned` in the journal (`:363-381`). On re-entry it returns existing work for the run (`:225-240`). `execute_apply_turn_with_permit` (`:428-562`) loads a window of writes, runs one executor turn, records `WorkCompleted` when all writes are done (`:500-536`), and on a permanent Graph failure records `RunTerminated` with the code `graph_permanent` (`:537-549`, `:629-670`). That termination puts the integration into the state `RestoreRequired`. `record_planning_failure` (`:567-627`) counts planning failures against a budget. The new design replaces all of this: stage 2 writes the hash table and the changed rows, stage 3 writes `writes.parquet`, stage 4 sends and then writes `current.json`. A refused write goes to `rejected.parquet` and the run commits (P2, P8). A run that fails while sending is repaired by the next run (P3).

**`src/graph/restore.rs`.** `plan_restore` (`:138-280`) runs only when the integration is in `RestoreRequired`. It loads two stored projections: the last applied state A and the state G of the failed run (`:185-190`). `plan_restore_effects` (`src/graph/planner.rs:582-639`) builds one write per identity in either: every object of A is sent again with A's stored bytes, and every identity that is only in G is archived. A missing A means every identity of G is archived. `execute_restore_turn_with_permit` (`:304-409`) sends them and marks the work `Blocked` on a permanent failure (`:469-512`), after which an operator retry resumes at the cursor. The new design replaces this (A4, P3, P12): a restore is an ordinary run that recomputes the target run's rows from its captures and diffs them against the committed run's hash table. A failed send needs no restore, because the next run resends the entity IDs of the failed run. Restore to empty archives every live entity and every entity in the resend set.

**`src/graph/reconcile.rs`.** `plan_reconcile` (`:143-293`) loads the stored projection of the applied state and calls `plan_reconcile_effects` (`src/graph/planner.rs:643-684`), which sends every live object again with its stored bytes and archives every archived object again. Each cycle has a number and its own work ID (`:158-161`, `:223-227`). A reconcile gives way to apply or restore work (`:185-193`). `execute_reconcile_turn_with_permit` (`:317-441`) sends in turns. The new design replaces this (P11, A6): a reconcile is a run that skips stage 1, recomputes the committed run's rows from its captures, marks every live row resend and every archived entity archive, and then uses stages 3 and 4 unchanged.

---

### Out of scope

One line per file group. None of these is inventoried further.

- `src/orchestrator/shard.rs`, `src/orchestrator/shard_log/*`, `src/orchestrator/lease.rs`: shard ownership, the journal command loop, leases.
- `src/orchestrator/events.rs`, `projection.rs`, `projection_snapshot.rs`, `projection_types.rs`, `state.rs`, `work.rs`, `baseline.rs`, `record_io.rs`, `registry.rs`: journal records, their projection, state versions and work manifests.
- `src/orchestrator/inbox.rs`, `control.rs`, `submission.rs`, `operator_commands.rs`, `activation.rs`, `conformance.rs`, `internal_metadata.rs`, `metadata.rs`, `ids.rs`, `routing.rs`, `port.rs`, `memory_adapter.rs`, `phase2_adapter.rs`, `managed.rs`, `worker_dispatch.rs`, `runner.rs`, `gc.rs`: submission, operator commands, activation checks, dispatch and garbage collection.
- `src/orchestrator/planning.rs`, `run_input.rs`: the planning attempt and the stored run input. P1 replaces the input record with `runs/{run}/input.json`. The workspace setup at `src/orchestrator/planning.rs:232-314` (DuckDB limits and allowed directories) is useful reading for the stage 2 spec.
- `src/orchestrator/hash_graph_vault.rs`, `src/secret.rs`: reading user secrets.
- `src/throttle/coordinator.rs`, `src/throttle/drr.rs`, `src/throttle/rate.rs`: scheduling across integrations.
- `src/graph/artifacts.rs`: the stored projection and effect index pages.
- `src/graph/coherence.rs`, `src/graph/recording.rs`, `src/graph/stub.rs`: the dead target check and test clients.
- `src/engine/batch_sync.rs` (except `collect_sinks` and `compose_provenance`), `src/engine/event_store.rs`, `src/engine/event_table.rs`, `src/connectors/cdc.rs`, `src/dlq.rs`, `src/run_manifest.rs`, `src/durable_artifacts.rs`: the dead direct-sync path, change streams and the quarantine table.
- `src/blob.rs`, `src/storage.rs`, `src/local_disk.rs`, `src/store.rs` (except `from_duckdb`, `qi`, `lit`), `src/config.rs`, `src/runtime_settings.rs`, `src/run_slots.rs`, `src/progress.rs`, `src/http/egress.rs`, `src/production.rs`, `src/application.rs`, `src/web_api.rs`, `src/main.rs`, `src/bin/release_attestation.rs`, `src/identity.rs`, `src/yaml.rs`, `src/definition.rs`: storage, disk budgets, settings, telemetry, entry points and the definition parser.

---

## Part B. Test inventory

### `tests/common/mod.rs`

A harness, no tests. `WorkerHarness` (`:29-130`) holds a temporary object store directory, a `wiremock` Graph, and a release attestation file. `spawn_worker` (`:97-111`) starts the real worker binary. `submit` (`:113-125`) submits a definition. `wait_for` (`:262-283`) polls a run's status.

Fixtures to port:

- `WEB_ID = "00000000-0000-4000-8000-000000000001"`, `ACTOR_ID = "00000000-0000-4000-8000-000000000002"` (`:26-27`).
- `orders_definition(connector_id, sql)` (`:148-176`): one `sql` source `orders` with `primaryKey: "id"`, one pipeline, one sink `orders-sink` with `entityType` `https://example.test/types/entity-type/order/v/1`, `entityId` `id`, and the property `https://example.test/types/property-type/name/` mapped to `name`.

### `tests/golden`

Format: one JSON file per subject. `tests/golden/README.md:3-7` says the pipeline fixtures were written by the TypeScript engine and must be regenerated there. Each test reads the file, runs the Rust function on the inputs in it, and compares with the expected value in it.

Pipeline fixtures:

| File                                  | Content                                                                                                                                                   | Compared by                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `uuids.json`                          | Eight cases: `ns`, `entityType`, `entityId` (string or number), expected `uuid` and `composite`.                                                          | `uuids_match_the_ts_engine`                                                                                                     |
| `key-sql.json`                        | Two primary keys and the expected `_key` SQL.                                                                                                             | `key_sql_matches_the_ts_engine`                                                                                                 |
| `hash-sql.json`                       | Three sink configs with column types and the expected hash SQL, or null for the whole-row case.                                                           | `canonical_hash_sql_matches_the_ts_engine`                                                                                      |
| `config-hash.json`                    | Connector ID `conn-a`, three sink configs and their sha256.                                                                                               | `sink_config_hashes_match_the_ts_engine`                                                                                        |
| `fallback-hash.json`                  | Table DDL, five inserts, the whole-row query with five expected hashes, the struct hash SQL with five expected hashes. Written for DuckDB `1.5.x` (`:3`). | `fallback_and_canonical_hashes_match_value_for_value`; `sibling_engine_golden_state_is_adopted_without_reupserts_or_byte_drift` |
| `graph-delivery-v1.json`              | The full stored payload (create, patch, archive bodies) for one entity and one link.                                                                      | `exact_entity_and_link_delivery_bytes_match_independent_golden`                                                                 |
| `op-ids.json`, `pending-payload.json` | IDs and payloads of the dead pending-link table.                                                                                                          | `link_op_ids_match_the_ts_engine`, `pending_payload_wire_shape_decodes`                                                         |

Out of scope fixtures (records of the coordination layer): `admission-pointer-v1.json`, `control-baseline-v1.json`, `control-projection-snapshot-v1.json`, `control-request-result-v1.json`, `control-request-v1.json`, `current-state-hint-v1.json`, `expected-record-declarations-v1.json`, `graph-artifacts-v1.json`, `graph-effects-v1.json`, `internal-metadata-v1.json`, `journal-record-v1.json`, `known-shard-marker-v1.json`, `pending-submission-v1.json`, `protocol-identities-v1.json`, `registry-omitted-declaration.json`, `routing.json`, `shard-lease-v1.json`, `state-version-v1.json`, `work-manifest-v1.json`.

#### Expected values to port

**UUIDs** (`tests/golden/uuids.json`). Name string is `"{ns}::{entityType}::{id}"` with ns `conn-a` and type `https://x/@t/types/entity-type/material/v/1` unless stated.

| `entityId`                                                                                                                         | UUID                                   |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `"M-0001"`                                                                                                                         | `fdb92954-9bd5-5558-ae43-40437c693f27` |
| `1` (number)                                                                                                                       | `2f37a211-5787-5474-83b3-e3d7cf6bb83a` |
| `1.5` (number)                                                                                                                     | `42a6299f-2d8d-5b73-b11f-64badff46a94` |
| `"Grüße-仓库"`                                                                                                                     | `5aec7f53-3989-5d44-ace4-a78b860193a5` |
| `"a::b"`                                                                                                                           | `b0ed6b55-ea24-512b-97fe-e17e1c7f6861` |
| `"A\|B"`                                                                                                                           | `1ecf2406-4eba-5b0e-93f2-1a08389594d7` |
| `""`                                                                                                                               | `54b1ee67-5978-54fd-81ca-18d4ed3cdb2e` |
| type `…/stored-at/v/1`, ID `https://x/@t/types/entity-type/material/v/1::M-0001::https://x/@t/types/entity-type/plant/v/1::P-0100` | `25bbb6e3-3e0a-53c2-a2f3-b8b83f7ff314` |

The composite ID is `web-fixture~{uuid}`.

**Hash inputs** (`tests/golden/fallback-hash.json`). Table `fallback_fixture` with columns `MATNR VARCHAR, MAKTX VARCHAR, BRGEW DOUBLE, ERSDA DATE, META JSON` plus the three meta columns. Struct hash SQL: `md5(struct_pack(p0 := "ERSDA", p1 := NULLIF(TRIM("MAKTX"), ''), p2 := "BRGEW")::VARCHAR)`. The input strings below are recomputed: the md5 of each string equals the expected hash in the file.

| Row | `MAKTX`, `BRGEW`, `ERSDA`, `META`              | Struct hash input                                       | Struct hash                        | Whole-row input                                                                              | Whole-row hash                     |
| --- | ---------------------------------------------- | ------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| M1  | `'  padded  '`, `1.5`, `2026-01-02`, `{"a":1}` | `{'p0': 2026-01-02, 'p1': padded, 'p2': 1.5}`           | `9527f1d39d6dcf3f63f0a369a91027a6` | `{'MATNR': M1, 'MAKTX': '  padded  ', 'BRGEW': 1.5, 'ERSDA': 2026-01-02, 'META': '{"a":1}'}` | `e2b21ca6379bd7c0720c249615df3f71` |
| M2  | `''`, NULL, NULL, NULL                         | `{'p0': NULL, 'p1': NULL, 'p2': NULL}`                  | `e8bca8a3b3d677138e2b9bc17933dfa3` | `{'MATNR': M2, 'MAKTX': '', 'BRGEW': NULL, 'ERSDA': NULL, 'META': NULL}`                     | `a30f26690878fabccf8cafcbad9828c4` |
| M3  | NULL, `2`, `1999-12-31`, `{"b":[1,2]}`         | `{'p0': 1999-12-31, 'p1': NULL, 'p2': 2.0}`             | `b9bf8f6715b46c4b4bf382975a743190` | `{'MATNR': M3, 'MAKTX': NULL, 'BRGEW': 2.0, 'ERSDA': 1999-12-31, 'META': '{"b":[1,2]}'}`     | `82cab6ac76e6797a2fb1ad05658e5305` |
| M4  | `'NULL'`, `0.1`, `2026-01-02`, `{}`            | `{'p0': 2026-01-02, 'p1': 'NULL', 'p2': 0.1}`           | `0a5f9546b1dc7159d4f60e1cf0428271` | `{'MATNR': M4, 'MAKTX': 'NULL', 'BRGEW': 0.1, 'ERSDA': 2026-01-02, 'META': '{}'}`            | `50cf43d88cb9216e6900ca5a06039d5b` |
| M5  | `'Grüße, '仓库'::x'`, `-3.25`, NULL, NULL      | `{'p0': NULL, 'p1': 'Grüße, \'仓库\'::x', 'p2': -3.25}` | `f3594de37157d7c71e5e450c5ae09119` | `{'MATNR': M5, 'MAKTX': 'Grüße, \'仓库\'::x', 'BRGEW': -3.25, 'ERSDA': NULL, 'META': NULL}`  | `0f315043706fa6df46c89514c35359ca` |

The rows show the rules: `'  padded  '` is trimmed in the struct hash and kept in the whole-row hash; `''` hashes like NULL in the struct hash and differently in the whole-row hash; the string `'NULL'` differs from NULL because DuckDB quotes it; a float `2` prints as `2.0`.

**Config hash inputs** (`tests/golden/config-hash.json`). Recomputed: the sha256 of each string equals the expected value.

1. `{"entityType":"https://x/@t/types/entity-type/material/v/1","entityId":"MATNR","namespace":"conn-a","properties":[["https://x/@t/types/property-type/created/v/1","ERSDA"],["https://x/@t/types/property-type/name/v/1","MAKTX"],["https://x/@t/types/property-type/weight/v/1","BRGEW"]],"propertyFields":[],"provenanceFields":{"authors":null,"firstPublished":null,"lastUpdated":null},"provenance":null}` gives `5f5f9bfb881c8f2637fb37cfc5a3b02e6f8308cc5a4fd458d0b512892f3bede9`.
2. With `idNamespace: custom-ns`, one property, `authors: ERNAM`, `lastUpdated: AEDAT`: `{"entityType":"https://x/@t/types/entity-type/material/v/1","entityId":"MATNR","namespace":"custom-ns","properties":[["https://x/@t/types/property-type/name/v/1","MAKTX"]],"propertyFields":[],"provenanceFields":{"authors":"ERNAM","firstPublished":null,"lastUpdated":"AEDAT"},"provenance":null}` gives `8b2b55a113771f3db7f802794d2f3d2808e8261f412a8b0ad2232d1facb50f76`.
3. With a function accessor: the `properties` entry is `["https://x/@t/types/property-type/name/v/1","fn:data=>`${data.MAKTX}`"]` and the hash is `3ea886e128a069b8c392acfe470f3c455d310946b6fe820e62cb94b143a2b318`.

The golden test builds the sink with `property_fields: vec![]` (`tests/golden_test.rs:224`). A sink built from a definition has one `property_fields` entry per property (`src/definition.rs:992-999`), so its hash differs from these vectors.

**Request JSON** (`tests/golden/graph-delivery-v1.json`). Entity: namespace `connector`, type `https://example.com/types/entity-type/item/v/1`, source ID `A-1`, property `https://example.com/types/property-type/name/v/1` = `Widget`, web `00000000-0000-4000-8000-000000000001`, location `fixture`, load time `2026-07-22T10:00:00Z`, no per-property provenance (`src/graph/planner.rs:1033-1054`).

- Entity UUID `6ca9cc88-4fa6-5acf-bf59-eb22a504b891`.
- Create: `{"webId":"00000000-0000-4000-8000-000000000001","entityTypeIds":["https://example.com/types/entity-type/item/v/1"],"properties":{"value":{"https://example.com/types/property-type/name/":{"value":"Widget","metadata":{"dataTypeId":null}}}},"draft":false,"provenance":{"actorType":"machine","origin":{"type":"api"},"sources":[{"type":"integration","location":{"name":"fixture"},"loadedAt":"2026-07-22T10:00:00Z"}]},"entityUuid":"6ca9cc88-4fa6-5acf-bf59-eb22a504b891","readOnly":true}`
- Patch: `{"entityId":"00000000-0000-4000-8000-000000000001~6ca9cc88-4fa6-5acf-bf59-eb22a504b891","provenance":{…same…},"archived":false,"entityTypeIds":["https://example.com/types/entity-type/item/v/1"],"properties":[{"op":"add","path":["https://example.com/types/property-type/name/"],"property":{"value":"Widget","metadata":{"dataTypeId":null}}}]}`
- Archive: `{"entityId":"00000000-0000-4000-8000-000000000001~6ca9cc88-4fa6-5acf-bf59-eb22a504b891","provenance":{…same…},"archived":true}`

Link: type `https://example.com/types/entity-type/related/v/1`, from `A-1` to `B-1`, both of the item type, no properties (`src/graph/planner.rs:1056-1075`).

- Link UUID `f81f487f-1011-583c-9bbc-c11d82d8e58e`; right endpoint UUID `3a060105-8b02-5108-956e-fe52d3909e45`.
- Create: `{"webId":"…0001","entityTypeIds":["https://example.com/types/entity-type/related/v/1"],"properties":{"value":{}},"draft":false,"provenance":{…},"entityUuid":"f81f487f-1011-583c-9bbc-c11d82d8e58e","linkData":{"leftEntityId":"…0001~6ca9cc88-4fa6-5acf-bf59-eb22a504b891","rightEntityId":"…0001~3a060105-8b02-5108-956e-fe52d3909e45"},"readOnly":true}`
- Patch: `{"entityId":"…0001~f81f487f-1011-583c-9bbc-c11d82d8e58e","provenance":{…},"archived":false}`
- Archive: `{"entityId":"…0001~f81f487f-1011-583c-9bbc-c11d82d8e58e","provenance":{…},"archived":true}`

Under P7 the patch bodies change, and under D7 and P14 the provenance changes. The create bodies, the UUIDs and the archive bodies can be ported as they are.

### `tests/golden_test.rs`

| Line   | Test                                                  | Sets up and asserts                                                                     | Fixture                | Maps to             |
| ------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------- | ------------------- |
| `:42`  | `routing_matches_the_internal_v1_contract`            | Shard routing and key paths.                                                            | `routing.json`         | Out of scope        |
| `:137` | `uuids_match_the_ts_engine`                           | `deterministic_uuid` and `composite_entity_id` for eight cases.                         | `uuids.json`           | Step 3              |
| `:153` | `key_sql_matches_the_ts_engine`                       | `snapshot::key_expr` for two keys.                                                      | `key-sql.json`         | Stage 1             |
| `:236` | `canonical_hash_sql_matches_the_ts_engine`            | `canonical_hash_expr` returns the expected SQL, or `None` for a function accessor.      | `hash-sql.json`        | Step 3              |
| `:259` | `sink_config_hashes_match_the_ts_engine`              | `sink_config_hash` for three configs.                                                   | `config-hash.json`     | Step 3, config hash |
| `:274` | `link_op_ids_match_the_ts_engine`                     | `link_op_id` strings.                                                                   | `op-ids.json`          | Leave behind (dead) |
| `:292` | `pending_payload_wire_shape_decodes`                  | `decode_link_op` reads the payload.                                                     | `pending-payload.json` | Leave behind (dead) |
| `:301` | `fallback_and_canonical_hashes_match_value_for_value` | Creates the fixture table in DuckDB, runs both hash queries, compares five hashes each. | `fallback-hash.json`   | Step 3              |

### `tests/worker_e2e_test.rs`

All four start the real worker against a mock Graph.

| Line   | Test                                                                                  | Sets up and asserts                                                                                                                                                                                                    | Maps to                                                                                          |
| ------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `:65`  | `retry_reads_rotated_credentials_and_reuses_completed_captures`                       | Two REST endpoints with a bearer secret. `/first` answers once. `/second` answers 503, then requires the rotated token. Asserts the run completes on attempt 2, `/first` was read exactly once and `/second` twice.    | Stage 1: a rerun of capture reuses finished captures. S1.                                        |
| `:163` | `v1_submission_recovers_plans_delivers_and_completes_without_process_local_authority` | `orders_definition("worker-e2e", "SELECT 'one' AS id, 'Order one' AS name")`. Asserts exactly one `POST /entities`, completion on attempt 1. Expected entity UUID, recomputed: `0263c3e2-6ff5-577b-850d-75e14b605165`. | S1, end to end                                                                                   |
| `:214` | `fresh_worker_delivers_a_new_run_after_recovering_a_completed_one`                    | Run 1 with name `Order round 0`, the worker is killed, run 2 with `Order round 1` on a second worker. The mock answers 200 to every create.                                                                            | Out of scope (lease takeover). The data is S2, but the mock does not check create against patch. |
| `:314` | `second_submission_after_completion_starts_and_completes_a_new_run`                   | The same two definitions on one worker. Asserts the second submission gets a new run ID and completes.                                                                                                                 | Out of scope (admission). Data as S2.                                                            |

### `tests/crash_replay_test.rs`

| Line   | Test                                                                             | Sets up and asserts                                                                                                                                                                                       | Maps to                                                                          |
| ------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `:62`  | `process_death_mid_delivery_resumes_at_the_durable_cursor_on_a_fresh_machine`    | Two rows, a budget of 2 requests per turn, the mock answers the first create and stalls the second. The worker is killed and a second worker finishes. Asserts the first entity's body is not sent again. | Out of scope (cursor). It asserts the opposite of D8, which resends every batch. |
| `:154` | `a_restarted_owner_reclaims_its_unexpired_lease_in_seconds_not_a_lease_duration` | The same setup with a fixed runner ID. Asserts recovery in under 25 s.                                                                                                                                    | Out of scope                                                                     |
| `:245` | `lost_create_ack_converges_through_429_retry_conflict_and_patch`                 | One row. The mock answers the create with 429 and `Retry-After: 1`, the next create with 409, and the patch with 200. Asserts two creates at least 1 s apart and exactly one patch.                       | Stage 4. S7: an entity that exists is reached through create, 409, patch.        |
| `:303` | `cancellation_before_acceptance_promotes_the_exact_submission`                   | Cancels before a worker exists. Asserts the run ends with attempt 0.                                                                                                                                      | Out of scope                                                                     |
| `:339` | `deterministic_planning_failure_consumes_the_durable_handler_budget`             | SQL reads a table that does not exist. Asserts the run ends as failed with a failure code and that the Graph got no request.                                                                              | Mostly out of scope. The in-scope part: a failure in stage 1 or 2 sends nothing. |

### Other files in `tests`

| File and line                                                          | Test                                                                                                                                                                                                                                                                                                                                                                                                           | What it covers                                                                                                                                                                                                                                               | Maps to                                                                      |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `tests/disk_bounds_test.rs:37`                                         | `lifecycle_load_stays_inside_disk_bounds_and_releases_the_workspace`                                                                                                                                                                                                                                                                                                                                           | 500 rows from `SELECT 'id-' \|\| range AS id, 'Order ' \|\| range AS name FROM range(500)`. Asserts workspace, staging and cache stay under 256 MiB and the workspace is removed.                                                                            | Out of scope (disk budgets)                                                  |
| `tests/activation_test.rs:158`, `:176`, `:195`, `:219`, `:235`, `:283` | `invalid_worker_arguments_fail_before_persistent_operations`, `invalid_configuration_fails_before_any_baseline_write_or_graph_request`, `attestation_failures_precede_baseline_creation_and_graph_contact`, `markerless_non_empty_prefix_fails_closed_and_deletes_nothing`, `successful_activation_creates_one_canonical_baseline_and_mutates_nothing`, `concurrent_first_activation_adopts_the_same_baseline` | Worker start-up checks.                                                                                                                                                                                                                                      | Out of scope                                                                 |
| `tests/multi_runner_test.rs:37`                                        | `four_capped_runners_split_three_shards_with_one_owner_each`                                                                                                                                                                                                                                                                                                                                                   | Shard ownership.                                                                                                                                                                                                                                             | Out of scope                                                                 |
| `tests/operator_commands_test.rs:21`                                   | `baseline_cli_status_cancel_and_verify_use_the_v1_surface`                                                                                                                                                                                                                                                                                                                                                     | Command line.                                                                                                                                                                                                                                                | Out of scope                                                                 |
| `tests/s3_contract_test.rs:36`, `:128`, `:173`, `:377`, `:621`         | `real_s3_throughput_probe`, `real_s3_provider_contract`, `real_s3_artifact_page_throughput`, `fencing_probe_reports_fencing_on_the_local_backend`, `crash_mid_multipart_upload_helper`                                                                                                                                                                                                                         | Object storage behaviour, most of them opt-in against real S3. The helper `conditional_put_contract` (`:432-481`) checks writing only if absent.                                                                                                             | Out of scope. `conditional_put_contract` is relevant reading for P10 and D9. |
| `tests/hash_graph_vault_contract_test.rs:9`                            | `real_hash_graph_vault_secret_read`                                                                                                                                                                                                                                                                                                                                                                            | Opt-in secret read.                                                                                                                                                                                                                                          | Out of scope                                                                 |
| `tests/graph_contract_test.rs:63`                                      | `real_graph_write_throughput_probe`                                                                                                                                                                                                                                                                                                                                                                            | Opt-in. Sends `INTEGRATIONS_GRAPH_CONTRACT_ROWS` (default 5,000) creates to `/entities/bulk` in batches of 128 with 16 at once and prints the rate.                                                                                                          | Stage 4, measurement only                                                    |
| `tests/graph_contract_test.rs:156`                                     | `real_graph_delivery_contract`                                                                                                                                                                                                                                                                                                                                                                                 | Opt-in against a real Graph. Round 0 creates rows `contract-{n}`. Round 1 changes the name of the same IDs. Asserts each round completes on attempt 1.                                                                                                       | S1 then S2 against a real Graph                                              |
| `tests/graph_chaos_test.rs:144`                                        | `real_graph_delivery_converges_under_injected_throttling_and_failures`                                                                                                                                                                                                                                                                                                                                         | Opt-in. A proxy answers every first mutation with 429 and `Retry-After: 1`, every second with 500, and forwards every third. Two rounds on the ID `chaos-one`. Asserts at least one throttle, one failure and two forwarded writes, each round on attempt 1. | Stage 4 retry. S2.                                                           |

### Inline tests, stage 1

| File and line                           | Test                                                             | Sets up and asserts                                                                                                                                                                                                                    | Maps to                                                 |
| --------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `src/connectors/rest_api.rs:621`        | `unresolved_reference_cannot_send_a_request`                     | An endpoint with `secretEntityUuid` and no resolved auth. Asserts an error and that the fetcher is never called.                                                                                                                       | Stage 1                                                 |
| `src/connectors/rest_api.rs:649`        | `referenced_auth_rejects_inline_values_and_invalid_fields`       | Four bad auth objects: bad UUID, extra `token`, header name with a newline, unknown type. All are errors.                                                                                                                              | Stage 1                                                 |
| `src/connectors/rest_api.rs:662`        | `resolved_auth_is_redacted_and_never_interpolated`               | Secret `{"value":"literal-${TOKEN}"}`. Asserts the header is `literal-${TOKEN}` or `Bearer literal-${TOKEN}`, the `Debug` text holds no secret, and a secret with `\r\n` or the wrong field is rejected without its text in the error. | Stage 1                                                 |
| `src/connectors/rest_api.rs:700`        | `oversized_time_offsets_do_not_panic`                            | `NOW+9223372036854775807d` and three more give no value. `NOW-5m` gives a value.                                                                                                                                                       | Stage 1                                                 |
| `src/connectors/rest_api.rs:716`        | `next_links_stay_on_the_endpoint_origin`                         | `/v1/items?page=2` resolves to `https://api.example/v1/items?page=2`. Another host and `http` on the same host are errors.                                                                                                             | Stage 1                                                 |
| `src/connectors/postgres.rs:257`        | `malformed_credentials_do_not_appear_in_errors`                  | A numeric password and an extra field. Asserts the error holds neither `987654321` nor `secret-sentinel`.                                                                                                                              | Stage 1                                                 |
| `src/connectors/postgres.rs:280`        | `quotes_libpq_credentials`                                       | Expects `host='127.0.0.1' port='15439' dbname='dev' user='reader' password='pa\'ss\\word' sslmode='require'`.                                                                                                                          | Stage 1                                                 |
| `src/connectors/postgres.rs:290`        | `capture_statement_uses_quoted_identifiers`                      | Expects `COPY (SELECT * FROM "_capture"."integration demo"."orders") TO '/tmp/capture.parquet' (FORMAT PARQUET)`.                                                                                                                      | Stage 1                                                 |
| `src/orchestrator/run_artifacts.rs:250` | `source_identity_is_durable_and_recovery_never_recaptures_it`    | Publishes `first source bytes` for `orders`, then publishes `changed live source` for the same source and run. Asserts the second call returns the first reference and the first bytes. A second source `materials` binds separately.  | Stage 1, P10. Uses the journal.                         |
| `src/orchestrator/planning.rs:436`      | `accepted_input_becomes_a_remote_candidate_without_graph_access` | An `external` Parquet source with one row `('one', 'Order one')`. Asserts 1 planned object, 1 write, 1 capture reference, a stored snapshot, and that the workspace directory is removed.                                              | S1, stages 1 to 3. Uses the journal.                    |
| `src/http/retry.rs:62`                  | `retry_after_seconds_cap_never_overflows`                        | `cap_seconds_ms(5) = 5000`; `60`, `u64::MAX` and `18446744073709552` give `30000`.                                                                                                                                                     | Stage 1 and stage 4                                     |
| `src/http/pacer.rs:62`                  | `spaces_same_host_leaves_other_hosts_unblocked`                  | Three calls at 50 ms spacing take at least 100 ms. Another host waits under 40 ms.                                                                                                                                                     | Stage 1                                                 |
| `src/engine/batch_sync.rs:865`          | `retry_uses_admitted_bronze_instead_of_changed_live_source`      | Dead path. Captures `SELECT 1 AS id, 'original' AS value`, then captures again with changed SQL. Asserts the value is still `original` and the load time is the first one.                                                             | Stage 1 rule, dead code. Port the case, leave the code. |
| `src/engine/batch_sync.rs:952`          | `retry_reads_the_run_pinned_checkpoint_not_the_moved_head`       | Dead path.                                                                                                                                                                                                                             | Leave behind                                            |

### Inline tests, stage 2

| File and line                     | Test                                                                     | Sets up and asserts                                                                                                                                                                                                                                                                                                                    | Maps to                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/engine/candidate.rs:609`     | `exact_capture_plans_without_graph_and_reuses_candidate_state`           | One sink, one capture row `id='one', name='Order one'`, connector `candidate`, load time `2026-07-23T00:00:00Z`. First plan: coverage `Complete`, 1 object, 1 write, 1 row in `_state/sync/candidate/orders-sink`. Second plan on the same store: 1 object, 0 writes. Entity UUID, recomputed: `a3df99db-4b46-582a-b906-27d1a51997bc`. | S1, then a run with no change                                                                      |
| `src/engine/candidate.rs:683`     | `empty_source_still_materializes_its_checkpoint`                         | An empty capture and a pipeline with only a checkpoint step `orders`. Asserts `_checkpoint/orders` exists with 0 rows.                                                                                                                                                                                                                 | Step 2. This is the behaviour behind Part D item 4.                                                |
| `src/value.rs:83`                 | `js_string_parity`                                                       | `"x"` gives `x`; `7` gives `7`; `1.0` gives `1`; `1.5` gives `1.5`; null gives `null`; `true` gives `true`.                                                                                                                                                                                                                            | Step 3                                                                                             |
| `src/value.rs:93`                 | `typed_values_round_trip`                                                | Wraps `1.5` with `https://x/dt/kg/v/1` and unwraps it.                                                                                                                                                                                                                                                                                 | Stage 3                                                                                            |
| `src/graph/sink.rs:1129`          | `stale_sink_config_invalidates_previous_row_hashes`                      | State row `('1', 'old-hash')` and no meta row. After `migrate_meta` the hash is NULL.                                                                                                                                                                                                                                                  | Step 4. Changed config: every row is sent once.                                                    |
| `src/graph/sink.rs:1221`          | `extracted_plan_matches_reference_effects_and_resulting_state_bytes`     | See the fixture below. Asserts the counts `(inserts, updates, deletes, unchanged) = (1, 1, 1, 1)` for the dead and the live path, the same writes in the same order, equal bodies, and equal state tables. A second plan with `ForceAll` gives `unchanged = 3` and 3 entity upserts.                                                   | S1 (seed), S2, S3, and S9 for `ForceAll`                                                           |
| `src/graph/sink.rs:1387`          | `sibling_engine_golden_state_is_adopted_without_reupserts_or_byte_drift` | Loads the five rows and the five struct hashes of `fallback-hash.json` as state, with a current meta row. Plans with the same rows. Asserts 0 writes, `unchanged = 5`, and an unchanged state table.                                                                                                                                   | Step 4: equal hashes send nothing                                                                  |
| `src/graph/sink.rs:1083`          | `acknowledged_counts_exclude_uncommitted_candidates`                     | Dead function.                                                                                                                                                                                                                                                                                                                         | Leave behind                                                                                       |
| `src/graph/sink.rs:1163`          | `numeric_graph_ids_advance_the_duckdb_resume_anchor`                     | Dead path. Input `(id DOUBLE, name VARCHAR)` with `(1.0, 'one')`. Asserts the state key is `'1.0'` while the client reports `'1'`, and that a second run resends nothing.                                                                                                                                                              | Evidence for Part D item 1. Port as a case for A2: the ID of a `DOUBLE` `1.0` is derived from `1`. |
| `src/graph/link_pipeline.rs:1147` | `extracted_link_plan_matches_reference_effects_and_state_bytes`          | See the fixture below. Asserts 2 upserts and 1 archive on the dead path, `(upserts, archives, unchanged) = (2, 1, 1)` on the live path, the same writes and equal state. `ForceAll` gives `unchanged = 3` and 3 link upserts.                                                                                                          | S2 and S3 for links, S9 for `ForceAll`                                                             |

Fixture of `src/graph/sink.rs:1221` (`parity_store`, `:1049-1080`):

- Sink: type `https://example.com/types/entity-type/item/v/1`, `entityId` column `id`, web `00000000-0000-4000-8000-000000000001`, namespace `connector`, property `https://example.com/types/property-type/name/v/1` from `name`. Location `fixture`, load time `2026-07-22T10:00:00Z`.
- Committed rows: `('A','old')`, `('B','same')`, `('C','removed')`. New rows: `('A','changed')`, `('B','same')`, `('D','new')`.
- Expected labels: A `update`, B `unchanged`, C `delete`, D `insert`.
- Hash SQL for this sink: `md5(struct_pack(p0 := NULLIF(TRIM("name"), ''))::VARCHAR)`.
- Entity UUIDs, recomputed: A `d48901ec-1ab1-5604-aeff-b4b6130759bb`, B `95691c6f-3a03-55d3-b825-65f0fe19c1b0`, C `21fa507c-c0f0-551c-993e-df4da8fa3ca4`, D `c770ab7c-181b-5763-80c7-93e98eb7e19e`.
- Hash values, derived from the rendering that `fallback-hash.json` confirms for unquoted words and not run in DuckDB: `{'p0': old}` gives `d66cd6545e557ed4eb06934111b9e27a`; `{'p0': same}` gives `3bef226d378d7c2d3bf7d1920580eb17`; `{'p0': removed}` gives `2990d159820eea4219b25066d332acb0`; `{'p0': changed}` gives `ca21b18d01e6004304f8a7baab8aa872`; `{'p0': new}` gives `160a2cf5a07c20a2b0202ece5f90a48e`.
- Expected order of writes: upsert D, upsert A, archive C. The test sorts by `(operation order, web~uuid)` (`:1342-1345`), and `c770…` sorts before `d489…`.

Fixture of `src/graph/link_pipeline.rs:1147` (`entry`, `:1073-1097`; `parity_store`, `:1107-1135`):

- Link pipeline `relations`: link type `https://example.com/types/entity-type/related/v/1`, from and to of type `https://example.com/types/entity-type/item/v/1` in columns `source_id` and `target_id`, property `https://example.com/types/property-type/label/v/1` from `label`, namespace `connector`.
- Committed pairs: `('A','B','old')`, `('B','C','same')`, `('C','D','removed')`. New pairs: `('A','B','changed')`, `('B','C','same')`, `('D','E','new')`.
- Expected labels: A→B `update`, B→C `unchanged`, C→D `delete`, D→E `insert`.
- Link UUIDs, recomputed: A→B `b421b0a5-82fb-5994-90d2-248c636ba012`, B→C `7131b5e3-ac22-52b1-8b83-b195c745affe`, C→D `687503aa-0416-5a9a-90bc-0fb7b49c61a9`, D→E `89fb641b-f910-5a03-98ff-c0a3c3886aad`. Endpoint E: `ac556133-9a68-57f5-90d3-9a5be15f9498`.

### Inline tests, stage 3

| File and line                                      | Test                                                                                                                                                                                                                           | Sets up and asserts                                                                                                                                                                                                                         | Maps to                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `src/coerce.rs:244`                                | `date_shapes`                                                                                                                                                                                                                  | `2024-01-15`, `2024-01-15T10:00:00Z`, `15.01.2024`, `15/01/2024`, `20240115` and `  2024-01-15  ` all give `2024-01-15`. `01/15/2024` gives `2024-15-01`. `00000000`, `00.01.2024`, `15.01.0000`, the empty string and `garbage` give none. | Stage 3                                      |
| `src/coerce.rs:283`                                | `time_shapes`                                                                                                                                                                                                                  | `101530` and `10:15:30` give `10:15:30+00:00`. `10:15:30.5` gives `10:15:30.5+00:00`. `10:15:30+02:00` is unchanged. `000000` and the empty string give none.                                                                               | Stage 3                                      |
| `src/coerce.rs:305`                                | `number_shapes_including_eu`                                                                                                                                                                                                   | `1,5` gives `1.5`; `1.234,56` gives `1234.56`; `1.234.567,89` gives `1234567.89`; `1,234.56` gives none; `42` gives `42`; `-1.5e3` gives `-1500.0`; `2` gives `2`; the empty string and `x` give none.                                      | Stage 3                                      |
| `src/coerce.rs:323`                                | `boolean_and_integer_and_year`                                                                                                                                                                                                 | `X`, `true`, `1`, `YES`, `y` are true. `0` is false. `integer("2.9") = 2`. `year("2024") = 2024`. `trim("  x ") = "x"`.                                                                                                                     | Stage 3                                      |
| `src/coerce.rs:336`                                | `measure_tags_with_data_type`                                                                                                                                                                                                  | Map `{"KG": "https://x/dt/kg/v/1", "*": "https://x/dt/unit/v/1"}`. Amount `1,5` with `KG` gives value `1.5` and the KG type. Amount `2` with `ZZ` gives the `*` type.                                                                       | Stage 3                                      |
| `src/graph/planner.rs:1129`                        | `planning_is_graph_client_free_and_preserves_delivery_request_bytes`                                                                                                                                                           | Plans one entity and one link with a client that panics when called. Asserts the stored create, patch and archive bodies equal the builder outputs and the client was never called.                                                         | Stage 3                                      |
| `src/graph/planner.rs:1263`                        | `plan_finishes_in_dependency_order_and_binds_the_same_effect_set`                                                                                                                                                              | Adds a link upsert, an entity upsert and an entity archive in that order. Asserts the order entity upsert, link upsert, entity archive.                                                                                                     | Stage 3 order of writes                      |
| `src/graph/planner.rs:1527`                        | `merged_force_plan_has_one_dependency_order_for_entities_and_links`                                                                                                                                                            | One of each operation under `ForceAll`. Asserts the order `UpsertEntity, UpsertLink, ArchiveLink, ArchiveEntity`.                                                                                                                           | Stage 3 order of writes, S9                  |
| `src/graph/planner.rs:1597`                        | `exact_entity_and_link_delivery_bytes_match_independent_golden`                                                                                                                                                                | Compares the stored payload bytes of the entity and the link with `graph-delivery-v1.json`.                                                                                                                                                 | Stage 3. Expected JSON above.                |
| `src/graph/planner.rs:1579`                        | `codec_rejects_forged_identity_and_nested_wrapper_drift`                                                                                                                                                                       | A changed identity and an unknown field are rejected.                                                                                                                                                                                       | Leave behind (payload codec)                 |
| `src/graph/client.rs:1061`                         | `propertyless_link_patch_only_revives_like_typescript`                                                                                                                                                                         | A link with `properties: None`. Asserts `archived` is `false` and that `properties` and `entityTypeIds` are absent.                                                                                                                         | Stage 3                                      |
| `src/graph/client.rs:1080`                         | `all_null_link_properties_do_not_emit_an_empty_patch_array`                                                                                                                                                                    | A link whose only property is null. Asserts `properties` is absent.                                                                                                                                                                         | Stage 3. Under P7 the expected body changes. |
| `src/graph/effects.rs:419`                         | `operation_order_is_dependency_safe`                                                                                                                                                                                           | `UpsertEntity < UpsertLink < ArchiveLink < ArchiveEntity`.                                                                                                                                                                                  | Stage 3 order of writes                      |
| `src/graph/effects.rs:426`, `:440`, `:458`, `:487` | `provider_metadata_and_slice_location_do_not_change_effect_identity`, `invalid_payload_pair_range_and_forged_identity_fail_closed`, `codec_rejects_unknown_versions_and_fields`, `wire_and_identity_match_independent_goldens` | Effect records and their IDs.                                                                                                                                                                                                               | Leave behind (effect index)                  |

Tests of the stored projection in `src/graph/planner.rs`. The code is left behind, and the cases describe behaviour the new diff must give:

| Line    | Test                                                                          | Sets up and asserts                                                                                                                                                                            | Maps to                                                                     |
| ------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `:1393` | `changes_only_reuses_applied_bytes_and_retains_archive_tombstones`            | Applied: one live entity and one archived entity. The plan holds the same entity with load time `2099-01-01T00:00:00Z`, marked unchanged. Asserts 0 writes, 2 objects, and the old bytes kept. | An unchanged row sends nothing; an archived entity stays in the hash table. |
| `:1440` | `exact_adoption_suppresses_stale_hint_but_real_change_is_emitted`             | The same bytes marked changed give 0 writes. A changed property value gives 1 entity upsert.                                                                                                   | S2                                                                          |
| `:1470` | `initialization_is_the_only_mode_that_adopts_an_object_missing_from_a`        | A new object marked unchanged: `ChangesOnly` gives 1 write, `InitializeFromExistingState` gives 0.                                                                                             | S1                                                                          |
| `:1493` | `complete_plan_archives_missing_live_objects_while_partial_plan_carries_them` | Applied: one live entity. An empty plan with `Complete` gives 1 `ArchiveEntity`. With `Partial` it gives 0 writes and the entity stays live.                                                   | S3; D6 for the partial case                                                 |
| `:1294` | `restore_force_applies_a_and_archives_only_g_identities_in_dependency_order`  | A: entity live. G: the same entity archived, and a link. Asserts 2 writes: upsert the entity with A's bytes, then archive the link.                                                            | S8                                                                          |
| `:1333` | `restore_to_initial_empty_archives_every_contaminated_identity`               | A empty. G: one entity and one link. Asserts `ArchiveLink` then `ArchiveEntity`.                                                                                                               | S8, restore to empty (P12)                                                  |
| `:1363` | `reconcile_force_applies_every_live_and_archived_object_in_dependency_order`  | One live entity and one archived link. Asserts `UpsertEntity` then `ArchiveLink`.                                                                                                              | S9                                                                          |

### Inline tests, stage 4

Tests of the HTTP client, `src/graph/client.rs`:

| Line    | Test                                                                          | Sets up and asserts                                                                                                                      | Maps to                                                                          |
| ------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `:824`  | `effect_transport_returns_create_409_without_hiding_the_patch_cost`           | The create is answered 409. Asserts the transport returns the 409 and sends no patch.                                                    | Stage 4                                                                          |
| `:852`  | `durable_effect_transport_authenticates_the_service_and_uses_the_run_owner`   | Asserts `x-authenticated-user-actor-id: run-owner` and `authorization: HASH-Service service-secret` on `/entities` and `/entities/bulk`. | Stage 4, overview D4                                                             |
| `:902`  | `effect_transport_exposes_one_429_and_capped_retry_after_to_the_budget_owner` | 429 with `retry-after: 999999`. Asserts one request and a delay of 30 s.                                                                 | Stage 4                                                                          |
| `:931`  | `authoritative_409_conflict_falls_back_from_create_to_patch`                  | Dead function. Create 409 then patch 200.                                                                                                | Stage 4 rule, dead code                                                          |
| `:953`  | `replay_after_lost_create_ack_converges_through_same_uuid_and_patch`          | Dead function. The create and patch bodies of one entity carry the same UUID. The first upsert creates; the second gets 409 and patches. | S7                                                                               |
| `:1012` | `duplicate_words_in_a_non_409_error_do_not_imply_conflict`                    | Dead function. A 500 with the body `duplicate key` is an error with status 500.                                                          | The live path does the opposite for creates (`src/graph/executor.rs:1741-1747`). |
| `:1029` | `per_op_fallback_commits_successes_in_sixteen_row_slices`                     | Dead function.                                                                                                                           | Leave behind                                                                     |

Tests of the executor, `src/graph/executor.rs`. Fixtures: `upsert(n)` and `archive(n)` build writes with identity `entity:{n}` (`:2247-2295`). The transports are scripted (`:1851-2116`).

| Line             | Test                                                                                                                                   | Scripted responses and asserted result                                                                                                                                    | Maps to                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `:1817`          | `duplicate_key_bodies_prove_conflict_only_for_create_requests`                                                                         | 500 with `duplicate key value violates unique constraint` or `ALREADY_EXISTS` is a conflict for a create and retryable otherwise. 500 with `internal error` is retryable. | Stage 4 classification                                           |
| `:2494`          | `create_409_patch_consumes_two_requests_and_commits_only_that_prefix`                                                                  | Create 409, patch 200, budget 2. One write done, 2 requests, both sent as `actor:owner`.                                                                                  | Stage 4, S2                                                      |
| `:2540`          | `a_proven_conflict_retries_patch_first_instead_of_recreating`                                                                          | Create 409, patch 429, patch 200. Requests: create, patch, patch.                                                                                                         | Stage 4                                                          |
| `:2583`          | `retry_never_starts_when_the_worst_case_upsert_no_longer_fits`                                                                         | Create 503 with a 3 s wait, budget 2. 1 request, nothing done, the 3 s is returned.                                                                                       | Budget, out of scope; the 503 rule is stage 4                    |
| `:2615`          | `graph_429_is_counted_from_the_existing_response_without_a_probe`                                                                      | Create 429 with the body `secret response body`. The counter is 1 and the telemetry JSON does not hold the body.                                                          | Stage 4 logging rule                                             |
| `:2644`          | `transport_failure_yields_with_default_backoff_instead_of_hot_looping`                                                                 | A transport failure, budget 2. 1 request, a wait above zero is returned.                                                                                                  | Stage 4                                                          |
| `:2671`          | `duplicate_words_in_a_non_409_response_never_trigger_patch`                                                                            | Create 400 with the body `duplicate conflict 409`. Permanent failure with status 400, 1 request.                                                                          | S6                                                               |
| `:2703`          | `retry_consumes_budget_then_converges_through_create_409_patch`                                                                        | Create 500 with a 7 ms wait, create 409, patch 200, budget 4. Done with 3 requests; the recorded wait is 7 ms.                                                            | S7                                                               |
| `:2744`          | `permanent_failure_commits_the_prior_contiguous_prefix_first`                                                                          | Archive 200, then create 400 with a 2,000-byte body. 1 write done, status 400, the diagnostic holds `2000 bytes` and `sha256` and no body text.                           | S6                                                               |
| `:2786`          | `recovery_resumes_strictly_after_the_durable_exclusive_cursor`                                                                         | Two archives, cursor at 1. Only `entity:2` is sent.                                                                                                                       | Out of scope (cursor)                                            |
| `:2817`          | `replayed_archive_conflict_converges_instead_of_failing_permanently`                                                                   | Archive 409. Done with 1 request.                                                                                                                                         | Stage 4, S7                                                      |
| `:2852`          | `failed_cursor_commit_leaves_the_effect_replayable`                                                                                    | The cursor write fails; a second executor sends the archive again.                                                                                                        | Out of scope (cursor)                                            |
| `:2884`, `:2917` | `ownership_loss_between_create_conflict_and_patch_stops_the_patch`, `ownership_loss_before_cursor_keeps_the_local_prefix_replayable`   | Lease permit withdrawn.                                                                                                                                                   | Out of scope                                                     |
| `:2948`, `:2982` | `graph_chunk_deadline_stops_a_hung_request_without_advancing_the_cursor`, `cursor_deadline_returns_unknown_commit_as_replayable_error` | Deadlines from the lease.                                                                                                                                                 | Out of scope                                                     |
| `:3010`          | `lane_is_held_until_the_cursor_commit_returns`                                                                                         | Two turns for one integration do not overlap.                                                                                                                             | Out of scope                                                     |
| `:3053`          | `independent_effects_overlap_but_commit_one_contiguous_cursor`                                                                         | Six upserts, 4 at once, no batch transport. 6 done with 6 requests and more than one in flight.                                                                           | Stage 4 concurrency                                              |
| `:3081`          | `successful_full_bulk_create_charges_one_actual_graph_request`                                                                         | 64 upserts, batch size 128, bulk 200. 64 done with 1 request.                                                                                                             | Stage 4 bulk, S1                                                 |
| `:3110`          | `rejected_bulk_create_falls_back_only_within_the_remaining_request_budget`                                                             | 3 upserts, bulk 409, budget 4. 1 done, 2 requests (1 bulk, 1 single).                                                                                                     | Stage 4 bulk. The budget part is out of scope.                   |
| `:3143`          | `concurrent_full_bulk_waves_share_one_bounded_turn`                                                                                    | 10 upserts, batch size 2, 4 at once, budget 35. 8 done with 4 bulk requests.                                                                                              | Stage 4 bulk concurrency                                         |
| `:3178`          | `a_rejected_full_batch_never_sends_or_advances_a_later_batch`                                                                          | 4 upserts, batch size 2, the first batch gets 429. 0 done, 2 bulk requests sent.                                                                                          | Stage 4: a later batch does not count when an earlier one failed |
| `:3212`          | `conflicting_batch_uses_patch_first_and_creates_only_patch_misses`                                                                     | 2 upserts, bulk 409, every patch 404, creates 200. 2 done with 5 requests: 1 bulk, 2 patches, 2 creates.                                                                  | Stage 4, P8                                                      |
| `:3247`          | `a_rejected_bulk_proves_its_whole_batch_so_later_turns_send_only_patches`                                                              | 3 upserts, bulk 409, budget 4, two turns. 1 bulk and 3 patches in total, no single create.                                                                                | Stage 4, P8                                                      |
| `:3303`          | `a_marked_member_that_was_not_the_duplicate_self_heals_through_the_patch_miss`                                                         | 2 upserts, bulk 409, the patch for `entity:2` gets 404. Three turns: 1 bulk, 2 patches, 1 create.                                                                         | Stage 4, P8                                                      |
| `:3364`          | `parallel_turn_never_crosses_an_effect_dependency_class`                                                                               | Two entity upserts and one link upsert. The first turn sends the 2 entities; the second sends the link.                                                                   | Stage 4 order                                                    |
| `:3408`          | `parallel_failure_commits_only_the_acknowledged_prefix`                                                                                | 3 upserts, `entity:2` gets 400. 1 done, 3 requests, status 400.                                                                                                           | S6                                                               |
| `:3437`          | `empty_work_completes_the_turn_without_inventing_a_cursor`                                                                             | No writes. Done with 0 requests.                                                                                                                                          | Stage 4: a run with no changes                                   |
| `:3462`          | `chunk_budget_rejects_the_one_request_livelock_configuration`                                                                          | Budgets 0 and 1 are errors; 2 is accepted.                                                                                                                                | Out of scope (budget)                                            |
| `:2321`          | `proven_conflict_hints_are_work_scoped_and_explicitly_purged`                                                                          | The known-conflict set is per work ID.                                                                                                                                    | Out of scope                                                     |
| `:2352`          | `loader_materializes_and_cross_checks_manifest_state_desired_and_effects`                                                              | Loads and cross-checks the stored records.                                                                                                                                | Out of scope                                                     |

Rate limiter, `src/throttle.rs`:

| Line   | Test                                        | Sets up and asserts                                  | Maps to |
| ------ | ------------------------------------------- | ---------------------------------------------------- | ------- |
| `:89`  | `no_rate_means_off`                         | 100 calls of 1,000 with no rate take under 100 ms.   | Stage 4 |
| `:99`  | `holds_the_cap_under_concurrency`           | 20 tasks of 10 at 50 per second take at least 1.9 s. | Stage 4 |
| `:123` | `oversized_op_waits_a_window_then_releases` | 2,500 at 1,000 per second waits 400 to 700 ms.       | Stage 4 |
| `:137` | `scopes_are_independent_lanes`              | A second scope does not wait.                        | Stage 4 |

### Inline tests of the operations

All of these use a real journal on a temporary directory and a scripted transport. They describe behaviour for the scenarios. The code under test is left behind.

`src/graph/apply.rs`:

| Line    | Test                                                                   | Sets up and asserts                                                                                            | Maps to                                                                                               |
| ------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `:1009` | `apply_advances_applied_state_only_after_final_cursor_and_completion`  | One write, 200. Before sending: no applied state. After: applied state equals the planned state, 1 request.    | S1: the commit happens after all writes                                                               |
| `:1058` | `durable_work_is_adopted_before_replanning_after_a_lost_response`      | Plans twice. The second call returns the first work.                                                           | Out of scope; the rule matches "a stage that finds its own marker returns it"                         |
| `:1088` | `every_apply_publication_boundary_recovers_without_a_second_work_item` | Fails after each of five storage steps and plans again.                                                        | Out of scope; same rule                                                                               |
| `:1145` | `apply_remains_unapplied_between_durable_chunks`                       | Two writes, budget 2. After the first turn there is no applied state.                                          | S7: no commit before the last write                                                                   |
| `:1199` | `zero_effect_apply_still_completes_without_a_graph_request_or_cursor`  | No writes. The run completes with 0 requests.                                                                  | A run with no changes still commits                                                                   |
| `:1231` | `local_loss_after_send_before_cursor_recovers_by_create_409_patch`     | The write is sent, the cursor write fails. A second process sends create (409) then patch (200) and completes. | S7                                                                                                    |
| `:1309` | `cursor_and_completion_response_loss_recover_without_resending_graph`  | Fails after the cursor and after completion. No request is sent again.                                         | Out of scope (cursor)                                                                                 |
| `:1408` | `permanent_graph_failure_terminates_apply_and_requires_restore`        | Create 422. The run ends as failed, the status is `RestoreRequired`, no applied state.                         | S6. The new design does the opposite: the write is recorded as rejected and the run commits (P2, P8). |
| `:1455` | `cancellation_before_a_turn_prevents_any_new_graph_request`            | Cancels after planning. 0 requests.                                                                            | Cancel before sending (P4)                                                                            |
| `:1494` | `retryable_planning_failure_consumes_only_the_handler_failure_budget`  | Records a retryable planning failure.                                                                          | Out of scope                                                                                          |

`src/graph/restore.rs`:

| Line   | Test                                                                 | Sets up and asserts                                                                                                                      | Maps to                                                     |
| ------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `:861` | `restore_to_initial_empty_archives_g_and_clears_maintenance`         | A failed first run with one entity. The restore has 1 write, an archive. Afterwards there is no applied state and the status is healthy. | S8, restore to empty (P12)                                  |
| `:903` | `durable_restore_is_adopted_before_regenerating_effect_artifacts`    | Plans twice; the second call returns the first work.                                                                                     | Out of scope                                                |
| `:924` | `blocked_restore_retries_the_same_manifest_after_its_durable_cursor` | Two archives: 200 then 422. The restore blocks with 1 done. After an operator retry, 1 more request completes it.                        | Out of scope (cursor). The data is S8 with a refused write. |

`src/graph/reconcile.rs`:

| Line    | Test                                                                         | Sets up and asserts                                                                                                                                    | Maps to                                                                                |
| ------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `:931`  | `force_cycle_completes_and_the_next_cycle_has_a_new_work_identity`           | Applied state with `entity:a` and `entity:b`. The reconcile has 2 writes and completes. The next one has a new work ID and cycle 2.                    | S9: every live entity is sent again                                                    |
| `:964`  | `durable_reconcile_is_adopted_before_regenerating_its_manifest`              | Plans twice.                                                                                                                                           | Out of scope                                                                           |
| `:985`  | `corrupt_durable_cursor_blocks_reconcile_without_sending`                    | A cursor with a wrong ID. 0 requests, blocked with `artifact_integrity`.                                                                               | Out of scope                                                                           |
| `:1032` | `reconcile_yields_without_sending_when_foreground_becomes_runnable`          | An apply is planned while a reconcile waits. 0 requests.                                                                                               | Out of scope                                                                           |
| `:1060` | `apply_completion_during_send_supersedes_cursor_without_poisoning_the_shard` | An apply completes during the reconcile's send.                                                                                                        | Out of scope                                                                           |
| `:1102` | `restore_to_the_same_target_resumes_the_existing_cycle_and_cursor`           | Applied `entity:a`, `entity:b`. A reconcile sends 1. A failed apply adds `entity:g-only`. The restore sends 3 writes. The reconcile then resumes at 1. | S8: a restore after a failed run sends the two applied entities and archives the third |

### Scenarios with no labs test

- S4, a renamed sink: not found. No test changes a sink ID between two runs.
- S5, a type version bump: not found. No test changes an entity type URL between two runs.
- The mass-archive guard, the empty-source protection, the partial carry-forward and the duplicate guards have no test. `src/graph/sink.rs:104-200` and `src/engine/candidate.rs:97-109` are covered only where the tests above pass through them.
- A rejected write that lets the run commit (S6 as the new design defines it): not found. Labs ends the run.

---

## Part C. Behaviours that a rewrite could lose

Hashing:

1. Text is trimmed and a blank string hashes like NULL. This applies only to columns whose described type is exactly `VARCHAR`. `src/graph/hash.rs:35-37`.
2. The planner applies the same rule to the values it sends: `src/graph/planner.rs:785-797`. The hash and the request stay in step because of both.
3. Hash field order is the property URLs sorted, then `authors`, `firstPublished`, `lastUpdated`. Field names are `p0…pn`, so the hash holds no column or property name. `src/graph/hash.rs:29-39`, `:54-67`.
4. The `entityId` column is not hashed. `src/graph/hash.rs:46-48`.
5. Provenance field columns are hashed. A change of the `authors` column sends the entity again. `src/graph/hash.rs:57-67`.
6. A mapped column that the table does not have hashes as NULL and logs a warning. `src/graph/hash.rs:31-34`, `src/graph/sink.rs:528-530`.
7. A sink with any coercion or measure accessor hashes the whole row, untrimmed, with unmapped columns and the ID column, and uses hash version 1. `src/graph/hash.rs:69-87`, `src/graph/sink.rs:532-539`, `:561`.
8. The hash input is DuckDB's text form of a struct. It quotes strings that would be ambiguous (`'NULL'`, strings with quotes or leading spaces) and prints floats with a fraction. The fixture is tied to DuckDB `1.5.x`. `tests/golden/fallback-hash.json:3`, and the table in Part B. A DuckDB upgrade can change every hash.
9. A sink with no hashed column has the constant hash `md5('')`. Its entities are created once and never updated. `src/graph/hash.rs:23-25`.
10. A changed sink or link config sets every previous hash to NULL, so every row is sent once. `src/graph/sink.rs:573-590`, `src/graph/link_pipeline.rs:454-460`.

IDs:

11. The UUID is a standard v5 with the namespace `d6e2c7a1-f84b-4e3a-9c0d-5b7f1e3a2d4c` over `"{ns}::{type}::{id}"`. `src/graph/uuid.rs:12-33`.
12. The parts are joined with `::` and are not escaped. An ID that holds `::` is valid. `tests/golden/uuids.json:34-41`.
13. An empty-string ID is valid and gives a UUID. `tests/golden/uuids.json:58-65`. A null ID renders as `null`. `src/value.rs:33`.
14. A float with no fraction renders without `.0` when its absolute value is below `1e15`. `src/value.rs:52-58`.
15. The namespace is the connector's `idNamespace`, else the connector ID. `src/graph/sink.rs:344-347`, `src/definition.rs:1013`.
16. A link's UUID uses the link type and the name `"{from type}::{source id}::{to type}::{target id}"`. `src/graph/client.rs:403-410`.
17. A row with a NULL ID never reaches the planner, because the join `CAST(i.id AS VARCHAR) = c._entity_id` does not match NULL. `src/graph/sink.rs:356`. The row is still written to the state table. `:452-459`.
18. A link row with a NULL endpoint is dropped with no log line. `src/graph/link_pipeline.rs:95`.

Guards:

19. Duplicate IDs fail the plan and the message shows up to five of them. `src/graph/sink.rs:919-953`. Duplicate pairs: `src/graph/link_pipeline.rs:372-404`. Duplicates across sinks: `src/graph/planner.rs:131-139`.
20. The archive limit is `deletes > max(1000, 0.5 × prior rows)`. Prior rows are updates plus deletes plus unchanged. The override is the environment variable `HASH_ALLOW_MASS_ARCHIVE=1`. `src/graph/sink.rs:177-190`, `src/config.rs:212-214`.
21. The empty-source rule reads the row count of the capture, before any SQL step. `src/engine/candidate.rs:76-83`, `:97`.
22. An empty source still runs its SQL and checkpoint steps. `src/engine/candidate.rs:98`, `:274-312`.
23. Source assertions run before the empty-source rule. `notNull` and `unique` are skipped for zero rows. `src/engine/candidate.rs:84-93`, `src/engine/asserts.rs:22`.
24. `notNull` treats a blank string as null. `src/engine/asserts.rs:73`.
25. A row that cannot be built is removed from the state, so the next run tries it again. `src/graph/sink.rs:438-451`.

Order:

26. Rows are planned in the order of the ID text. `src/graph/sink.rs:356`, `:418`. Links: `src/graph/link_pipeline.rs:228`, `:259`.
27. Writes are ordered entity upserts, link upserts, link archives, entity archives, then by `web~uuid`. `src/graph/effects.rs:69-77`, `src/graph/planner.rs:140-143`.
28. Requests of two operations are never in flight together. `src/graph/executor.rs:883`, `:913`.
29. Link pipelines run after all source pipelines, in definition order. `src/engine/candidate.rs:129-150`.
30. Pipelines with no open dependency keep declaration order. `src/engine/topology.rs:123-134`.

Request bodies:

31. A property with a null value is left out of create and patch. `src/graph/client.rs:521-525`, `:540-544`.
32. The property key is the URL with a trailing `v/<digits>` removed. `src/graph/client.rs:485-497`, `:527`.
33. A create always sends `draft: false` and `readOnly: true`. `src/graph/client.rs:362`, `:365`.
34. An entity patch always sends `archived: false` and `entityTypeIds`. It brings an archived entity back. `src/graph/client.rs:369-377`. The planner enforces `archived: false` on patches and `true` on archives. `src/graph/planner.rs:890-901`.
35. A link with no properties is created with `"properties": {"value": {}}`. Its patch has no `properties` key and never has `entityTypeIds`. `src/graph/client.rs:423-426`, `:440-460`.
36. `dataTypeId` is null unless a measure gave one. `src/graph/client.rs:505-509`. Unit lookup: the code, then `"*"`, then the bare amount. `src/coerce.rs:201-208`.
37. Provenance: source level before connector level; default location `"{connector}/{source}"`; link label `links:{id}`; a date-only value gets `T00:00:00Z`; `authors` is a one-element list. `src/engine/batch_sync.rs:815-833`, `src/engine/candidate.rs:131-136`, `src/graph/planner.rs:832-854`.
38. `location` is always present in a provenance source, also with an empty name. `src/graph/mod.rs:49`.
39. A conversion is reported only when the raw value is non-blank and the result is null. `src/graph/accessor.rs:40`, `:65`.

Sending:

40. Any 2xx is success. The response body is not read for content. `src/graph/client.rs:179-181`.
41. `Retry-After` is read only as integer seconds and is capped at 30 s. `src/graph/client.rs:173-178`, `src/http/retry.rs:32-45`.
42. The default wait is `500 ms << min(n, 6)`, capped at 30 s. `src/graph/executor.rs:1780-1782`.
43. A create answered with a body that holds `duplicate key` or `ALREADY_EXISTS` is a conflict whatever the status. `src/graph/executor.rs:1741-1747`.
44. A 409 on a patch is a permanent failure. `src/graph/executor.rs:1474-1481`.
45. A 409 on an archive is success. `src/graph/executor.rs:1514-1521`.
46. A patch that gets 404 after a batch-level conflict is followed by a create. `src/graph/executor.rs:1253-1264`, `:1484-1489`.
47. Writes are sent as the run's owner actor, with the service secret as `Authorization: HASH-Service …`. `src/graph/client.rs:57-66`, `:157`, `:264-281`.

Limits:

48. One stored payload is at most 4 MiB. `src/graph/planner.rs:31`, `:936-941`.
49. An identity is at most 8 KiB and holds no whitespace. `src/graph/effects.rs:18`, `:182-189`.
50. A bulk create holds at most 128 writes, counted by number. `src/config.rs:59-69`.
51. REST and transform rows are inserted 500 at a time. `src/connectors/rest_api.rs:355`, `src/steps.rs:214`.
52. A REST source reads at most `maxPages` pages; the default page size is 100. `src/connectors/rest_api.rs:210-231`.

What is logged without row values:

53. A refused write is reported as a body length and a sha256. `src/graph/executor.rs:1766-1778`.
54. The 429 counter holds no response text. `src/graph/executor.rs:2615-2641` (test).
55. The column coverage warning holds column names and a row count. `src/graph/sink.rs:1012-1017`.
56. The Postgres attach error is replaced because DuckDB's message holds the connection string. `src/connectors/postgres.rs:168-172`.
57. Credential errors hold no field values and no unknown field names. `src/connectors/postgres.rs:129-138`, `src/connectors/rest_api.rs:66-73`.
58. A failed SQL statement is reported with its first 200 characters. `src/store.rs:216-221`. Definition SQL can hold literals.

Capture:

59. A source column named `_op`, `_key` or `_before` fails the capture. `src/snapshot.rs:45-55`.
60. A primary key column that the source lacks fails the capture. `src/snapshot.rs:57-68`.
61. REST columns are all text; nested values are JSON text. `src/connectors/rest_api.rs:293-305`, `:328-332`.
62. A REST next link must stay on the endpoint's scheme, host and port. `src/connectors/rest_api.rs:407-436`.
63. A resolved REST secret is never interpolated. `src/connectors/rest_api.rs:496-499`.
64. A capture bound to a run is reused by every later attempt of that run. `src/engine/source_capture.rs:115-127`, `src/orchestrator/run_artifacts.rs:91-99`.
65. A SQL step's views are dropped also when the SQL fails. `src/steps.rs:178-183`.
66. After a branch, the main pipeline continues with the table from before the branch. `src/steps.rs:132`.

---

## Part D. Defects in labs that the new design must not copy

Confirmed from the list given:

1. **Archive IDs are rendered by DuckDB, upsert IDs by `js_string`.** The state key is `"{entityId}"::VARCHAR` (`src/graph/sink.rs:535`). An archive uses that text as the source ID (`src/graph/sink.rs:423-432`, `src/graph/client.rs:469-477`). An upsert uses the row's JSON value through `js_string` (`src/graph/planner.rs:698`, `src/graph/client.rs:364`, `src/value.rs:30-47`). The test at `src/graph/sink.rs:1163-1218` shows the two forms for a `DOUBLE`: `'1.0'` and `'1'`. Recomputed for namespace `numeric` and type `type`: `1` gives `3868dd55-7f4e-501f-b2f4-632e197a853c` and `1.0` gives `b08918d9-f78e-586c-bf6b-c3bbb3425205`, so the archive targets an entity that was never created. By reading `src/store.rs:609-668`, `DECIMAL`, `HUGEINT` beyond `i64`, `BLOB` and `TIMESTAMP` with fractions are also at risk.
2. **Unit maps are missing from the config hash.** `src/graph/hash.rs:98-102` records only the map name. `src/graph/hash.rs:124-136` and `:152-159` hold no map content. The content hash does not hold it either, so a corrected map sends nothing.
3. **Link pipelines have no archive guard.** `src/graph/link_pipeline.rs:126-154` computes the labels and no limit follows. `:257-283` archives every `delete` pair.
4. **An empty source empties its definition checkpoint.** `src/engine/candidate.rs:98` runs the checkpoint steps on the empty table before the protection at `:99-103` decides anything. The test at `src/engine/candidate.rs:683-745` asserts the empty checkpoint. A link pipeline that reads it gets no current pairs, and `src/graph/link_pipeline.rs:126` labels every stored pair `delete`. The run-wide `Partial` coverage does not stop this, because these archives are explicit writes (`src/graph/link_pipeline.rs:272-282`).
5. **Conversion failures are discarded on the live path.** `plan_entity_sink` collects them (`src/graph/sink.rs:372-384`, `:474`) and `plan_link_table` collects them (`src/graph/link_pipeline.rs:239-251`, `:303`). `plan_candidate` reads only `.graph` and `.errors` (`src/engine/candidate.rs:149`, `:268-269`, `:392-396`). `dlq::record` is called only from dead functions (`src/graph/sink.rs:800`, `src/graph/link_pipeline.rs:560`). The entity is sent without the property and nothing records why.

Further defects found:

6. **Link endpoints use the DuckDB rendering as well.** `_source_id` and `_target_id` are `CAST(… AS VARCHAR)` (`src/graph/link_pipeline.rs:95`) and go into the endpoint UUIDs as strings (`src/graph/planner.rs:743-752`, `src/graph/client.rs:386-402`). The entity itself was created from the `js_string` form. For an ID column that is not text, a link points at a UUID that no entity has. The overview states that creating a link needs both endpoints to exist.
7. **The config hash also misses `web_id`, the source-level and connector-level provenance, and the SQL steps.** `src/graph/hash.rs:124-136`. The link config hash misses `web_id` and the link's provenance. `:152-159`. A changed web or location name sends nothing.
8. **The link content hash covers only the amount column of a measure.** `Accessor::column` returns the amount (`src/definition.rs:28-35`), `property_columns` is built from it (`src/definition.rs:1040-1044`), and the hash uses `property_columns` (`src/graph/link_pipeline.rs:77-88`). A changed unit column on a link sends nothing.
9. **Per-property provenance holds the load time.** `src/graph/planner.rs:711-715`. Every resend creates a new edition. The comparison with the stored projection compares these bytes (`src/graph/planner.rs:453-461`). The overview states this as the reason for the redesign.
10. **A patch adds properties and never removes one.** `src/graph/client.rs:534-553` sends one `add` per non-null value. A value that becomes null stays in the Graph (P7).
11. **An entity whose mapped values are all null gets a patch with `"properties": []`.** `src/graph/client.rs:369-377`. The link code avoids this and says the Graph rejects an empty property patch (`:450-451`). Not checked against the Graph.
12. **A NULL source ID is neither rejected nor planned.** The row is hashed (`src/graph/sink.rs:535`), skipped by the join (`:356`), written to state (`:452-459`), and labelled `insert` on every run, because NULL never matches in the diff join (`:151`). Two NULL IDs fail the duplicate guard with the text `null (2 rows)` (`:927-946`). A blank ID is accepted (`src/graph/planner.rs:698`). By reading.
13. **The partial carry-forward uses `NOT IN`.** `src/graph/sink.rs:130`. If the current table holds one NULL ID, `NOT IN` is never true and no prior row is carried. Every prior row that the partial read did not return is then labelled `delete`. By reading; this follows from SQL's handling of NULL.
14. **The archive limit never applies to a sink with 1,000 prior rows or fewer.** `src/graph/sink.rs:178`. A source that returns 1 of 800 rows archives 799. The limit is also per sink.
15. **A REST source with no rows fails the capture.** `rest_api::hydrate` returns before creating the staging table (`src/connectors/rest_api.rs:161-163`). `capture_sources` then copies from that table (`src/engine/source_capture.rs:146-153`). By reading. The empty-source rule can therefore not apply to REST sources.
16. **A REST read stopped by `maxPages` counts as a full read.** `src/connectors/rest_api.rs:225-231`. Rows past the cap are archived unless the source is declared partial.
17. **The empty-source rule reads the capture row count.** `src/engine/candidate.rs:76-83`, `:97`. A SQL step that filters out every row is not covered. The rule also needs an existing state table (`:215-234`).
18. **One protected empty source sets `Partial` coverage for the whole run.** `src/engine/candidate.rs:103`. In `finalize_projection_plan` that stops the archive of every object the plan does not mention, in every sink (`src/graph/planner.rs:233-249`).
19. **A source of kind `Checkpoint` has no ordering edge to its producer.** `src/engine/topology.rs:56-101` reads only `dependsOn` and `inputs`. `_checkpoint/{name}` tables stay in the snapshot (`src/engine/candidate.rs:511-523`). A pipeline declared before its producer copies the previous run's table (`src/engine/candidate.rs:172-191`).
20. **State advances while planning.** `src/graph/sink.rs:452-459`, `src/graph/link_pipeline.rs:284-291`. The overview lists this.
21. **One row-build error fails the whole plan.** `src/engine/candidate.rs:492-509`. On the live path the only such error is a row with `_op = 'delete'` (`src/graph/planner.rs:694-696`).
22. **A permanently refused write ends the run and requires a restore.** `src/graph/apply.rs:537-549`, test at `:1408-1452`. The overview lists this.
23. **A 404 on an archive is a permanent failure on the live path.** `src/graph/executor.rs:1522-1524` through `classify`. The dead path treats it as success (`src/graph/client.rs:754`). Under P12 a restore to empty archives entities that may never have been created.
24. **A bulk create answered with a retryable status is never split.** `src/graph/executor.rs:1062-1066`. The overview states that one bad entity fails the whole bulk request and that a missing link endpoint returns 500. Such a batch is sent again without end.
25. **Successes of a later batch are discarded when an earlier batch fails.** `src/graph/executor.rs:1003-1013`. Those writes reached the Graph and are sent again.
26. **Batches are cut by count only.** `src/config.rs:59-69`, `src/graph/executor.rs:974-983`. The overview gives a 2 MB body limit. A larger batch gets 400 and falls back to one request per write.
27. **Numbers lose precision on the way to the request.** `DECIMAL` becomes a JSON number through `serde_json::Number::from_str` (`src/store.rs:629-635`). `HUGEINT` and `UBIGINT` beyond `i64` become floats (`:618-626`). `integer` truncates a float with `as i64` (`src/coerce.rs:26-31`).
28. **An unknown coercion name panics.** `src/coerce.rs:46-49`.
29. **Date coercion checks the shape only.** `01/15/2024` becomes `2024-15-01` (`src/coerce.rs:84-91`, `:100`, test at `:263-266`). The month-first branch at `:88-91` can never be reached, because the day-first pattern at `:67` matches the same text.
30. **`fn` steps cannot run.** The planner registers no transforms (`src/orchestrator/planning.rs:120`), and `run_step` fails for an unknown transform (`src/steps.rs:93-100`).
31. **A renamed sink has no handling.** The state table name holds the sink ID (`src/graph/sink.rs:113-114`). After a rename every row is an `insert` and the old state table stays in the snapshot. Not tested. A1 addresses this.
32. **`to_base_url` does not check what precedes `v/`.** `src/graph/client.rs:485-497`. A URL that ends in `…dev/2` loses `v/2`.
33. **Two property URLs with the same base overwrite each other in a create.** `src/graph/client.rs:520-530`.
34. **Some messages hold row values.** The first rejected bulk create logs 512 characters of the response (`src/graph/client.rs:230-247`). The `unique` assertion lists key values (`src/engine/asserts.rs:122-145`). The duplicate guards list IDs (`src/graph/sink.rs:937-952`, `src/graph/link_pipeline.rs:388-403`). A REST error holds 200 characters of the response (`src/connectors/rest_api.rs:551-554`). A row-build failure stores the whole row as JSON (`src/graph/sink.rs:403`).
35. **The hash depends on DuckDB's struct rendering.** See Part C item 8. Labs has no check that the DuckDB version of a run equals the version that wrote the stored hashes.
