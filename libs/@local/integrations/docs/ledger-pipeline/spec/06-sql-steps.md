# Milestone 6: SQL steps

## What it adds

`stage/prepare/pipeline/mod.rs`: running the steps of a definition's entity pipelines and link pipelines in the workspace of milestone 5, and the types they return. The plan's module tree has `pipeline.rs`. It becomes a folder because its tests sit beside it (see Open points). Prepare (milestone 8) calls it from `run_pipelines`, after staging and before it reads the rows of each table.

```text
staging (8) ──► [ pipeline/ ] ──► collect_changes (8)
  _source/{source}    prepare_pipeline        PreparedSink.table, PreparedLink.table
  with _op, _key, _seq  prepare_link_pipeline  read with Workspace::query
                        check_metadata         on entity tables here, on link tables in 8
```

Each SQL step reads the table before it as `input` and writes a new table `_step/{uuid}`. A checkpoint step copies the table under a name. A sink step checks the columns the sink reads and names the table it received. A branch runs each branch on the same table. Every table must carry `_op`, `_key` and `_seq`: an entity table after each SQL step, a link table at the end of its pipeline (D1).

Against `engine`: no `_content_hash`, `_seq` beside `_op` and `_key`, no source checks, no cancellation, and the functions are blocking methods of the new `Workspace`, not requests to a thread.

**Decided in:** `../plan.md`, step 2, "Prepare", and step 3, "Prepare, for incremental updates" (internal columns). D1 for link tables.

## Size

|           | Lines   |                                                                                                                                                     |
| --------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Moved     | 63      | one step, the column checks, the table name, two result types                                                                                       |
| Adapted   | 265     | running one SQL text, the two pipeline functions, the step dispatch with the new sink step, the error, `PreparedSink`, `check_metadata` with `_seq` |
| New       | 0       |                                                                                                                                                     |
| **Total** | **328** | **reused 100%**                                                                                                                                     |

The plan has 395 (80 moved, 315 adapted). Its 80 moved lines were the helpers `pipeline_sql`, `describe` and `pipeline_count`, which milestone 5 now owns. The rest is smaller than estimated because the content hash (about 50 lines) and the request types of the command queue (16) go. `execute_pipeline_sql` counts as adapted, since `pipeline_sql` now returns `StatementError`.

## Interface

`contracts.md`, "Workspace and SQL steps":

```rust
impl Workspace {
    pub fn prepare_pipeline(&self, pipeline: &EntityPipeline, input: &str, checkpoints: &BTreeMap<CheckpointName, Box<str>>) -> Result<PreparedPipeline, Report<PreparationError>>;
    pub fn prepare_link_pipeline(&self, pipeline: &LinkPipeline, checkpoints: &BTreeMap<CheckpointName, Box<str>>) -> Result<PreparedLink, Report<PreparationError>>;
    pub fn check_metadata(&self, table: &str) -> Result<(), Report<PreparationError>>;
}

pub struct PreparedPipeline { pub table: Box<str>, pub checkpoints: BTreeMap<CheckpointName, Box<str>>, pub sinks: Vec<PreparedSink> }
pub struct PreparedSink { pub table: Box<str>, pub sink: EntitySink }       // no `step`
pub struct PreparedLink { pub table: Box<str>, pub pipeline: LinkPipeline }

pub enum PreparationError {
    Statement, ReservedColumn { column }, MissingColumn { column }, Metadata { table },
    MissingCheckpoint { checkpoint }, Step { step }, LinkInputs,
}
```

It uses from milestone 5: `create_table`, `describe`, `count` and `pipeline_sql`, which return `StatementError`, and `sql::Identifier`. Each call adds `change_context(PreparationError::Statement)`. The crate gains `hash-integrations-definition` and `uuid` with `v4` (`engine/Cargo.toml:14`, `:19`).

## Pseudo code

**`execute_pipeline_sql`** (adapted, `engine/workspace/connection/pipeline.rs:23-53`): checks the step's SQL with `pipeline_sql`, binds `input` and the named inputs as CTEs, and writes the result to a new `_step/{uuid}` table. The one change: `pipeline_sql`'s `StatementError` gets `change_context(Statement)`.

**`prepare_pipeline`** (adapted)

```rust
pub fn prepare_pipeline(&self, pipeline: &EntityPipeline, input: &str, checkpoints: &BTreeMap<..>) -> Result<PreparedPipeline, _> {
    self.check_metadata(input)?;                                  // the staged table
    let inputs = pipeline.inputs  /* alias -> checkpoint */
        .map(|(alias, checkpoint)| checkpoints.get(checkpoint) else MissingCheckpoint)?;
    let mut execution = Execution { workspace: self, inputs,
        output: PreparedPipeline { table: input.into(), checkpoints: empty, sinks: empty } };
    for step in &pipeline.steps {
        let current = execution.output.table.clone();
        match &step.kind {
            StepKind::Action(action) => execution.output.table = execution.action(&step.id, action, &current)?,
            StepKind::Branch(branches) => for branch in branches.iter() {
                let mut table = current.clone();                  // each branch from the same table
                for step in branch { table = execution.action(&step.id, &step.action, &table)? }
            },                                                    // the pipeline goes on with `current`
        }
    }
    Ok(execution.output)
}
```

`engine`'s function with the arguments of `PipelineRequest` as parameters, without `#[tracing::instrument]`, and with the doc comment of the async wrapper (`engine/workspace/mod.rs:289-296`). Milestone 5 strips the wrapper around that comment.

**`Execution::execute_action`** (adapted; the sink step changes)

```rust
fn execute_action(&mut self, action: &Action, input: &str) -> Result<Box<str>, _> {
    match action {
        Action::Sql(sql) => {
            let table = self.workspace.execute_pipeline_sql(sql, Some(input), &self.inputs)?;
            self.workspace.check_metadata(&table)?;
            Ok(table)
        }
        Action::Checkpoint(name) => {                             // unchanged: a copy under a new name
            let table = table_name();
            self.workspace.create_table(&table, "SELECT * FROM {input}")?;    // Statement
            self.output.checkpoints.insert(name.clone(), table);
            Ok(input.into())
        }
        Action::Sink(sink) => {
            let schema = self.workspace.describe("SELECT * FROM {input}")?;    // Statement
            check_column(&sink.entity_id, &schema)?;                           // MissingColumn
            check_properties(&sink.properties, &schema)?;
            self.output.sinks.push(PreparedSink { table: input.into(), sink: sink.clone() });
            Ok(input.into())
        }
    }
}
```

A sink step now writes no table. It checks that the entity id column and every column a property reads exist, and returns the name of its input table in `PreparedSink.table`. That table holds the rows as the step before left them, with `_op`, `_key` and `_seq`. In `engine` the sink step copied the table and added `_content_hash` (`:206-236`). Without `PreparedSink.step`, `execute_action` no longer takes the step id. `action` (`:157-166`) still does, and wraps any error in `Step { step }`. The cancellation check (`:175`) goes.

**`prepare_link_pipeline`** (adapted): `engine`'s function (`:57-101`) with `LinkRequest`'s fields as parameters and the wrapper's doc comment (`engine/workspace/mod.rs:315-321`). Milestone 5 strips the wrapper. It resolves the input checkpoints, runs the SQL steps without the metadata check, then checks the two endpoint columns and the property columns. It returns `LinkInputs` if no table results. Milestone 8 then calls `check_metadata` on the link table (D1).

**`check_metadata`** (adapted, from `engine/workspace/connection/staging.rs:172-195`)

```rust
pub fn check_metadata(&self, table: &str) -> Result<(), Report<PreparationError>> {
    let schema = self.describe("SELECT * FROM {table}")?;                     // Statement
    for (column, kind) in [("_op", "VARCHAR"), ("_key", "VARCHAR"), ("_seq", "BIGINT")] {
        if !schema.iter().any(|(name, found)| name.eq_ignore_ascii_case(column) && found == kind) {
            return Err(Metadata { table });
        }
    }
    if self.count("SELECT count(*) FROM {table} WHERE _op IS NULL OR _key IS NULL OR _seq IS NULL")? > 0 {
        return Err(Metadata { table });
    }
    Ok(())
}
```

It serves entity tables and link tables alike. `pipeline_count` is `count` now. The doc comment gets an errors section.

**Moved unchanged:** `Execution` (`pipeline.rs:16-20`), `Execution::action` (`:156-166`), `table_name` (`:239-242`), `check_properties` (`:275-291`), `check_column` (`:293-305`), `PreparedPipeline` (`engine/pipeline/mod.rs:82-88`), `PreparedLink` (`:103-108`).

## Source table

`p/` is `engine/workspace/connection/pipeline.rs`, `m/` is `engine/pipeline/mod.rs`, `s/` is `engine/workspace/connection/staging.rs`. All items go to `stage/prepare/pipeline/mod.rs`.

| Item                                         | Comes from                                                    | Kind    | Lines |
| -------------------------------------------- | ------------------------------------------------------------- | ------- | ----- |
| `Execution`                                  | `p/:16-20` (5)                                                | moved   | 5     |
| `Execution::action`, with the `impl` line    | `p/:156-166` (11)                                             | moved   | 11    |
| `table_name`                                 | `p/:239-242` (4)                                              | moved   | 4     |
| `check_properties`                           | `p/:275-291` (17)                                             | moved   | 17    |
| `check_column`                               | `p/:293-305` (13)                                             | moved   | 13    |
| `PreparedPipeline`                           | `m/:82-88` (7)                                                | moved   | 7     |
| `PreparedLink`                               | `m/:103-108` (6)                                              | moved   | 6     |
| imports of both files                        | `p/:1-14`, `m/:1-5` (19)                                      | adapted | 16    |
| `execute_pipeline_sql`, with the `impl` line | `p/:22-53` (32)                                               | adapted | 32    |
| `prepare_link_pipeline`                      | `p/:55-101` (47), doc from `engine/workspace/mod.rs:315-321`  | adapted | 51    |
| `prepare_pipeline`                           | `p/:103-154` (52), doc from `engine/workspace/mod.rs:289-296` | adapted | 55    |
| `execute_action` with the sink step          | `p/:168-237`, `execute_action` and `sink` (69)                | adapted | 42    |
| `PreparationError`                           | `m/:45-71` (27)                                               | adapted | 18    |
| `PreparedSink`                               | `m/:73-80` (8), without `step`, doc no longer names the hash  | adapted | 7     |
| `check_metadata`                             | `s/:172-195` (24)                                             | adapted | 30    |
| blank lines between items                    |                                                               | adapted | 14    |

Moved 63, adapted 265, new 0: 328 lines.

## Tests

The tests of `engine/tests/pipeline.rs` named in `../plan.md`, step 5, move to `stage/prepare/pipeline/tests.rs`. Every one changes in the same three ways: `#[test]` in place of `#[tokio::test]` and no `.await`; arguments by reference (`&pipeline`, `"source"`, `&BTreeMap::new()`); and a helper `source` in place of `stage`.

**The helper.** Staging is milestone 8, so the tests write their input tables with milestone 5's `create_table`. `source(workspace, table, sql, key: &PrimaryKey)` builds `_key` from the key columns, as `engine`'s `stage_table` does (`s/:95-111`):

```rust
fn source(workspace: &Workspace, table: &str, sql: &str, key: &PrimaryKey) {
    let keys = /* "K := K, ..." over key.columns(), each quoted with Identifier */;
    workspace.create_table(table, "SELECT 'insert' AS _op, to_json(struct_pack({keys}))::VARCHAR AS _key, \
        row_number() OVER () AS _seq, source.* FROM ({sql}) AS source")
        .expect("the source table should be created");
}
```

`row_number()` is `BIGINT` in DuckDB. The helper `key(&["ID"])` stays.

| Test                                  | Its input tables                                                                                                                                                                       | Change beyond the three above                                                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pipeline_branch_isolation` (`:216`)  | `source(.., "source", "SELECT 1 AS ID, 10 AS VALUE", key(["ID"]))`, later replaced the same way with `ID` 2                                                                            | fixture `pipeline-branches.yaml` moves; its three SQL steps also select `_seq`                                                                                     |
| `pipeline_metadata_loss` (`:262`)     | `source` with `SELECT 1 AS ID`                                                                                                                                                         | none                                                                                                                                                               |
| `pipeline_named_inputs` (`:330`)      | `source` with `SELECT 1 AS ID, 10 AS VALUE`; the checkpoint `lookup` with `create_table`, as now                                                                                       | its SQL also selects `input._seq`                                                                                                                                  |
| `pipeline_sql_sandbox` (`:390`)       | `source` with `SELECT 1 AS ID`                                                                                                                                                         | none                                                                                                                                                               |
| `link_named_inputs` (`:459`)          | `left_data` and `right_data` with `create_table`, as now; nothing staged                                                                                                               | none; fixture `pipeline-links.yaml` moves unchanged                                                                                                                |
| `definition_aviation_tables` (`:502`) | for a SQL source, `source(.., "_source/{name}", query, primary_key)` with the definition's own query and key (`TAIL`, `ICAO`); for a checkpoint source, the checkpoint's table, as now | the sinks are checked with `count(*)` only, not `count(_content_hash)`; `definition/examples/aviation.yaml` is read at the same relative path                      |
| `pipeline_bound_parameters` (`:726`)  | `source` with `SELECT $increment::INTEGER AS ID, 10 AS VALUE`; `create_table` binds the parameter                                                                                      | the step selects `_seq`; the source SQL loses its terminator, since the helper wraps it in a subquery. The step keeps its terminator, which `pipeline_sql` removes |

**Left behind:** `pipeline_content_hashes`, `pipeline_converted_hashes`, `pipeline_measured_hashes` with `pipeline-sink.yaml` and `pipeline-measured.yaml`, and `pipeline_cancellation`. The staging tests go to milestone 8.

**New, two tests,** for behaviour no moved test covers:

1. `check_metadata` on a table shaped like a link table, with cases: all three columns, `_seq` missing, `_seq` as `VARCHAR`, a null `_seq`. Only the first passes. This is the check milestone 8 runs on link tables (D1). `pipeline_metadata_loss` stays as it is, since this test covers `_seq`.
2. A sink step names a table with its input's rows and no `_content_hash`. A sink whose entity id column, or a property column, is missing fails with `Step` and `MissingColumn` in its report. In `engine`, only the left-behind `pipeline_converted_hashes` (`:648`) checked this.

## What was stripped

- The content hash: `hash_expression` (`p/:244-273`, 30), the copy with `_content_hash` in `sink` (`p/:213-235`, 23), and the hash in `PreparedSink`'s doc comment.
- Cancellation: `check_preparation_cancelled` (`s/:10-17`, 8), its call in `execute_action` (`p/:175`, 1), `PreparationError::Cancelled` (2).
- The command queue: `PipelineRequest`, `StagingRequest`, `LinkRequest` (`m/:90-101`, `:110-113`, 16) and `PreparationError::Stopped` (2). These types only carry a call's arguments to the thread (`engine/workspace/mod.rs:91-100`, `connection/mod.rs:485-494`). The async wrappers and the thread are counted in milestone 5.
- `PreparedSink.step` (1) and its `step.clone()` in the sink step (1).
- Source checks: `TableAssertions`, `AssertionFailure`, `row_count_bounds` (`m/:7-43`, 37) and `PreparationError::Assertions` (5). `check_assertions` is counted in milestone 8.
- `#[tracing::instrument]` on the two pipeline functions (2).

## Open points

- **Fact:** the definition types give this: `EntityPipeline` has `source`, `depends_on`, `inputs` (alias to checkpoint) and `steps` (`definition/src/pipeline.rs:12-19`). A `Step` has an id and a `StepKind`, which is an `Action` or `Branches` (`step.rs:220-232`). `Action` is `Sql`, `Checkpoint` or `Sink(EntitySink)` (`step.rs:153-160`). `Branches` is not empty, no branch is empty, and a branch step is always an `Action` (`step.rs:166-216`). `LinkPipeline` has `input`, SQL-only `steps`, `from`, `to`, `link_type` and `properties` (`link.rs:78-86`). `LinkInput` is one checkpoint or a non-empty map of aliases (`link.rs:23-28`, `:52-58`). `entity_pipelines()` is in run order (`definition/mod.rs:106-111`).
- **Fact:** nothing outside tests reads `PreparedSink.step`. The aviation loop in `tests/integrations/graph/aviation/mod.rs:99-112`, from the repository root and not from `engine/`, reads `sink.table` and `sink.sink`, as milestone 8's `collect_changes` does. `PreparedPipeline.table` is read only by the moved tests (`engine/tests/pipeline.rs:371`, `:415`, `:448`, `:761`). Milestone 8 reads `checkpoints` and `sinks`.
- **Fact:** reachable variants of `PreparationError`: `Statement`, `MissingColumn`, `Metadata`, `Step` and `MissingCheckpoint`. `MissingCheckpoint` comes only from a caller's incomplete map, since the definition checks every checkpoint has a producer (`definition/check.rs:160`, `:176`); `pipeline_named_inputs` tests it. `LinkInputs` cannot come from a checked definition, which refuses several inputs without a step (`check.rs:171-172`). `ReservedColumn` is raised only by staging, in milestone 8 (`s/:80`).
- **Fact:** a sink as the first step of a pipeline names the staged table itself, as `sink-airfields` in `aviation.yaml` does. Within a run no one replaces that table.
- **Fact:** the workspace enables clippy's `restriction` group (root `Cargo.toml:423`) and allows only `mod_module_files` (`:468`), so `clippy::self_named_module_files` warns. A folder `pipeline/` beside `pipeline.rs` would warn.
- **Chosen:** `pipeline.rs` becomes `pipeline/mod.rs`, with the tests in `pipeline/tests.rs`. The tests are about 300 lines, too many for an inline module. This follows `RUST_DESIGN_GUIDELINES.md`, `name/mod.rs` for a module with children, and milestone 7's `property/tests.rs`. The fixtures go to `ledger/tests/fixtures/`, as in `engine`.
- **Chosen:** a sink step does not copy its table. Every table a step writes has a fresh name, so the sink's table cannot change under it. One `CREATE TABLE` per sink is saved.
- **Chosen:** `_seq` must be `BIGINT`, the type of DuckDB's `rowid` that staging uses and of `SyncRow.seq` (`i64`).
- **Chosen:** `LinkInputs` stays. The code must answer a link with no table, and an error is the ported answer.
- **Settled on `contracts.md`:** `describe`, `count` and `pipeline_sql` return `StatementError`, and `Identifier` is listed. `PreparedSink` has no `step`. A link table carries `_op`, `_key` and `_seq` (D1).
