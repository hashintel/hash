# Milestone 8: Prepare, incremental

## What it adds

Stage 2 for incremental updates. It takes the capture file of a run and leaves the run's entity changes in the sync table, an issues file, and the `prepare` part of `run.json`.

It is the milestone where the pieces of Prepare come together: the workspace (5), the SQL steps (6), ids and properties (7), the sync table (4) and the stage frame (3).

```text
Capture ──► [ Prepare, incremental ] ──► Send
              reads   runs/{run}/capture/{table}.parquet, one per table
              writes  sync table rows, runs/{run}/issues.jsonl
              last    the `prepare` part of run.json
```

**Decided in:** `../plan.md`, step 3, "Prepare, for incremental updates" and "How a stage writes".

## Size

|           | Lines   |                                                                                              |
| --------- | ------- | -------------------------------------------------------------------------------------------- |
| Moved     | 0       |                                                                                              |
| Adapted   | 370     | staging, the loop that turns rows into changes, the issue type, two error cases              |
| New       | 380     | the order of the shared steps, the entry function with its failures, writing the issues file |
| **Total** | **750** | **reused 49%**                                                                               |

The plan estimated 740. The issues file as JSON lines (D3) saved 55 lines. The check of this batch added about 45: which failures are permanent, the workspace settings, and the source's key in staging. Several tables per run (D14) added 20.

## Interface

One function is called from outside the stage:

```rust
// stage/prepare/incremental/mod.rs
pub async fn prepare_incremental(storage: &Storage, run: RunId) -> Result<(), Report<StageError>>
```

Everything it calls from other milestones is in `contracts.md`: `stage::begin` and `end`, `Storage::download` and `upload`, the `Workspace` functions, `derive_entity_id` and `derive_link_id`, `SinkRow`, and `sync_table::write`.

## Pseudo code

**`stage/prepare/incremental/mod.rs`: the entry function** (new, 130 lines)

```rust
pub async fn prepare_incremental(storage, run) -> Result<(), Report<StageError>> {
    let mut open = stage::begin(storage, run, Stage::Prepare).await?;
    if open.record.prepare.is_some() { return Ok(()); }         // finished before
    let result = prepare(storage, &open.record).await
        .map(|part| open.record.prepare = Some(part));
    stage::end(storage, open, result).await
}

async fn prepare(storage, record: &RunRecord) -> Result<PreparePart, Report<StageError>> {
    let definition = Definition::from_yaml(&record.input.definition)?;
    one_table_per_pipeline(&definition)?;                       // D14: no pipeline reads a second table
    let tables = captured_tables(&definition, record.capture.as_ref()?)?;   // name, primary key, key in the bucket
    let context = Context::new(&record.input, &definition);     // web, id namespace, unit maps: owned
    let config = WorkspaceConfig { variables: definition.variables().clone(), ..Default::default() };

    let scratch = tempdir()?;
    let mut files = Vec::new();
    for table in &tables {
        files.push(storage.download(&table.key, scratch.path()).await?);
    }

    // DuckDB blocks, so everything on the workspace runs in one blocking task.
    // The task owns what it uses and borrows nothing from this function.
    let changes = spawn_blocking(move || {
        let workspace = Workspace::open(&scratch.join("prepare.duckdb"), config)?;
        let mut staged = BTreeMap::new();
        for (table, file) in tables.iter().zip(&files) {
            workspace.load_capture(file, "_capture/{table.name}")?;
            staged.insert(table.name, staging::stage(&workspace, &table.name, &table.primary_key)?);   // incremental
        }
        let prepared = prepare::run_pipelines(&workspace, &definition, &staged)?;   // shared
        prepare::collect_changes(&workspace, &prepared, &context)                   // shared
    }).await??;

    let (rows, issue_count) = (changes.rows.len(), changes.issues.len());     // rows of the sync table
    let issues = issues::write(storage, record.input.run, scratch.path(), &changes.issues).await?;
    sync_table::write(storage, record.input.run, changes.rows).await?;
    Ok(PreparePart { rows, issues, issue_count })
}
```

In a definition a table is called a source. Two small functions decide whether Prepare can work on the definition:

- `one_table_per_pipeline` refuses a definition in which a pipeline reads a second table. The definition format has two ways to do that: an entity pipeline with an extra input for its SQL (`EntityPipeline.inputs`), and a link pipeline that starts from more than one input (`LinkInput::Inputs`). A join of two tables would see only the changed rows of each and give wrong results without an error.
- `captured_tables` pairs each table of the definition with its capture file from the `capture` part. A source that is a checkpoint of another pipeline has no file and is not counted. A table without a file, and a file without a table, fail the run. A table without changes needs an empty file.

Which failure is which. A code belongs to a step, not to a kind of error, and each step's error is given its code where the step is called, inside the blocking task. The `failure` part also holds the error's text, so the code can stay coarse:

| Step                                                                                                                                             | Kind      | Code                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---------------------------- |
| The definition does not parse, or a pipeline reads a second table                                                                                | permanent | `prepare_definition_invalid` |
| The capture files: their names, loading one into DuckDB, staging it (no `_change`, another value in it, a reserved column, a missing key column) | permanent | `prepare_capture_invalid`    |
| The SQL steps: a step fails, drops `_op`, `_key` or `_seq`, or lacks a column a sink reads (D12)                                                 | permanent | `prepare_step_failed`        |
| Rows into changes: a table cannot be read, or a row's `_op` is no longer insert, update or delete                                                | permanent | `prepare_rows_invalid`       |
| A row that cannot be written to the sync table                                                                                                   | permanent | `prepare_rows_invalid`       |
| Storage: downloading a capture file, uploading the issues file, the sync table's bucket                                                          | retryable |                              |
| The workspace cannot be opened, or the blocking task stops unexpectedly                                                                          | retryable |                              |

Every error of the workspace inside a step is permanent, as D12 decided for an SQL step: the same files and the same definition fail the same way.

**`stage/prepare/incremental/staging.rs`: staging for incremental input** (adapted, 115 lines)

```rust
pub(super) fn stage(workspace, source: &SourceName, primary_key: &PrimaryKey) -> Result<Box<str>, Report<PreparationError>> {
    let columns = workspace.describe("SELECT * FROM {Identifier(_capture/{source})}")?;   // of a query
    // fails with:
    //   MissingChange     no column `_change`
    //   ReservedColumn    a source column named `_op`, `_key` or `_seq`
    //   MissingColumn     a primary key column that is missing
    workspace.create_table("_source/{source}", "
        SELECT source._change::VARCHAR                     AS _op,
               to_json(struct_pack(K := K, ...))::VARCHAR  AS _key,
               source.rowid                                AS _seq,
               source.* EXCLUDE (_change)
        FROM \"_capture/{source}\" AS source")?;
    // fails with InvalidChange { rows } if `_op` is not 'insert', 'update' or 'delete' in some row
    Ok("_source/{source}")
}
```

This is `engine`'s `stage_table` with three changes: `_op` comes from `_change` and not from the constant `'snapshot'`, `_seq` is added, and the values of `_op` are checked. The source checks for row counts and empty columns are gone (`../plan.md`, step 2).

`ReservedColumn` and `MissingColumn` are cases of `PreparationError`, which milestone 6 ports. This milestone adds two cases to it: `MissingChange` and `InvalidChange`.

**`stage/prepare/mod.rs`: the steps every version shares** (new, 220 lines)

```rust
pub(super) fn run_pipelines(workspace, definition, staged: &BTreeMap<SourceName, Box<str>>) -> Result<PreparedTables, Report<PreparationError>> {
    let mut checkpoints = BTreeMap::new();
    for pipeline in definition.entity_pipelines() {            // already in dependency order
        let input = match the kind of `pipeline.source` {
            a checkpoint => the table of that checkpoint,        // written by an earlier pipeline
            otherwise    => the staged table of that source,
        };
        let prepared = workspace.prepare_pipeline(pipeline, input, &checkpoints)?;
        checkpoints.extend(prepared.checkpoints);
        sinks.extend(prepared.sinks);
    }
    for link in definition.link_pipelines() {
        let prepared = workspace.prepare_link_pipeline(link, &checkpoints)?;
        workspace.check_metadata(&prepared.table)?;            // D1: `_op`, `_key` and `_seq`
        links.push(prepared);
    }
    Ok(PreparedTables { sinks, links })
}

pub(super) fn collect_changes(workspace, tables, context) -> Result<Changes, Report<PreparationError>> {
    for sink in tables.sinks {
        let rows = workspace.query("SELECT * FROM {Identifier(sink.table)}")?;
        changes.extend(changes::entity_changes(context, &sink.sink, rows.columns(), rows.iter())?);
    }
    for link in tables.links { /* the same with changes::link_changes */ }
    Ok(changes)                                                // Changes { rows: Vec<SyncRow>, issues: Vec<Issue> }
}
```

`engine` has no function for this. The loop exists once, in the test `tests/integrations/graph/aviation/mod.rs:63` (from the repository's root), and this is that loop as a function. Labs has it as `plan_candidate` and `plan_source_pipeline`.

**`stage/prepare/changes.rs`: a table row becomes a change, or an issue** (adapted, 215 lines)

```rust
pub(super) fn entity_changes(context, sink, columns: &[Box<str>], rows: impl Iterator<Item = &[Value]>)
    -> Result<Changes, Report<PreparationError>>
{
    let names = SinkColumns::from_iter(columns);
    let (op_at, seq_at) = the positions of `_op` and `_seq` in `columns`;
    for values in rows {
        let (op, seq) = (the text of values[op_at], the number of values[seq_at]);
        let row = SinkRow::new(&names, values);                // `SinkRow` stays as it is in `engine`
        let Some(source_id) = row.text(&sink.entity_id) else {
            issues.push(Issue::missing_source_id(..)); continue;
        };
        let entity_id = derive_entity_id(context.web, &context.id_namespace, &sink.entity_type, &source_id);
        let (op, properties) = match op {
            "insert" => (Op::CreateEntity,  resolve(&row, sink, context, &mut issues)),
            "update" => (Op::UpdateEntity,  resolve(&row, sink, context, &mut issues)),
            "delete" => (Op::ArchiveEntity, empty),
            _        => return Err(PreparationError::InvalidChange),   // an SQL step rewrote `_op`
        };
        rows.push(SyncRow { run, seq, op, entity_id, entity_type, properties, .. });
    }
}

pub(super) fn link_changes(context, link, columns, rows) -> Result<Changes, Report<PreparationError>> {
    // the same, with the two ends read from `link.from.column` and `link.to.column`.
    // `derive_entity_id` gives the id of each end, `derive_link_id` the id of the link.
    // The kinds are Op::CreateLink, UpdateLink, ArchiveLink.
}
```

`resolve` calls `SinkRow::resolve` and turns each value that could not be converted into an issue. The row is still written, without that property.

This is the row loop of `Planner::plan_entities` and `plan_links`. Three things change: it reads the kind of change from `_op`, where the planner made every row an upsert. It returns rows of the sync table, where the planner encoded request bodies. A delete row gets no properties.

Both versions of Prepare use this step as it is (D13). A version only has to leave `_op` as `insert`, `update` or `delete` on its tables. The incremental version does that in staging. The version for full captures will do it by comparing with the previous run.

The functions take the column names and the rows' values, not a `Rows`. A test can then hand them rows it built itself, as `engine`'s planner tests do.

**`stage/prepare/issues.rs`: the issues file** (the type adapted, writing it new, 60 lines)

```rust
#[derive(Serialize)]
pub(super) struct Issue {
    pub seq: i64,
    pub kind: IssueKind,                 // missing_source_id, or property
    pub entity_type: VersionedUrl,
    pub entity_id: Option<EntityId>,
    pub name: Box<str>,                  // the id column, or the property
    pub reason: Option<Box<str>>,        // the text of `FailureReason`
    pub value: Option<Box<str>>,         // the value that could not be converted (D2)
}

pub(super) async fn write(storage, run, scratch: &Path, issues: &[Issue]) -> Result<Option<Box<str>>, _> {
    if issues.is_empty() { return Ok(None); }
    // one line of JSON per issue, written to a file in the scratch folder, then uploaded
    let key = run::issues_file(run);                            // runs/{run}/issues.jsonl
    storage.upload(&file, &key).await?;
    Ok(Some(key.into()))
}
```

`Issue` is `engine`'s `PlanIssue` with its two cases as one struct of plain values. `ConversionFailure` and `FailureReason` of milestone 7 cannot be written as JSON, and stay as they are: the issue takes the reason as its text.

## Source table

| New file                        | Item                                                                                             | Comes from                                                                                                                    | Kind    | Lines |
| ------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------- | ----- |
| `incremental/staging.rs`        | `stage`                                                                                          | `engine/workspace/connection/staging.rs:69-114`, `stage_table` (46)                                                           | adapted | 115   |
| `changes.rs`                    | `entity_changes`                                                                                 | `engine/graph/plan/mod.rs:282-314`, `Planner::plan_entities` (33)                                                             | adapted | 75    |
| `changes.rs`                    | `link_changes`                                                                                   | `engine/graph/plan/mod.rs:316-354`, `Planner::plan_links` (39)                                                                | adapted | 70    |
| `changes.rs`                    | source id, `resolve`, `Context`                                                                  | `engine/graph/plan/mod.rs:177-212` and `:252-280` (65)                                                                        | adapted | 70    |
| `issues.rs`                     | `Issue`, `IssueKind`                                                                             | `engine/graph/plan/mod.rs:103-124`, `PlanIssue` (22)                                                                          | adapted | 30    |
| `pipeline` (milestone 6's file) | `MissingChange`, `InvalidChange`                                                                 | two more cases of `PreparationError`                                                                                          | adapted | 10    |
| `issues.rs`                     | `write`                                                                                          | none                                                                                                                          | new     | 30    |
| `mod.rs`                        | `run_pipelines`, `collect_changes`, `PreparedTables`, `Changes`                                  | modelled on `tests/integrations/graph/aviation/mod.rs:63` (repository root) and labs `engine/candidate.rs:40-162`, `:315-399` | new     | 220   |
| `incremental/mod.rs`            | `prepare_incremental`, `prepare`, `one_table_per_pipeline`, `captured_tables`, the failure table | none                                                                                                                          | new     | 130   |

Adapted 370, new 380, total 750.

## Tests

**The test definition** is the aviation example as it is: two tables, aircraft and airfields, and a link from an aircraft to its home airfield. The link needs no join. An aircraft row holds the key of its airfield, and an entity id is derived from the entity type and that key alone, so the link's far end is known without reading the airfields table.

**Moved with the code, adapted where the code is:**

- `staging_composite_keys`, `staging_invalid_columns`, `staging_empty_source` from `engine/tests/pipeline.rs`. Each now loads a small capture table with a `_change` column first, because `stage` reads a loaded table and not a query. `staging_composite_keys` then checks `_op` against `_change` and `_seq` against the order of the rows, where it checked for `'snapshot'`. `staging_empty_source` expects the columns `_op`, `_key`, `_seq`, `ID`. The row count that `stage_table` returned is checked with a query.
- `plan_aviation` from `engine/graph/plan/tests.rs`. Its rows are built by hand, and get an `_op` and a `_seq` column. Its snapshot becomes one of sync table rows for the same rows: the same ids, the same properties, the same issues.

**New, four tests:**

1. A capture file without `_change`, one with another value in it, a definition whose pipeline reads a second table, and an SQL step that fails: each fails for good, and `run.json` gets the `failure` part with the code of its step and a message that names the cause. Four cases of one test.
2. Insert, update and delete rows become create, update and archive changes, for an entity and for a link. Each carries the `_seq` of its row, and an archive carries no properties. The two ends of a link are the ids of the entities that the same rows create. `engine` checks that last point in `link_endpoints_match_entities`, which cannot move as it is.
3. The stage as a whole, on the aviation definition with a capture file per table and three kinds of change: the rows are in the sync table, the issues file is in the bucket, and the `prepare` part has the right counts.
4. The stage run twice leaves each row in the sync table once.

Tests 3 and 4 need a MinIO container, because they write the sync table. Test 1 runs the stage on the in-memory store, with a run that was started and captured. Test 2 and the moved tests need no store.

Not tested on their own: `captured_tables`, `run_pipelines`, `collect_changes` and the writing of the issues file. Tests 3 and 4 go through all of them.

## What was stripped

- The source checks for row counts, empty and unique columns in staging: 56 lines of `check_assertions`, with two tests.
- `GraphPlan`, `FinishedPlan`, `PlannedWrite` and `Payload` from `engine/graph/plan/mod.rs`: about 190 lines. The plan no longer holds encoded requests and no longer refuses a second write to an entity.

## Open points

- **Fact:** `_op` and `_seq` are read from a row's values by their position. `SinkRow` has no function for them and gets none.
- **Fact, to be shown by the adapted `staging_composite_keys`:** `_seq` is DuckDB's `rowid` of the loaded capture table. It follows the order of the file as long as the file is loaded in one piece, which `load_capture` does.
- **Fact:** the aviation example has two tables and no join (`definition/examples/aviation.yaml:14-28`, `:58-63`). Its link reads the aircraft table only.
- **Chosen:** four failure codes, one per step, in place of one per kind of error. The message in the `failure` part says what went wrong.
- **Chosen:** `PreparePart.rows` is the number of rows written to the sync table, not the number of captured rows.
- **Chosen:** `_change` is cast to text when it is copied into `_op`. A Parquet column can hold text in a form DuckDB does not report as `VARCHAR`, and the check after each SQL step requires `VARCHAR`.
- **Chosen:** a row whose `_op` is no longer one of the three values after the SQL steps fails the run. It is not turned into an issue, because the kind of change of every row in that table is then in doubt.
- **Chosen:** a link's update row with no properties gets an empty set. Send then adds no property and removes none.
- **Chosen:** the names `_capture/{source}` and `_source/{source}` for the two tables are those of `engine`.
- **Decided:** D1, D2, D3, see `decisions.md`.
- **Decided:** D12, a failed SQL step is a permanent failure.
- **Decided:** D13, the kind of change is read in the shared step. D14, a run carries several tables, and a pipeline that reads a second one is refused.
