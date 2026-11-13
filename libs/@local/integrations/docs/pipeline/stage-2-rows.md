# Stage 2, steps 2 and 3: rows, content hash and entity ID

**Implementation guidance.** Follow [04-implementation-workflow.md](04-implementation-workflow.md) and [RUST_DESIGN_GUIDELINES.md](RUST_DESIGN_GUIDELINES.md). Stage/step contracts, shared APIs, persisted schemas and behavior remain mandatory. Private functions, local signatures, file layouts and pseudocode are orientation and may be simplified. Test tables are a case inventory; the workflow defines the high-value initial acceptance set.

This file specifies the function `prepare_rows` of the contracts' section "Inside stage 2" and all code below it. [`01-contracts.md`](01-contracts.md) fixes the shared types, the stage signatures and the columns of each target's table. [`shared-run.md`](shared-run.md) specifies the shared `run` module, including `Code` and the error mapping functions. `stage-2-diff.md` specifies the stage function `diff`, the parsing of the definition, the opening and closing of the workspace, step 4 and the files of checkpoint 2.

Paths are relative to `libs/@local/integrations/` unless they start with `tests/`. Line numbers refer to `origin/main` at `c47a17eed3`. A reference marked (checkout) refers to the branch `pe/be-1137-add-state-version-and-work-manifest-records`, which holds `engine/src/sources`, `engine/src/storage` and the function `literal` of `engine/src/sql.rs`.

Nothing in this file was compiled or run. Section 8 lists the DuckDB behaviour that the design depends on and that no existing test covers.

## 1. Purpose

Step 2 loads each capture file of checkpoint 1 into the stage's workspace, stages it with `_op` and `_key`, and runs the definition: the entity pipelines in dependency order, then the link pipelines. Step 3 gives every row of every sink and link pipeline a content hash in SQL and an entity ID in Rust. The hash is computed while each pipeline runs, as the contract "Inside stage 2" states. The result is one workspace table per target with the columns that "Inside stage 2" lists, and one table of the rows that have no ID. Step 4 reads only these tables and the `TargetRows` values that describe them.

## 2. Module layout

Steps 2 and 3 own the directory `engine/src/stage/diff/rows/`. The file `engine/src/stage/diff/mod.rs` belongs to `stage-2-diff.md`. It declares `mod rows;` and imports `rows::{prepare_rows, PreparedRows, TargetRows}`.

```text
engine/src/stage/diff/rows/
  mod.rs        prepare_rows; the contract types PreparedRows and TargetRows
  staging.rs    step 2: capture files to staged source tables
  pipelines.rs  step 2: the loop over entity pipelines and link pipelines; the sources each target reads
  ids.rs        step 3: the entity ID pass over one target and the target's final table
  columns.rs    the column names of a table; the columns a target's accessors read
  issues.rs     the issues table for rows without an ID
  tests.rs      the tests of section 7
```

| File | Item | Visibility |
| --- | --- | --- |
| `mod.rs` | `prepare_rows`, `PreparedRows`, `TargetRows` and their fields | `pub(super)`, so that `stage::diff` reads them. |
| `staging.rs` | `stage_sources` | `pub(super)` |
| `pipelines.rs` | `run_pipelines`, `PreparedTarget`, `IdSource` | `pub(super)` |
| `pipelines.rs` | `pipeline_input`, `pipeline_sources`, `link_sources`, `sink_target`, `link_target` | Private. |
| `ids.rs` | `assign_ids`, `IdentifiedTarget` | `pub(super)` |
| `ids.rs` | `ID_RANGE_ROWS`, `ENTITY_ID_COLUMNS`, `LINK_ID_COLUMNS`, `RowKeys`, `RowIds`, `row_keys`, `read_range`, `row_ids`, `entity_ids`, `link_ids`, `id_cells`, `load_ids`, `final_select` | Private. |
| `columns.rs` | `table_columns`, `property_columns`, `has_key` | `pub(super)` |
| `issues.rs` | `missing_select`, `issues_table`, `ISSUES_TABLE` | `pub(super)` |

Code outside this directory that steps 2 and 3 add or change:

| File | Item | Visibility |
| --- | --- | --- |
| `engine/src/entity_id.rs` | `source_id`, `derive_link_ids`, `LinkIds` | `pub(crate)` |
| `engine/src/entity_id.rs` | `LinkEndpoint`, moved from `engine/src/graph/mod.rs:67-71` | `pub`, exported from `engine/src/lib.rs` as today. |
| `engine/src/workspace/value.rs` (new file) | `text`, `clock`, `is_blank`, moved from `engine/src/graph/property/` | `pub(crate)` |
| `engine/src/pipeline/mod.rs` | `accessor_columns` | `pub(crate)` |
| `engine/src/workspace/connection/pipeline.rs` | `Connection::hashed_table`, `check_reserved` | Private to the file. |
| `engine/src/run/error.rs` | The variants `Code::CaptureMissing` and `Code::RowKey` (section 6) | `pub`, as `Code` is. |

### Rules of `Workspace` that every function follows

- Every SQL text is one `SELECT` statement. The only table functions are `range`, `generate_series` and `unnest` (`engine/src/workspace/mod.rs:122-125`, `engine/src/workspace/select.rs:14`, `:37`).
- A query cannot open a file. A Parquet file enters the workspace through `load_table` of the contracts' section "Tables as files" or through `Workspace::load_capture` (`engine/src/workspace/mod.rs:156`).
- `Workspace::create_table` replaces a table of the same name (`engine/src/workspace/connection/mod.rs:315`). `Workspace::load_capture` does the same (`engine/src/workspace/connection/capture.rs:170`). No method changes or deletes rows of a table, so a table keeps its rows until a function replaces it.
- `Workspace::query` returns all rows of a query in memory (`engine/src/workspace/connection/mod.rs:260-306`). Step 3 therefore reads row keys and ID values in ranges.
- An SQL step, a definition checkpoint, a sink and a link pipeline each write a table named `_step/{uuid v4}` (`engine/src/workspace/connection/pipeline.rs:240-242`). Such a table is found only through `PreparedPipeline::table`, `PreparedPipeline::checkpoints`, `PreparedSink::table` or `PreparedLink::table` (`engine/src/pipeline/mod.rs:74-88`, `:104-108`).

### Tables that steps 2 and 3 create

`{target}` is the display form of a `Target`, for example `entity/sink-aircraft`.

| Table | Creation | Content |
| --- | --- | --- |
| `_capture/{source}` | `stage_sources` creates it through `load_table`. | It holds the rows of one capture file. The name is the one `SourceReader::stage_sources` uses today (`engine/src/sources/mod.rs:309`, checkout). |
| `_source/{source}` | `stage_sources` creates it through `Workspace::stage_table`. | It holds `_op`, `_key` and the source's columns. The name is unchanged as well (`engine/src/sources/mod.rs:310`, checkout). |
| `_step/{uuid}` | `Workspace::prepare_pipeline` and `Workspace::prepare_link_pipeline` create it. | It holds the output of an SQL step, a definition checkpoint, or the hashed table of a target. |
| `_ids/{target}` | `assign_ids` creates it through `Workspace::load_capture`. | It holds one row per row of the target's hashed table: the row key and the IDs. |
| `_target/{target}` | `assign_ids` creates it through `Workspace::create_table`. | It is the final table of the target, named in `TargetRows::table`. |
| `_issues` | `issues_table` creates it. | It is the table named in `PreparedRows::issues`. |

Three terms are used below. The **hashed table** of a target is the table step 2 returns for it. It holds the target's rows and `_content_hash`. The **ID table** is `_ids/{target}`. The **final table** is `_target/{target}`.

## 3. Types

`PreparedRows` and `TargetRows` are given in full in "Inside stage 2". Both derive `Debug`. They do not leave stage 2.

```rust
// engine/src/stage/diff/rows/pipelines.rs
use hash_integrations_definition::LinkEndpoint as EndpointColumn;

/// A sink or a link pipeline after step 2.
#[derive(Debug)]
pub(super) struct PreparedTarget {
    /// The sink's step ID or the link pipeline's ID, with its kind.
    pub(super) target: Target,
    /// The hashed table: the target's rows and `_content_hash`.
    pub(super) table: Box<str>,
    /// The columns and types the IDs of a row are derived from.
    pub(super) ids: IdSource,
    /// The target's property accessors.
    pub(super) properties: Properties,
    /// The captured sources the target reads.
    pub(super) sources: BTreeSet<SourceName>,
}

/// The columns and types that the IDs of a target's rows are derived from.
#[derive(Debug)]
pub(super) enum IdSource {
    /// A sink: the entity type and the `entity_id` column of the `EntitySink`.
    Entity { entity_type: VersionedUrl, column: ColumnName },
    /// A link pipeline: the link type and the `from` and `to` endpoints of the `LinkPipeline`.
    Link { link_type: VersionedUrl, from: EndpointColumn, to: EndpointColumn },
}
```

`EndpointColumn` is the definition crate's `LinkEndpoint` with the fields `entity_type` and `column` (`definition/src/link.rs:68-72`). The alias keeps it apart from the engine's `LinkEndpoint<'a>` with the fields `entity_type` and `source_id`.

```rust
// engine/src/stage/diff/rows/ids.rs

/// The number of row keys one range query covers.
const ID_RANGE_ROWS: u64 = 65_536;

/// The columns of the ID file of a sink.
const ENTITY_ID_COLUMNS: [Column; 3] = [
    Column { name: "_row", kind: ColumnKind::UInt64, nullable: false },
    Column { name: "_entity_id", kind: ColumnKind::Text, nullable: true },
    Column { name: "_source_id", kind: ColumnKind::Text, nullable: true },
];

/// The columns of the ID file of a link pipeline.
const LINK_ID_COLUMNS: [Column; 5] = [
    Column { name: "_row", kind: ColumnKind::UInt64, nullable: false },
    Column { name: "_entity_id", kind: ColumnKind::Text, nullable: true },
    Column { name: "_source_id", kind: ColumnKind::Text, nullable: true },
    Column { name: "_left_entity_id", kind: ColumnKind::Text, nullable: true },
    Column { name: "_right_entity_id", kind: ColumnKind::Text, nullable: true },
];

/// The row count and the lowest and highest row key of a table that has rows.
struct RowKeys {
    /// The number of rows of the table.
    rows: u64,
    /// The lowest `rowid`.
    first: u64,
    /// The highest `rowid`.
    last: u64,
}

/// The IDs derived for one row.
struct RowIds {
    /// The entity ID of the row's entity or link.
    entity_id: EntityId,
    /// The text the UUID of `entity_id` was derived from.
    source_id: String,
    /// The entity IDs of the left and right endpoint. `None` for a sink.
    endpoints: Option<(EntityId, EntityId)>,
}

/// One target after step 3.
#[derive(Debug)]
pub(super) struct IdentifiedTarget {
    /// The description of the target's final table.
    pub(super) rows: TargetRows,
    /// The `SELECT` that returns the target's rows of the issues table. `None` when every row has an ID.
    pub(super) missing: Option<Box<str>>,
}
```

```rust
// engine/src/entity_id.rs

/// One end of a link: the entity of `entity_type` that `source_id` identifies in the source.
#[derive(Debug, Clone, Copy)]
pub struct LinkEndpoint<'a> {
    pub entity_type: &'a VersionedUrl,
    pub source_id: &'a str,
}

/// The IDs of a link and of the two entities it connects.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LinkIds {
    /// The entity ID of the link.
    pub(crate) link_id: EntityId,
    /// The entity ID of the entity the link starts at.
    pub(crate) left_entity_id: EntityId,
    /// The entity ID of the entity the link ends at.
    pub(crate) right_entity_id: EntityId,
    /// The text the link's UUID was derived from.
    pub(crate) source_id: String,
}
```

This spec uses these items of `run/target.rs`. The contract "Shared types" names them, and `shared-run.md` section 3.2 gives their signatures:

```rust
impl Target {
    pub fn entity(step: &StepId) -> Self;
    pub fn link(link: &LinkId) -> Self;
    pub const fn kind(&self) -> Kind;
    pub fn id(&self) -> &str;
}

impl Kind {
    /// Returns `"entity"` or `"link"`.
    pub const fn as_str(self) -> &'static str;
}
```

## 4. Functions

Errors are built with the functions of `run/error.rs` (`shared-run.md` section 4.2). `Code::X.report()` builds a new report with the code `X` and its kind. `error::artifact`, `error::capture`, `error::statement`, `error::preparation` and `error::scratch` map the report of an existing error type, and the functions of this file call them in `map_err`. Section 6 lists the codes that steps 2 and 3 add.

Functions that perform significant work carry `#[tracing::instrument(level = "debug", skip_all)]`; private forwarding helpers need no separate span, as `SourceReader::stage_sources` does today (`engine/src/sources/mod.rs:294`, checkout). A function that works on one target records `target = %target` as a span field. No function logs or attaches a source ID or another row value, because the `issues` file holds no row values (contracts, "`issues`").

### 4.1 `prepare_rows`

```rust
// engine/src/stage/diff/rows/mod.rs
pub(super) async fn prepare_rows(
    context: &RunContext,
    workspace: &Workspace,
    input: &RunInput,
    definition: Option<&Definition>,
    capture: &CaptureOutput,
) -> Result<PreparedRows, Report<StageError>>;
```

What the caller provides (contract "Inside stage 2"):

- `definition` is the result of `input.parse_definition()`. The caller parses the text once. `prepare_rows` does not parse it again.
- `workspace` is the workspace the caller opened with `context.open_workspace(variables)`, where `variables` are `Definition::variables()` of `definition`, because step SQL reads them as `$NAME` parameters.
- `capture` is the `CaptureOutput` of the same run.

The function reads `definition`, `input.web` and `input.namespace`. Steps 2 and 3 are the same for every operation: for a restore or a reconcile, `start` and stage 1 have already put the target run's definition and capture files into `input` and `capture`.

Steps:

1. When `definition` is `None`, create the empty issues table and return no targets. This is the restore to empty. No capture file is loaded and no other table is created.
2. Call `stage_sources`.
3. Call `run_pipelines`.
4. Call `assign_ids` for each prepared target, in the order `run_pipelines` returned them.
5. Call `issues_table` with the `missing` selects of all targets.
6. Return the `TargetRows` values in the same order, and the name of the issues table.

```rust
pub(super) async fn prepare_rows(context, workspace, input, definition, capture) -> Result<PreparedRows, Report<StageError>> {
    let Some(definition) = definition else {
        let issues = issues_table(workspace, &[]).await?;
        return Ok(PreparedRows { targets: Vec::new(), issues });
    };

    let staged = stage_sources(context, workspace, definition, capture).await?;
    let prepared = run_pipelines(workspace, definition, &staged).await?;

    let mut targets = Vec::with_capacity(prepared.len());
    let mut missing = Vec::new();
    for target in prepared {
        let identified = assign_ids(context, workspace, input.web, &input.namespace, target).await?;
        missing.extend(identified.missing);
        targets.push(identified.rows);
    }
    let issues = issues_table(workspace, &missing).await?;
    Ok(PreparedRows { targets, issues })
}
```

The order of `PreparedRows::targets` is: the sinks of the entity pipelines in the order `Definition::entity_pipelines()` returns the pipelines (`definition/src/definition/mod.rs:109`), within one pipeline in the order of `PreparedPipeline::sinks`, then the link pipelines in the order of `Definition::link_pipelines()` (`definition/src/definition/mod.rs:114`).

A second call in the same workspace writes new `_step/{uuid}` tables, replaces every other table of section 2, and returns equal content.

Errors: every error comes from the functions below. A definition that does not parse fails in the caller with `invalid_definition`.

### 4.2 `stage_sources`

```rust
// engine/src/stage/diff/rows/staging.rs
/// Loads each capture file and stages it with `_op` and `_key`. Returns the staged table of each captured source.
pub(super) async fn stage_sources(
    context: &RunContext,
    workspace: &Workspace,
    definition: &Definition,
    capture: &CaptureOutput,
) -> Result<BTreeMap<SourceName, Box<str>>, Report<StageError>>;
```

This function replaces `SourceReader::stage_sources` (`engine/src/sources/mod.rs:295-327`, checkout), which is removed. The old function takes `&SourceCaptures`, a value that only `capture_sources` builds and that has no public accessor (`engine/src/sources/mod.rs:171-175`, checkout). Stage 2 starts from the `ArtifactRef` of each source in `CaptureOutput::sources`. The body keeps the old function's two steps per source and its table names.

Steps, for each entry of `Definition::sources()` in name order (`definition/src/definition/mod.rs:97`):

1. Skip a source without a primary key. `Source::primary_key` returns `None` only for a source of kind `Checkpoint` (`definition/src/source/mod.rs:150-158`).
2. Look the source up in `capture.sources`.
3. Load its file into `_capture/{name}` with `load_table`.
4. Stage `SELECT * FROM "_capture/{name}"` as `_source/{name}` with `Workspace::stage_table` (`engine/src/workspace/mod.rs:268`), the source's primary key and `TableAssertions::default()`.

```rust
pub(super) async fn stage_sources(context, workspace, definition, capture) -> Result<BTreeMap<SourceName, Box<str>>, Report<StageError>> {
    let mut tables = BTreeMap::new();
    for (name, source) in definition.sources() {
        let Some(primary_key) = source.primary_key() else { continue };
        let captured = capture.sources.get(name)
            .ok_or_else(|| Code::CaptureMissing.report())?;
        let raw = format!("_capture/{name}");
        let staged = format!("_source/{name}");
        load_table(context, workspace, &captured.file, raw.clone().into_boxed_str()).await?;
        workspace
            .stage_table(
                staged.clone().into_boxed_str(),
                format!("SELECT * FROM {}", Identifier::new(&raw)).into_boxed_str(),
                primary_key.clone(),
                TableAssertions::default(),
            )
            .await
            .map_err(error::preparation)?;
        tables.insert(name.clone(), staged.into_boxed_str());
    }
    Ok(tables)
}
```

`Workspace::stage_table` generates this statement (`engine/src/workspace/connection/staging.rs:105-112`). For the source `aircraft` of the aviation example:

```sql
SELECT 'snapshot' AS _op, to_json(struct_pack("TAIL" := "TAIL"))::VARCHAR AS _key, source.* FROM (SELECT * FROM "_capture/aircraft") AS source
```

The row with `TAIL = 'SE-XXX'` gets `_key = '{"TAIL":"SE-XXX"}'`. A capture file without rows keeps its columns (`engine/src/workspace/mod.rs:147`), so its staged table has the source's columns and no rows.

Errors:

| Condition | Kind | Code |
| --- | --- | --- |
| A source with a primary key has no entry in `capture.sources`. | `Permanent` | `capture_missing` |
| The capture has a column named `_op`, `_key` or `_content_hash` in any letter case (`engine/src/workspace/connection/staging.rs:75-84`). | `Permanent` | `reserved_column`, as the contract "Reserved column names" requires. `error::preparation` preserves that code through `PreparationError::Step` wrappers, as specified in shared-run section 4.2. |
| The capture lacks a primary key column (`engine/src/workspace/connection/staging.rs:85-94`). | `Permanent` | `query_invalid`, from `error::preparation` for `PreparationError::MissingColumn`. |
| `load_table` fails. | As `shared-run.md` sections 4.7 and 6 give it. | |
| Another `PreparationError`. | As `error::preparation` maps it (`shared-run.md` section 6). | |

### 4.3 `run_pipelines`

```rust
// engine/src/stage/diff/rows/pipelines.rs
/// Runs every entity pipeline in dependency order, then every link pipeline, and returns one prepared target per sink and link pipeline.
pub(super) async fn run_pipelines(
    workspace: &Workspace,
    definition: &Definition,
    staged: &BTreeMap<SourceName, Box<str>>,
) -> Result<Vec<PreparedTarget>, Report<StageError>>;
```

This is the loop that exists today only in tests (`tests/integrations/graph/aviation/mod.rs:74-137`, `engine/tests/pipeline.rs:507-574`). The engine version adds two things the aviation test lacks: the input of a pipeline whose source is of kind `Checkpoint`, and the set of sources each target reads.

Facts of the definition crate the loop depends on:

- `Definition::entity_pipelines()` returns each pipeline after the pipelines it depends on (`definition/src/definition/mod.rs:106-111`).
- A pipeline depends on the producer of each definition checkpoint in its `inputs` and on the producer of the definition checkpoint that its source of kind `Checkpoint` names (`definition/src/definition/check.rs:268-284`). When a pipeline runs, every definition checkpoint it reads is therefore in the map of finished checkpoints.
- Every source has exactly one entity pipeline (`definition/src/definition/check.rs:52-62`, `:73-83`).
- Every definition checkpoint a link pipeline reads has a producer (`definition/src/definition/check.rs:157-187`).

Steps:

1. Keep two maps: `checkpoints`, from the name of a definition checkpoint to its table, and `read`, from the name of a definition checkpoint to the captured sources the pipeline that produced it reads.
2. For each entity pipeline:
   1. Take its input table with `pipeline_input`.
   2. Take the sources it reads with `pipeline_sources`.
   3. Call `Workspace::prepare_pipeline` (`engine/src/workspace/mod.rs:297`) with a copy of `checkpoints`.
   4. Enter the pipeline's sources into `read` under each definition checkpoint the pipeline produced, and add the produced checkpoints to `checkpoints`.
   5. Add one `PreparedTarget` per `PreparedSink`.
3. For each link pipeline:
   1. Take the sources it reads with `link_sources`.
   2. Call `Workspace::prepare_link_pipeline` (`engine/src/workspace/mod.rs:322`) with a copy of `checkpoints`.
   3. Add one `PreparedTarget`.

```rust
pub(super) async fn run_pipelines(workspace, definition, staged) -> Result<Vec<PreparedTarget>, Report<StageError>> {
    let mut checkpoints: BTreeMap<CheckpointName, Box<str>> = BTreeMap::new();
    let mut read: BTreeMap<CheckpointName, BTreeSet<SourceName>> = BTreeMap::new();
    let mut targets = Vec::new();

    for pipeline in definition.entity_pipelines() {
        let input = pipeline_input(definition, pipeline, staged, &checkpoints)?;
        let sources = pipeline_sources(definition, pipeline, &read);
        let prepared = workspace
            .prepare_pipeline(pipeline.clone(), input, checkpoints.clone())
            .await
            .map_err(error::preparation)?;
        for name in prepared.checkpoints.keys() {
            read.insert(name.clone(), sources.clone());
        }
        checkpoints.extend(prepared.checkpoints);
        targets.extend(prepared.sinks.into_iter().map(|sink| sink_target(sink, &sources)));
    }

    for link in definition.link_pipelines() {
        let sources = link_sources(link, &read);
        let prepared = workspace
            .prepare_link_pipeline(link.clone(), checkpoints.clone())
            .await
            .map_err(error::preparation)?;
        targets.push(link_target(prepared, sources));
    }
    Ok(targets)
}

/// Returns the table an entity pipeline starts from.
fn pipeline_input(definition, pipeline, staged, checkpoints) -> Result<Box<str>, Report<StageError>> {
    let source = definition.sources().get(&pipeline.source)
        .ok_or_else(|| Code::InvalidDefinition.report())?;
    match source.checkpoint() {
        Some(checkpoint) => checkpoints.get(checkpoint).cloned()
            .ok_or_else(|| Code::QueryInvalid.report()),
        None => staged.get(&pipeline.source).cloned()
            .ok_or_else(|| Code::CaptureMissing.report()),
    }
}

/// Returns the captured sources an entity pipeline reads.
fn pipeline_sources(definition, pipeline, read) -> BTreeSet<SourceName> {
    let mut sources = BTreeSet::new();
    match definition.sources().get(&pipeline.source).and_then(Source::checkpoint) {
        Some(checkpoint) => sources.extend(read.get(checkpoint).into_iter().flatten().cloned()),
        None => { sources.insert(pipeline.source.clone()); }
    }
    for checkpoint in pipeline.inputs.values() {
        sources.extend(read.get(checkpoint).into_iter().flatten().cloned());
    }
    sources
}

/// Returns the captured sources a link pipeline reads.
fn link_sources(link, read) -> BTreeSet<SourceName> {
    let inputs: Vec<&CheckpointName> = match &link.input {
        LinkInput::Checkpoint(checkpoint) => vec![checkpoint],
        LinkInput::Inputs(inputs) => inputs.iter().map(|(_, checkpoint)| checkpoint).collect(),
    };
    inputs.into_iter()
        .flat_map(|checkpoint| read.get(checkpoint).into_iter().flatten().cloned())
        .collect()
}

fn sink_target(sink: PreparedSink, sources: &BTreeSet<SourceName>) -> PreparedTarget {
    PreparedTarget {
        target: Target::entity(&sink.step),
        table: sink.table,
        ids: IdSource::Entity { entity_type: sink.sink.entity_type, column: sink.sink.entity_id },
        properties: sink.sink.properties,
        sources: sources.clone(),
    }
}

fn link_target(prepared: PreparedLink, sources: BTreeSet<SourceName>) -> PreparedTarget {
    let LinkPipeline { id, from, to, link_type, properties, .. } = prepared.pipeline;
    PreparedTarget {
        target: Target::link(&id),
        table: prepared.table,
        ids: IdSource::Link { link_type, from, to },
        properties,
        sources,
    }
}
```

**The input of a pipeline.** A pipeline whose source is of kind `Checkpoint` starts from the table of that definition checkpoint. The table is passed as it is. `Workspace::prepare_pipeline` checks that it has `_op` and `_key` (`engine/src/workspace/connection/pipeline.rs:109`) and writes each step's output to a new table, so the checkpoint's table keeps its rows. Every other pipeline starts from `_source/{source}`.

**The sources a target reads (`TargetRows::sources`).** The set is the one the contract "Guards" defines for source coverage: the captured sources on the target's data path, through all producers, where a source of kind `Checkpoint` stands for the sources of the pipeline that produces its definition checkpoint. The set holds source names that have an entry in `CaptureOutput::sources`. It is built like this:

- An entity pipeline reads its own source when that source is captured. When its source is of kind `Checkpoint`, it reads the sources of the pipeline that produces that definition checkpoint.
- An entity pipeline also reads the sources of the pipeline that produces each definition checkpoint in its `inputs`.
- A sink reads the sources of its pipeline.
- A link pipeline reads the sources of the pipelines that produce its input definition checkpoints.

A producer's set was built by the same rules, so the set of a target holds every captured source on the path of its data.

`dependsOn` adds no source. It orders the pipelines, and an SQL step can read only `input` and the aliases of `inputs` (`engine/src/workspace/connection/pipeline.rs:24-53`).

For the aviation example the sets are `{airfields}` for `entity/sink-airfields` and `{aircraft}` for `entity/sink-aircraft` and for `link/aircraft-based-at`.

Errors:

| Condition | Kind | Code |
| --- | --- | --- |
| A pipeline's source is not declared. `Definition::new` refuses such a definition (`definition/src/definition/check.rs:44-51`). | `Permanent` | `invalid_definition` |
| A definition checkpoint is not in `checkpoints`. The run order prevents this. | `Permanent` | `query_invalid`, the code `error::preparation` gives `PreparationError::MissingCheckpoint`. |
| A captured source has no staged table. `stage_sources` prevents this. | `Permanent` | `capture_missing` |
| `prepare_pipeline` or `prepare_link_pipeline` fails. | As `error::preparation` maps it (`shared-run.md` section 6). | |

### 4.4 Step 3, the content hash

The hash is the one of the contracts' section "Content hash". As "Inside stage 2" states, it is computed while a pipeline runs, inside `Workspace::prepare_pipeline` and `Workspace::prepare_link_pipeline`, because the expression builder needs the column types that only the private `Connection::describe` returns (`engine/src/workspace/connection/staging.rs:36-56`). A sink has the hash today. A link pipeline gets it through the same code.

**`accessor_columns`** replaces the two lists of accessor columns that exist today (`engine/src/workspace/connection/pipeline.rs:213-223` and `:280-286`):

```rust
// engine/src/pipeline/mod.rs
/// Returns each column the accessors of `properties` read, in property order, with whether the
/// accessor reads the column unchanged.
pub(crate) fn accessor_columns(properties: &Properties) -> impl Iterator<Item = (&ColumnName, bool)> {
    properties.iter().flat_map(|(_, accessor)| match accessor {
        Accessor::Column(column) => [Some((column, true)), None],
        Accessor::Coerce { column, .. } => [Some((column, false)), None],
        Accessor::Measure { amount, unit, .. } => [Some((amount, false)), Some((unit, false))],
    }).flatten()
}
```

Property order is the order of `Properties::iter`, which is sorted by property type URL (`definition/src/step.rs:105`, `:128-130`). A measure accessor gives its amount column, then its unit column. This closes labs defect 8 (`reference/labs.md`, Part D): the labs link hash covers only the amount column.

**`check_reserved`** applies the contract "Reserved column names". `RESERVED` holds the ten names of that contract. The table that `hashed_table` reads keeps the columns `_op` and `_key` that staging adds, so `check_reserved` accepts those two names and refuses a column with any of the other eight:

```rust
// engine/src/workspace/connection/pipeline.rs
const RESERVED: [&str; 10] = [
    "_op", "_key", "_content_hash", "_entity_id", "_source_id", "_left_entity_id",
    "_right_entity_id", "_row", "_change", "rowid",
];

/// The reserved columns that staging adds and a target's table keeps.
const STAGED: [&str; 2] = ["_op", "_key"];

/// Refuses a table that has a column with a reserved name, other than the columns staging adds.
fn check_reserved(schema: &[(String, String)]) -> Result<(), Report<PreparationError>> {
    for (column, _) in schema {
        let reserved = RESERVED.iter().any(|name| column.eq_ignore_ascii_case(name));
        let staged = STAGED.iter().any(|name| column.eq_ignore_ascii_case(name));
        if reserved && !staged {
            return Err(Report::new(PreparationError::ReservedColumn { column: column.clone().into_boxed_str() }));
        }
    }
    Ok(())
}
```

The accessor-name rule is separate from this table-schema check. `check_properties` first scans all accessor names against `RESERVED`, ignoring ASCII case, and returns `PreparationError::ReservedColumn` for a match. Only after that pass does it check whether the columns exist. Both `Execution::sink` and `Connection::prepare_link_pipeline` already call `check_properties` before `hashed_table`, so this ordering rejects even an absent reserved accessor such as `_row` with the required code. It runs for empty tables too. `_key` and `_op` remain allowed as table metadata but forbidden as property inputs. A non-reserved SQL alias is the explicit way to map a metadata value as a property.

Staging refuses `_op`, `_key` and `_content_hash` on a source (`engine/src/workspace/connection/staging.rs:75-84`). An SQL step can still add a column with one of the other names. A column named `rowid` hides DuckDB's `rowid`, which step 3 uses as the row key. `prepare_pipeline` checks `_op` and `_key` after every SQL step (`engine/src/workspace/connection/pipeline.rs:183`). A link step is not checked for them (section 4.8), so a column `_op` or `_key` that a link step produces is accepted as the staging column.

**`Connection::hashed_table`** is the body that `Execution::sink` has today (`engine/src/workspace/connection/pipeline.rs:224-235`), with the reserved check:

```rust
impl Connection {
    /// Copies `input` into a new table with `_content_hash` over the columns `properties` read.
    fn hashed_table(
        &self,
        input: &str,
        properties: &Properties,
        schema: &[(String, String)],
    ) -> Result<Box<str>, Report<PreparationError>> {
        check_reserved(schema)?;
        let columns = accessor_columns(properties).map(|(column, plain)| (column.as_ref(), plain));
        let hash = hash_expression(columns, schema)?;
        let table = table_name();
        self.create_table(
            &table,
            &format!("SELECT source.*, {hash} AS _content_hash FROM {} AS source", Identifier::new(input)),
        )
        .change_context(PreparationError::Statement)?;
        Ok(table)
    }
}
```

`hash_expression` is used as it is (`engine/src/workspace/connection/pipeline.rs:245-273`). It builds `md5(struct_pack(p0 := …, p1 := …)::VARCHAR)`. A column read unchanged whose DuckDB type is `VARCHAR` enters as `nullif(trim("c"), '')`. Every other column enters as `"c"`. Without properties the expression is `md5('')`, which is `d41d8cd98f00b204e9800998ecf8427e`.

**`Execution::sink`** (`engine/src/workspace/connection/pipeline.rs:207-236`) keeps its signature. Its body becomes: describe the input, `check_column` for the `entity_id` column, `check_properties`, then `self.connection.hashed_table(input, &sink.properties, &schema)`.

**`Connection::prepare_link_pipeline`** (`engine/src/workspace/connection/pipeline.rs:57-101`) keeps its signature. After the checks of the `from` column, the `to` column and the properties (`:92-96`), it calls `self.hashed_table(&table, &request.pipeline.properties, &schema)` and returns that table in `PreparedLink::table`. A link pipeline without steps therefore returns a copy of its input checkpoint's table with `_content_hash`, and the checkpoint's table stays unchanged.

`check_properties` (`engine/src/workspace/connection/pipeline.rs:276-291`) keeps its signature. It first scans `accessor_columns` for reserved names, then checks column existence; it does not combine these passes in a way that hides a reserved accessor behind an earlier missing-column error.

Generated statements for the aviation example:

```sql
-- entity/sink-airfields
SELECT source.*, md5(struct_pack(p0 := nullif(trim("FIELD_NAME"), ''))::VARCHAR) AS _content_hash FROM "_source/airfields" AS source

-- entity/sink-aircraft: empty-mass (amount, unit), first-flight, model
SELECT source.*, md5(struct_pack(p0 := "EMPTY_MASS", p1 := "MASS_UNIT", p2 := "FIRST_FLIGHT", p3 := nullif(trim("MODEL"), ''))::VARCHAR) AS _content_hash FROM "_source/aircraft" AS source

-- link/aircraft-based-at: no properties
SELECT source.*, md5('') AS _content_hash FROM "_step/{uuid of the checkpoint aviation/aircraft}" AS source
```

Errors: `PreparationError::ReservedColumn` for a reserved column, `PreparationError::MissingColumn` for a column an accessor reads and the table lacks, `PreparationError::Statement` for a failed statement. `error::preparation` maps them (`shared-run.md` section 6). The shared mapper returns `reserved_column` for the first, including when `PreparationError::Step` wraps it.

### 4.5 Step 3, the functions of `engine/src/entity_id.rs`

Step 3 derives IDs with the code the planner uses today. That code is private to `graph`, so it moves:

- `value::text` and its helpers move from `engine/src/graph/property/value.rs` to the new file `engine/src/workspace/value.rs`. `is_blank` moves there from `engine/src/graph/property/mod.rs:268-272`. Section 5 lists each item.
- The logic of `SinkRow::text` (`engine/src/graph/property/mod.rs:116-123`) becomes `source_id`.
- The derivation in `LinkUpsert::new` (`engine/src/graph/mod.rs:100-112`) becomes `derive_link_ids`.

The planner of stage 3 reads `_entity_id`, `_left_entity_id` and `_right_entity_id` from the `changes` file and calls none of these functions. Until the stage 3 change lands, `SinkRow::text` and `LinkUpsert::new` call the moved functions, so both paths give the same IDs.

```rust
// engine/src/entity_id.rs
use crate::workspace::value::{is_blank, text};

/// Returns the text that identifies a record, read from the value of an ID column, or `None`
/// if the value is null, blank text, or has no text form.
///
/// The text is not trimmed, as it identifies a record across runs.
#[must_use]
pub(crate) fn source_id(value: &Value) -> Option<String> {
    if is_blank(value) {
        return None;
    }
    text(value)
}

/// Derives the IDs of the link of `link_type` from `left` to `right`, and of both endpoints.
#[must_use]
pub(crate) fn derive_link_ids(
    web_id: WebId,
    namespace: &str,
    link_type: &VersionedUrl,
    left: LinkEndpoint<'_>,
    right: LinkEndpoint<'_>,
) -> LinkIds {
    let source_id = format!(
        "{}::{}::{}::{}",
        left.entity_type, left.source_id, right.entity_type, right.source_id
    );
    LinkIds {
        link_id: derive_entity_id(web_id, namespace, link_type, &source_id),
        left_entity_id: derive_entity_id(web_id, namespace, left.entity_type, left.source_id),
        right_entity_id: derive_entity_id(web_id, namespace, right.entity_type, right.source_id),
        source_id,
    }
}
```

What `source_id` returns, by the type of the value (`engine/src/graph/property/value.rs:154-191`, `engine/src/graph/property/mod.rs:268-272`):

| Value | Result |
| --- | --- |
| `NULL`; text or an enum value that is empty or only whitespace; a union that holds one of these | `None` |
| Text or an enum value | The text as it is, with its leading and trailing whitespace. |
| An integer of any width | Its decimal digits. |
| `FLOAT`, `DOUBLE` | Rust's shortest text for the number as an `f64`: `1.0` gives `1`, `1.5` gives `1.5`. A `FLOAT` is widened to an `f64` first. A value that is not finite gives `None`. |
| `DECIMAL` | The number without the zeros its scale pads with: `8030.00` gives `8030`. |
| `BOOLEAN` | `true` or `false`. |
| `DATE` | `YYYY-MM-DD`. |
| `TIMESTAMP` | RFC 3339 in UTC: `2026-11-09T10:30:00Z`. |
| `TIME` | `HH:MM:SS`, with a fraction only when the value has one. |
| A list, an array, a struct, a map, a blob, a geometry, an interval | `None` |

For a link:

- The source ID is `"{from.entity_type}::{left}::{to.entity_type}::{right}"`. `left` and `right` are the `source_id` texts of the `from` column and the `to` column. The two types are the versioned type URLs of `LinkPipeline::from` and `LinkPipeline::to` (`definition/src/link.rs:82-83`).
- The link's entity ID is `derive_entity_id(web, namespace, link_type, source ID)`.
- The left endpoint's entity ID is `derive_entity_id(web, namespace, from.entity_type, left)`. The right endpoint's is `derive_entity_id(web, namespace, to.entity_type, right)`. Each equals the entity ID a sink of that entity type gives a row with the same ID text.

### 4.6 Step 3, `assign_ids`

```rust
// engine/src/stage/diff/rows/ids.rs
/// Derives the IDs of every row of one target and creates the target's final table.
pub(super) async fn assign_ids(
    context: &RunContext,
    workspace: &Workspace,
    web: WebId,
    namespace: &str,
    target: PreparedTarget,
) -> Result<IdentifiedTarget, Report<StageError>>;
```

**The row key** is DuckDB's `rowid` of the hashed table. Every hashed table is created by `Connection::hashed_table` with `CREATE OR REPLACE TABLE … AS SELECT` (`engine/src/workspace/connection/mod.rs:308-326`), so it is a base table. No workspace method changes the rows of a table, and nothing replaces a `_step/{uuid}` table, so a row keeps its `rowid` from the first range query to the join. `check_reserved` guarantees that no column of the table is named `rowid`. `SELECT source.*` does not return `rowid`.

Steps:

1. Read the column names of the hashed table with `table_columns` and resolve the target's `columns` with `property_columns` (4.7).
2. Create a `RowFile` with `ENTITY_ID_COLUMNS` for a sink or `LINK_ID_COLUMNS` for a link pipeline.
3. Read the row count and the lowest and highest row key with `row_keys`.
4. For each range of `ID_RANGE_ROWS` row keys from the lowest to the highest, read the row key and the ID column or columns with `read_range`. For each row, derive the IDs with `row_ids` and append one row to the file. A row without an ID is appended with `NULL` in every ID column and counted.
5. Fail when the number of rows read differs from the row count of step 3.
6. Close the file, load it into `_ids/{target}` with `Workspace::load_capture`, and remove the file.
7. Create `_target/{target}` with the join of `final_select`.
8. Build the `missing` select with `missing_select` (4.8) when at least one row has no ID.

```rust
pub(super) async fn assign_ids(context, workspace, web, namespace, target) -> Result<IdentifiedTarget, Report<StageError>> {
    let table_columns = table_columns(workspace, &target.table).await?;
    let columns = property_columns(&target.properties, &table_columns)?;

    let mut file = RowFile::create(context, match target.ids {
        IdSource::Entity { .. } => &ENTITY_ID_COLUMNS,
        IdSource::Link { .. } => &LINK_ID_COLUMNS,
    })?;
    let mut without_id = 0_u64;
    if let Some(keys) = row_keys(workspace, &target.table).await? {
        let mut read = 0_u64;
        let mut start = keys.first;
        while start <= keys.last {
            let end = start.saturating_add(ID_RANGE_ROWS);
            let rows = read_range(workspace, &target.table, &target.ids, start, end).await?;
            for values in rows.iter() {
                let (row, ids) = row_ids(&target.ids, web, namespace, values)?;
                without_id += u64::from(ids.is_none());
                file.push(&id_cells(&target.ids, row, ids.as_ref()))?;
                read += 1;
            }
            start = end;
        }
        if read != keys.rows {
            return Err(Code::RowKey.report());
        }
    }

    let ids_table: Box<str> = format!("_ids/{}", target.target).into();
    let final_table: Box<str> = format!("_target/{}", target.target).into();
    load_ids(workspace, file, ids_table.clone()).await?;
    workspace
        .create_table(final_table.clone(), final_select(&target, &ids_table).into_boxed_str())
        .await
        .map_err(error::statement)?;

    let missing = (without_id > 0).then(|| {
        missing_select(&target.target, &target.table, &ids_table, has_key(&table_columns))
    });
    Ok(IdentifiedTarget {
        rows: TargetRows {
            target: target.target,
            table: final_table,
            columns,
            sources: target.sources,
            without_id,
        },
        missing,
    })
}
```

`RowFile::create`, `push` and `close` write to disk on the calling thread. A target can push more than one batch of rows, so `assign_ids` calls `RowFile::create`, the derivation and pushes of each range, and the `close` in `load_ids` inside `tokio::task::spawn_blocking`, and maps a `JoinError` with `error::scratch` (`shared-run.md` section 4.7). The pseudocode leaves these calls out.

**`row_keys`** runs one query:

```sql
SELECT count(*) AS "rows", min(rowid) AS "first", max(rowid) AS "last" FROM "{hashed table}"
```

```rust
/// Returns the row count and the range of row keys of `table`, or `None` when it has no rows.
async fn row_keys(workspace: &Workspace, table: &str) -> Result<Option<RowKeys>, Report<StageError>> {
    let sql = format!(
        r#"SELECT count(*) AS "rows", min(rowid) AS "first", max(rowid) AS "last" FROM {}"#,
        Identifier::new(table)
    );
    let rows = workspace.query(sql.into_boxed_str()).await.map_err(error::statement)?;
    match rows.iter().next() {
        Some([Value::BigInt(0), ..]) => Ok(None),
        Some([Value::BigInt(rows), Value::BigInt(first), Value::BigInt(last)]) => Ok(Some(RowKeys {
            rows: unsigned(*rows)?, first: unsigned(*first)?, last: unsigned(*last)?,
        })),
        _ => Err(Code::RowKey.report()),
    }
}
```

`unsigned` converts an `i64` with `u64::try_from` and fails with `Code::RowKey.report()` for a negative number.

**`read_range`** runs one query per range. For a sink with the ID column `TAIL`:

```sql
SELECT rowid AS "_row", "TAIL" AS "id" FROM "{hashed table}" WHERE rowid >= {start} AND rowid < {end}
```

For a link pipeline with the `from` column `TAIL` and the `to` column `HOME_BASE`:

```sql
SELECT rowid AS "_row", "TAIL" AS "from", "HOME_BASE" AS "to" FROM "{hashed table}" WHERE rowid >= {start} AND rowid < {end}
```

```rust
/// Returns the row key and the ID values of the rows whose row key is in `start..end`.
async fn read_range(
    workspace: &Workspace,
    table: &str,
    ids: &IdSource,
    start: u64,
    end: u64,
) -> Result<Rows, Report<StageError>>;
```

Column names are written with `Identifier` (`engine/src/sql.rs:9`). DuckDB compares identifiers without regard to case, so the name from the definition finds the column in the table's spelling. `{start}` and `{end}` are written as decimal integers. The rows of a range have no order, and the function needs none.

**`row_ids`** reads one result row:

```rust
/// Returns the row key of `values` and the IDs derived from its ID values, or `None` for the
/// IDs when the row has none.
fn row_ids(
    ids: &IdSource,
    web: WebId,
    namespace: &str,
    values: &[Value],
) -> Result<(u64, Option<RowIds>), Report<StageError>> {
    let Some((Value::BigInt(row), id_values)) = values.split_first() else {
        return Err(Code::RowKey.report());
    };
    let derived = match (ids, id_values) {
        (IdSource::Entity { entity_type, .. }, [id]) => entity_ids(web, namespace, entity_type, id),
        (IdSource::Link { link_type, from, to }, [left, right]) => {
            link_ids(web, namespace, link_type, from, to, left, right)
        }
        _ => return Err(Code::RowKey.report()),
    };
    Ok((unsigned(*row)?, derived))
}

fn entity_ids(web: WebId, namespace: &str, entity_type: &VersionedUrl, id: &Value) -> Option<RowIds> {
    let source_id = source_id(id)?;
    Some(RowIds {
        entity_id: derive_entity_id(web, namespace, entity_type, &source_id),
        source_id,
        endpoints: None,
    })
}

fn link_ids(
    web: WebId,
    namespace: &str,
    link_type: &VersionedUrl,
    from: &EndpointColumn,
    to: &EndpointColumn,
    left: &Value,
    right: &Value,
) -> Option<RowIds> {
    let left = source_id(left)?;
    let right = source_id(right)?;
    let ids = derive_link_ids(
        web,
        namespace,
        link_type,
        LinkEndpoint { entity_type: &from.entity_type, source_id: &left },
        LinkEndpoint { entity_type: &to.entity_type, source_id: &right },
    );
    Some(RowIds {
        entity_id: ids.link_id,
        source_id: ids.source_id,
        endpoints: Some((ids.left_entity_id, ids.right_entity_id)),
    })
}
```

A sink row has no ID when `source_id` returns `None` for its ID column. A link row has no ID when `source_id` returns `None` for the `from` column or for the `to` column.

**`id_cells`** builds the row of the ID file:

| Target | Row has IDs | Cells |
| --- | --- | --- |
| Sink | Yes | `UInt(row)`, `Text(entity_id.to_string())`, `Text(source_id)` |
| Sink | No | `UInt(row)`, `Null`, `Null` |
| Link pipeline | Yes | `UInt(row)`, `Text(entity_id.to_string())`, `Text(source_id)`, `Text(left.to_string())`, `Text(right.to_string())` |
| Link pipeline | No | `UInt(row)`, `Null`, `Null`, `Null`, `Null` |

`EntityId` displays as `{web}~{uuid}` (`engine/tests/entity_id.rs:35-40`).

**`load_ids`** closes the file and loads it:

```rust
/// Loads the ID file into `table` and removes the file.
async fn load_ids(workspace: &Workspace, file: RowFile, table: Box<str>) -> Result<(), Report<StageError>> {
    let capture = file.close()?;
    let path = capture.path().to_owned();
    workspace.load_capture(capture, table).await.map_err(error::capture)?;
    if let Err(error) = tokio::fs::remove_file(&path).await {
        tracing::warn!(?error, "could not remove the entity ID file");
    }
    Ok(())
}
```

A target without rows pushes no row. The contract "Tables as files" makes a file with no rows a valid Parquet file with the declared columns, and `Workspace::load_capture` keeps the columns of such a file (`engine/src/workspace/mod.rs:147`). The same contract fixes the Arrow types and the writer settings: `Text` is written as `Utf8` and `UInt64` as `UInt64`, so DuckDB reads `_row` as `UBIGINT` and the ID columns as `VARCHAR` (`shared-run.md` section 4.7).

**`final_select`** builds the join. For a sink:

```sql
SELECT source.*, ids."_entity_id", ids."_source_id"
FROM "{hashed table}" AS source
JOIN "_ids/entity/sink-aircraft" AS ids ON source.rowid = CAST(ids."_row" AS BIGINT)
WHERE ids."_entity_id" IS NOT NULL
```

For a link pipeline:

```sql
SELECT source.*, ids."_entity_id", ids."_source_id", ids."_left_entity_id", ids."_right_entity_id"
FROM "{hashed table}" AS source
JOIN "_ids/link/aircraft-based-at" AS ids ON source.rowid = CAST(ids."_row" AS BIGINT)
WHERE ids."_entity_id" IS NOT NULL
```

```rust
/// Returns the `SELECT` that joins a target's hashed table with its ID table and leaves out the rows without an ID.
fn final_select(target: &PreparedTarget, ids_table: &str) -> String;
```

The final table has the columns of the hashed table in their order, which end with `_content_hash`, then `_entity_id`, `_source_id` and, for a link pipeline, `_left_entity_id` and `_right_entity_id`. The filter leaves no `NULL` in an ID column. `_content_hash` is never `NULL`, because `md5` of a struct's text is never `NULL`. DuckDB records no `NOT NULL` constraint on a table created from a `SELECT`.

**`_key` and `_source_id` for the `changes` file.** Step 4 writes `_source_id` and, when the target's table has one, `_key` into the `changes` file (contract "`changes`"). Both come from the final table. `_source_id` is always there. The final table keeps every column of the hashed table, so it has `_key` exactly when the hashed table has it:

- The table of an entity sink always has `_key`, because `prepare_pipeline` checks `_op` and `_key` after every SQL step (`engine/src/workspace/connection/pipeline.rs:183`).
- The table of a link pipeline without steps is a copy of a definition checkpoint, which an entity pipeline wrote, so it has `_key`.
- The table of a link pipeline with steps has `_key` only when its last step selects it, because a link step is not checked for it (`engine/src/workspace/connection/pipeline.rs:83-90`).

`has_key` (4.7) answers the question for one table.

Errors:

| Condition | Kind | Code |
| --- | --- | --- |
| The result of `row_keys` or of a range query has another shape than the statement selects, a row key is negative, or the rows read differ in number from the table's row count. | `Permanent` | `row_key` |
| The ID column has a type the workspace cannot read, such as `TIME_NS` (`engine/src/workspace/rows.rs:23-76`). | `Permanent` | `query_invalid`, from `error::statement` for `StatementError::UnsupportedType`. |
| `RowFile::create`, `push` or `close` fails. | As `shared-run.md` section 4.7 gives it: `row_invalid` or `scratch_unavailable`. | |
| `spawn_blocking` returns a `JoinError`. | `Retryable` | `scratch_unavailable`, from `error::scratch`. |
| `Workspace::load_capture` fails. | As `error::capture` maps it (`shared-run.md` section 6). | |
| `Workspace::query` or `Workspace::create_table` fails. | As `error::statement` maps it (`shared-run.md` section 6). | |

### 4.7 `table_columns`, `property_columns`, `has_key`

```rust
// engine/src/stage/diff/rows/columns.rs
/// Returns the column names of `table` in the table's order and spelling.
pub(super) async fn table_columns(workspace: &Workspace, table: &str) -> Result<Vec<Box<str>>, Report<StageError>>;

/// Returns the columns of a table that `properties` read: in the table's spelling, each once,
/// in the order the accessors first read them.
pub(super) fn property_columns(
    properties: &Properties,
    table: &[Box<str>],
) -> Result<Vec<Box<str>>, Report<StageError>>;

/// Returns whether a table has the staging column `_key`.
pub(super) fn has_key(table: &[Box<str>]) -> bool;
```

`table_columns` runs this query and returns the first value of each row. `{table}` is written with `literal` (`engine/src/sql.rs:31`, checkout).

```sql
SELECT column_name FROM information_schema.columns WHERE table_name = '{table}' ORDER BY ordinal_position
```

The query reads no row of the table, so a column of a type that `Workspace::query` cannot read does not fail it. The test `pipeline_named_inputs` reads `information_schema.tables` the same way (`engine/tests/pipeline.rs:330`).

```rust
pub(super) fn property_columns(properties, table) -> Result<Vec<Box<str>>, Report<StageError>> {
    let mut columns: Vec<Box<str>> = Vec::new();
    for (column, _) in accessor_columns(properties) {
        let name = table.iter()
            .find(|name| name.eq_ignore_ascii_case(column.as_ref()))
            .ok_or_else(|| Code::QueryInvalid.report())?;
        if !columns.contains(name) {
            columns.push(name.clone());
        }
    }
    Ok(columns)
}
```

How the case of a column name is resolved: the name in the definition is compared with each column of the table ignoring ASCII case, and the first match in the table's column order is taken in the table's spelling. `check_column` (`engine/src/workspace/connection/pipeline.rs:294-305`) and `SinkColumns` (`engine/src/graph/property/mod.rs:44-54`) compare the same way. An accessor on `MODEL` over a table column `model` gives `model`.

`TargetRows::columns` is this list. The preceding accessor check guarantees that it contains no reserved engine names; preserving `_key` as metadata does not add it to this list. For `entity/sink-aircraft` it is `EMPTY_MASS`, `MASS_UNIT`, `FIRST_FLIGHT`, `MODEL`. For `entity/sink-airfields` it is `FIELD_NAME`. For `link/aircraft-based-at` it is empty. The `entity_id` column and the `from` and `to` columns are in the list only when a property accessor also reads them.

`has_key` returns whether a name equals `_key` ignoring ASCII case.

Errors: `Permanent`, `query_invalid` when the table lacks a column an accessor reads. This is the code `error::preparation` gives `PreparationError::MissingColumn`, with which `check_properties` has already refused such a table in step 2. `table_columns` returns what `error::statement` maps (`shared-run.md` section 6).

### 4.8 `missing_select`, `issues_table`

```rust
// engine/src/stage/diff/rows/issues.rs
/// The table named in `PreparedRows::issues`.
pub(super) const ISSUES_TABLE: &str = "_issues";

/// Returns the `SELECT` that gives one issues row for each row of a target that has no ID.
pub(super) fn missing_select(target: &Target, hashed_table: &str, ids_table: &str, has_key: bool) -> Box<str>;

/// Creates the issues table from the selects of all targets and returns its name.
pub(super) async fn issues_table(workspace: &Workspace, missing: &[Box<str>]) -> Result<Box<str>, Report<StageError>>;
```

A row without an ID gives one row of the issues table with these values:

| Column | Value |
| --- | --- |
| `kind` | `entity` or `link`, from `Kind::as_str`. |
| `target` | The step ID or the link ID, from `Target::id`. |
| `entity_id` | `NULL` |
| `key` | The row's `_key` cast to `VARCHAR` when the hashed table has a column `_key`. Otherwise `NULL`. |
| `issue` | `missing_id` for a sink, `missing_endpoint` for a link pipeline. |
| `property` | `NULL` |
| `reason` | `NULL` |

Which tables have `_key` is stated in 4.6. A link row gives one issue row, whether one endpoint or both are missing.

`missing_select` with `_key`:

```sql
SELECT 'entity' AS "kind", 'sink-aircraft' AS "target", CAST(NULL AS VARCHAR) AS "entity_id",
       CAST(source."_key" AS VARCHAR) AS "key", 'missing_id' AS "issue",
       CAST(NULL AS VARCHAR) AS "property", CAST(NULL AS VARCHAR) AS "reason"
FROM "_ids/entity/sink-aircraft" AS ids
JOIN "{hashed table}" AS source ON source.rowid = CAST(ids."_row" AS BIGINT)
WHERE ids."_entity_id" IS NULL
```

`missing_select` without `_key`:

```sql
SELECT 'link' AS "kind", 'joined' AS "target", CAST(NULL AS VARCHAR) AS "entity_id",
       CAST(NULL AS VARCHAR) AS "key", 'missing_endpoint' AS "issue",
       CAST(NULL AS VARCHAR) AS "property", CAST(NULL AS VARCHAR) AS "reason"
FROM "_ids/link/joined" AS ids
WHERE ids."_entity_id" IS NULL
```

The kind and the ID are written with `literal`.

`issues_table` creates `_issues` with one statement. It starts with a `SELECT` that gives the seven columns and no row, and adds each select of `missing` with `UNION ALL`:

```sql
SELECT * FROM (
  SELECT CAST(NULL AS VARCHAR) AS "kind", CAST(NULL AS VARCHAR) AS "target", CAST(NULL AS VARCHAR) AS "entity_id",
         CAST(NULL AS VARCHAR) AS "key", CAST(NULL AS VARCHAR) AS "issue",
         CAST(NULL AS VARCHAR) AS "property", CAST(NULL AS VARCHAR) AS "reason"
) AS empty WHERE false
UNION ALL {missing[0]}
UNION ALL {missing[1]}
```

With an empty `missing` the statement is the first `SELECT` alone. The table then has the seven `VARCHAR` columns and no rows. The rows have no order. Step 4 orders them when it writes the `issues` file.

Errors: as `error::statement` maps them (`shared-run.md` section 6).

### 4.9 Cost

For one target with N rows, steps 2 and 3 make these passes:

| Pass | Statements | Rows read | Rows written |
| --- | --- | --- | --- |
| Each SQL step of the pipeline | 1 | Its input | Its output, to a new table. |
| Content hash (`hashed_table`) | 1 | N, all columns | N, all columns and the hash. |
| Column names (`table_columns`) | 1 | None of the table. | |
| Row keys (`row_keys`) | 1 | N row keys | |
| ID ranges (`read_range`) | N / 65,536, rounded up | N row keys and one ID column, or two for a link pipeline | |
| ID file (`RowFile`) | | | N rows of 3 or 5 columns, to a Parquet file in the scratch directory. |
| ID table (`load_capture`) | 1 | The ID file | N rows. |
| Final table (`final_select`) | 1 | N rows of the hashed table and N rows of the ID table, joined on the row key | N minus the rows without an ID, all columns and the ID columns. |
| Issue rows (`missing_select`), only when a row has no ID | Part of 1 statement for all targets | The ID table and the `_key` column of the hashed table | One row per row without an ID. |

Each source is also written twice before the pipelines run: once as `_capture/{source}` and once as `_source/{source}`.

**Memory in Rust.** `assign_ids` holds the rows of one range: at most 65,536 rows with a row key and one or two ID values. With ID texts of 40 bytes this is about 10 MB. The derived IDs go to the `RowFile` row by row. The estimate is by reading the types and was not measured.

**Memory in DuckDB.** The join of the final table builds a hash table over one of its two inputs. `WorkspaceConfig::memory_limit` bounds it, and DuckDB writes what does not fit to its temporary directory (`engine/src/workspace/mod.rs:46-48`).

**Disk.** A target's rows exist twice with all columns when `assign_ids` returns: in the hashed table and in the final table. Every table of section 2 stays until the stage closes the workspace. `WorkspaceConfig::disk_limit` is checked after every statement (`engine/src/workspace/mod.rs:51-59`).

**The range size.** 65,536 is the row group size that `Workspace::capture` writes (`engine/src/workspace/connection/capture.rs:63`). A target with 10 million rows needs 153 range queries. Whether DuckDB limits the scan of a range query to the rows of the range was not checked. If it scans all row keys for every range, the 153 queries compare 1.5 billion row keys in total.

**CPU in Rust.** A sink row costs one UUID v5, which is one SHA-1 over about 100 bytes. A link row costs three.

## 5. Existing code

| Location | Item | Change |
| --- | --- | --- |
| `engine/src/sources/mod.rs:295-327` (checkout) | `SourceReader::stage_sources(workspace: &Workspace, definition: &Definition, captures: &SourceCaptures) -> Result<BTreeMap<SourceName, Box<str>>, Report<SourceError>>` | It is removed. `stage::diff::rows::staging::stage_sources(context: &RunContext, workspace: &Workspace, definition: &Definition, capture: &CaptureOutput) -> Result<BTreeMap<SourceName, Box<str>>, Report<StageError>>` replaces it. |
| `engine/src/sources/mod.rs:171-175` (checkout) | `SourceCaptures` | Stage 2 no longer reads it. The stage 1 spec decides whether it stays. |
| `engine/src/sources/tests.rs:234`, `:299` (checkout) | The two calls of `SourceReader::stage_sources` in `capture_retry_and_restore` and `concurrent_attempts_share_the_bound_capture` | Each call becomes two calls: `Workspace::load_capture` of the capture into `_capture/items`, then `Workspace::stage_table("_source/items", "SELECT * FROM \"_capture/items\"", primary key, TableAssertions::default())`. The stage 1 spec fixes how the test gets the capture. |
| `engine/README.md:17` | The sentence that names `SourceReader::stage_sources` | It names `stage::diff::rows::staging::stage_sources`. |
| `engine/src/workspace/mod.rs:156` | `Workspace::load_capture` | Used as is. |
| `engine/src/workspace/mod.rs:268` | `Workspace::stage_table` | Used as is. |
| `engine/src/workspace/mod.rs:297` | `Workspace::prepare_pipeline` | Used as is. |
| `engine/src/workspace/mod.rs:322` | `Workspace::prepare_link_pipeline` | The signature stays. `PreparedLink::table` now names a new table that holds `_content_hash`. |
| `engine/src/workspace/mod.rs:369`, `:404` | `Workspace::query`, `Workspace::create_table` | Used as is. |
| `engine/src/pipeline/mod.rs:103-108` | `PreparedLink` | The doc comment of `table` becomes "A table containing the link pipeline's rows and `_content_hash`." |
| `engine/src/pipeline/mod.rs` | `accessor_columns` | New: `pub(crate) fn accessor_columns(properties: &Properties) -> impl Iterator<Item = (&ColumnName, bool)>`. |
| `engine/src/workspace/connection/pipeline.rs:57-101` | `Connection::prepare_link_pipeline(&self, request: &LinkRequest) -> Result<PreparedLink, Report<PreparationError>>` | The signature stays. After line 96 it calls `hashed_table` and returns that table. |
| `engine/src/workspace/connection/pipeline.rs:207-236` | `Execution::sink(&self, input: &str, sink: &EntitySink) -> Result<Box<str>, Report<PreparationError>>` | The signature stays. Lines 213-235 become one call of `Connection::hashed_table`. |
| `engine/src/workspace/connection/pipeline.rs:245-273` | `hash_expression` | Used as is. |
| `engine/src/workspace/connection/pipeline.rs:276-291` | `check_properties` | The signature stays. First reject reserved accessor names, then check existence through accessor_columns. |
| `engine/src/workspace/connection/pipeline.rs:294-305` | `check_column` | Used as is. |
| `engine/src/workspace/connection/pipeline.rs` | `Connection::hashed_table`, `check_reserved`, `RESERVED`, `STAGED` | New, as in 4.4. |
| `engine/src/workspace/connection/staging.rs:69-114` | `Connection::stage_table` | Used as is. |
| `engine/src/entity_id.rs:12-24` | `derive_entity_id` | Used as is. |
| `engine/src/entity_id.rs` | `source_id`, `derive_link_ids`, `LinkIds` | New, as in 4.5. |
| `engine/src/graph/mod.rs:67-71` | `LinkEndpoint<'a>` | It moves to `engine/src/entity_id.rs` unchanged. `engine/src/lib.rs:36` exports it from `entity_id`. `graph/mod.rs` imports it. |
| `engine/src/graph/mod.rs:91-117` | `LinkUpsert::new` | The signature stays. Lines 100-112 become `let ids = derive_link_ids(web_id, namespace, &link_type, left, right);` and the three ID fields are taken from `ids`. The stage 3 spec decides whether the function stays. |
| `engine/src/graph/property/value.rs:11-12` | `UNIX_EPOCH_JULIAN_DAY` | It moves to `engine/src/workspace/value.rs`. |
| `engine/src/graph/property/value.rs:149-191` | `pub(super) fn text(value: &Value) -> Option<String>` | It moves to `engine/src/workspace/value.rs` as `pub(crate) fn text(value: &Value) -> Option<String>`. The `Decimal` arm (line 171) becomes `Value::Decimal(number) => number.to_string().parse::<Real>().ok()?.to_string()`, which is what `as_number` does for a decimal (line 123). Every other arm is unchanged. |
| `engine/src/graph/property/value.rs:193-196`, `:198-200`, `:202-209` | `float_text`, `date`, `time_of_day` | They move to `engine/src/workspace/value.rs` and stay private. |
| `engine/src/graph/property/value.rs:211-219` | `pub(super) fn clock(time: Time) -> Option<String>` | It moves to `engine/src/workspace/value.rs` as `pub(crate)`. |
| `engine/src/graph/property/mod.rs:267-272` | `fn is_blank(value: &Value) -> bool` | It moves to `engine/src/workspace/value.rs` as `pub(crate)`. |
| `engine/src/workspace/mod.rs` | Module list | It gains `pub(crate) mod value;`. |
| `engine/src/graph/property/value.rs:37-105`, `:107-147` | `ColumnValue`, `as_number`, `finite`, `UnsupportedValue` | They stay. Line 78 calls the moved `text`. |
| `engine/src/graph/property/mod.rs:116-118` | `pub(in crate::graph) fn text(&self, column: &ColumnName) -> Option<String>` | The signature stays. The body becomes `crate::entity_id::source_id(self.get(column))`. The stage 3 spec removes the function with its only caller, `GraphPlan::source_id` (`engine/src/graph/plan/mod.rs:177-193`). |
| `engine/src/graph/property/mod.rs:121-123`, `:162`, `:261` | `SinkRow::value`, the unit lookup, `Unconverted::new` | They import `is_blank` and `text` from `crate::workspace::value`. |
| `engine/src/graph/property/coerce.rs:13`, `:24`, `:78`, `:95`, `:113`, `:123`, `:149` | The calls of `value::text` and `value::clock` | They import `text` and `clock` from `crate::workspace::value`. `value::as_number` (`:133`) and `value::finite` (`:161`) are unchanged. |
| `engine/src/graph/property/tests.rs:15-18`, `:160-172` | The test `rendered_text` | It moves to a test module of `engine/src/workspace/value.rs` with its three cases. |
| `engine/src/sql.rs:9`; `:31` (checkout) | `Identifier`, `literal` | Used as is. |
| `engine/src/capture.rs:39`, `:82` | `SourceCapture`, `SourceCapture::path` | Used as is, on the value `RowFile::close` returns. |
| `engine/src/workspace/rows.rs:8-11`, `:80`, `:85` | `Rows`, `Rows::columns`, `Rows::iter` | Used as is. |
| `definition/src/definition/mod.rs:97`, `:109`, `:114` | `Definition::sources`, `entity_pipelines`, `link_pipelines` | Used as is. |
| `definition/src/source/mod.rs:150`, `:175` | `Source::primary_key`, `Source::checkpoint` | Used as is. |
| `tests/integrations/graph/aviation/mod.rs:63-146` | The function `plan` | Its loop is replaced by `run_pipelines`. The test itself changes with the runner; it is outside steps 2 and 3. |
| `engine/tests/pipeline.rs:502-599` | `definition_aviation_tables` | See section 7. |

A function that builds a whole definition's tables is not found in `engine/src` today. The only code that does it is in the two tests above.

## 6. Error mapping

Steps 2 and 3 map `StatementError`, `PreparationError`, `CaptureError` and `ArtifactError` with the shared functions `error::statement`, `error::preparation`, `error::capture` and `error::artifact`, and an IO, Parquet or join error with `error::scratch`. `shared-run.md` section 6 gives their tables, and this spec writes no mapping of its own for those types. A failure that the shared codes already name is raised with that code, for example `Code::InvalidDefinition.report()` for an undeclared source and `Code::QueryInvalid.report()` for a missing accessor column.

Steps 2 and 3 add these variants to `Code`:

| Variant | Text | Kind | Condition |
| --- | --- | --- | --- |
| `CaptureMissing` | `capture_missing` | Permanent | A source of the definition that has a primary key has no entry in `CaptureOutput::sources`, or has no staged table (4.2, 4.3). |
| `RowKey` | `row_key` | Permanent | The result of `row_keys` or of a range query has another shape than the statement selects, a row key is negative, or the rows read differ in number from the table's row count (4.6). |

Each variant gets its entry in `Code::ALL` (`shared-run.md` section 3.3).

## 7. Tests

Use the workflow's initial acceptance set first. The cases below supply expected behavior and additional regression candidates, not a requirement to reproduce one test per listed private function.

Test names follow `<subject>_<case>`. Assertion messages use the "should" form of the existing tests.

Every scenario uses web `00000000-0000-4000-8000-000000000001`, written `W` below, and the UUIDs of `03-scenarios.md`. An entity ID is written `W~{uuid}`.

### 7.1 `engine/src/entity_id.rs`, unit tests

**`source_id_values`** (rstest). The expected texts are those of `rendered_text` (`engine/src/graph/property/tests.rs:160-172`) and of the table in 4.5.

| Input | Expected |
| --- | --- |
| `Value::Text("M-0001")` | `Some("M-0001")` |
| `Value::Text(" A ")` | `Some(" A ")` |
| `Value::Text("")`, `Value::Text("  ")`, `Value::Null` | `None` |
| `Value::Union(Box::new(Value::Text("")))` | `None` |
| `Value::Int(1)`, `Value::BigInt(1)` | `Some("1")` |
| `Value::Double(1.0)` | `Some("1")` |
| `Value::Double(1.5)` | `Some("1.5")` |
| `Value::Double(f64::NAN)` | `None` |
| `Value::Decimal(Decimal::new(10, 2, 803_000))`, which is `8030.00` | `Some("8030")` |
| `Value::Timestamp(TimeUnit::Microsecond, 1_794_220_200_000_000)` | `Some("2026-11-09T10:30:00Z")` |
| `Value::Date32(-8675)` | `Some("1946-04-02")` |
| `Value::Boolean(true)` | `Some("true")` |
| `Value::List(vec![Value::Int(1)])`, `Value::Blob(vec![1])` | `None` |

**`derive_link_ids_recorded_vector`**. Web `a2c8e6c7-485d-4b54-a248-53c9b9b014a2`, namespace `conn-a`, link type `https://x/@t/types/entity-type/stored-at/v/1`, left `(https://x/@t/types/entity-type/material/v/1, "M-0001")`, right `(https://x/@t/types/entity-type/plant/v/1, "P-0100")`. Expected:

- `source_id` is `https://x/@t/types/entity-type/material/v/1::M-0001::https://x/@t/types/entity-type/plant/v/1::P-0100`.
- `link_id` has the UUID `25bbb6e3-3e0a-53c2-a2f3-b8b83f7ff314`, the seventh vector of `engine/tests/fixtures/entity-ids-typescript.json`.
- `left_entity_id` has the UUID `fdb92954-9bd5-5558-ae43-40437c693f27`, the first vector.
- `right_entity_id` has the UUID `0162f676-2ab3-5f3d-8360-2ea1f9e797b4`.
- Swapping left and right gives another `link_id`.

The existing tests `link_endpoints_match_entities` and `link_id_from_type_and_endpoints` (`engine/src/graph/tests.rs:94`, `:109`) stay and pass through `derive_link_ids`. `derive_entity_id_recorded_vectors` (`engine/tests/entity_id.rs:23`) stays unchanged and covers all eight vectors at the level of `derive_entity_id`.

### 7.2 `engine/tests/pipeline.rs`, the content hash

**`pipeline_recorded_hashes`**: the vectors of labs `tests/golden/fallback-hash.json` (`canonicalSql`, `canonicalRows`). The source is staged with the helper `stage` (`engine/tests/pipeline.rs:53`) under the primary key `ID`:

```sql
SELECT MATNR AS ID, MAKTX, BRGEW::DOUBLE AS BRGEW, ERSDA::DATE AS ERSDA FROM (VALUES
  ('M1', '  padded  ', 1.5, '2026-01-02'),
  ('M2', '', NULL, NULL),
  ('M3', NULL, 2, '1999-12-31'),
  ('M4', 'NULL', 0.1, '2026-01-02'),
  ('M5', 'Grüße, ''仓库''::x', -3.25, NULL)
) t(MATNR, MAKTX, BRGEW, ERSDA)
```

The sink has `entityId: ID` and three properties, whose URL order gives the labs column order `ERSDA`, `MAKTX`, `BRGEW`:

```yaml
- id: sink
  sink:
    entityType: https://x/@t/types/entity-type/material/v/1
    entityId: ID
    properties:
      https://x/@t/types/property-type/created/v/1: ERSDA
      https://x/@t/types/property-type/name/v/1: MAKTX
      https://x/@t/types/property-type/weight/v/1: BRGEW
```

The engine generates `md5(struct_pack(p0 := "ERSDA", p1 := nullif(trim("MAKTX"), ''), p2 := "BRGEW")::VARCHAR)`. Expected `_content_hash` per `ID`:

| `ID` | Text that is hashed | `_content_hash` |
| --- | --- | --- |
| `M1` | `{'p0': 2026-01-02, 'p1': padded, 'p2': 1.5}` | `9527f1d39d6dcf3f63f0a369a91027a6` |
| `M2` | `{'p0': NULL, 'p1': NULL, 'p2': NULL}` | `e8bca8a3b3d677138e2b9bc17933dfa3` |
| `M3` | `{'p0': 1999-12-31, 'p1': NULL, 'p2': 2.0}` | `b9bf8f6715b46c4b4bf382975a743190` |
| `M4` | `{'p0': 2026-01-02, 'p1': 'NULL', 'p2': 0.1}` | `0a5f9546b1dc7159d4f60e1cf0428271` |
| `M5` | `{'p0': NULL, 'p1': 'Grüße, \'仓库\'::x', 'p2': -3.25}` | `f3594de37157d7c71e5e450c5ae09119` |

The md5 of each text was computed with Python and equals the labs value. The labs file was recorded with DuckDB `1.5.x`. The monorepo builds the `duckdb` crate `1.20000.1` (the repository's `Cargo.lock:4501-4502`). If that version renders a struct differently, this test fails. The implementer then records the new five values in the test and reports the change, because every stored hash of an earlier version changes with it (contracts, "Content hash").

**`link_content_hashes`**. Fixture `engine/tests/fixtures/pipeline-links.yaml`, prepared as in `link_named_inputs` (`engine/tests/pipeline.rs:459`). Expected: `SELECT _content_hash FROM "{prepared.table}"` returns `d41d8cd98f00b204e9800998ecf8427e`, and `prepared.table` differs from both input tables.

**`link_plain_hashes`**. A link pipeline over the checkpoint `rows` with `from` column `FROM_ID`, `to` column `TO_ID` and one property `https://example.com/property/v/1: LABEL`. The checkpoint's table is created with `Workspace::create_table` three times and the link pipeline is prepared after each:

| Table `data` | Expected |
| --- | --- |
| `SELECT 'A' AS FROM_ID, 'B' AS TO_ID, ' a ' AS LABEL, 1 AS NOISE` | Hash `h1`. |
| `SELECT 'C' AS FROM_ID, 'D' AS TO_ID, 'a' AS LABEL, 2 AS NOISE` | `h2 == h1`: text is trimmed, and the endpoint columns and unmapped columns are not hashed. |
| `SELECT 'C' AS FROM_ID, 'D' AS TO_ID, 'b' AS LABEL, 2 AS NOISE` | `h3 != h2`. |

**`link_measured_hashes`**: the link with a measure property. New fixture `engine/tests/fixtures/pipeline-link-measured.yaml`:

```yaml
connector: demo
unitMaps:
  masses:
    units:
      KG: https://example.com/data-type/kilogram/v/1
      LB: https://example.com/data-type/pound/v/1
sources:
  source:
    primaryKey: [ID]
    sql: SELECT 1 AS ID
pipelines:
  entities:
    - source: source
      steps:
        - id: save
          checkpoint: rows
  links:
    - id: carries
      checkpoint: rows
      from: { entityType: https://example.com/entity/v/1, column: FROM_ID }
      to: { entityType: https://example.com/entity/v/1, column: TO_ID }
      linkType: https://example.com/link/v/1
      properties:
        https://example.com/property/v/1:
          { amount: AMOUNT, unit: UNIT, unitMap: masses }
```

The generated expression is `md5(struct_pack(p0 := "AMOUNT", p1 := "UNIT")::VARCHAR)`. The table of `rows` is created four times, as in `pipeline_measured_hashes` (`engine/tests/pipeline.rs:652`):

| Table `data` | Expected |
| --- | --- |
| `SELECT 'A' AS FROM_ID, 'B' AS TO_ID, 10 AS AMOUNT, 'KG' AS UNIT, 1 AS NOISE` | Hash `h1`. |
| The same with `2 AS NOISE` | `h2 == h1`. |
| The same with `11 AS AMOUNT` | `h3 != h2`. |
| The same with `11 AS AMOUNT, 'LB' AS UNIT` | `h4 != h3`: a changed unit changes the link's hash. |

**`pipeline_reserved_columns`** (rstest over `_entity_id`, `_SOURCE_ID`, `_left_entity_id`, `_right_entity_id`, `_row`, `_change`, `rowid`). A pipeline with the SQL step `SELECT *, 1 AS {name} FROM input` and the sink of `pipeline-sink.yaml`. Expected: a report with a `PreparationError::ReservedColumn` frame whose `column` is the name as written. A second case prepares a link pipeline whose step selects `1 AS _content_hash` and expects the same error.

**Existing tests that stay unchanged**: `pipeline_content_hashes` (`:288`), `pipeline_converted_hashes` (`:602`), `pipeline_measured_hashes` (`:652`) and `link_named_inputs` (`:459`), which selects `FROM_ID` and `TO_ID` by name. `definition_aviation_tables` (`:502`) keeps its assertions on the workspace methods and gains one: `SELECT count(*), count(_content_hash) FROM "{prepared.table}"` of the link pipeline returns `(2, 2)`.

### 7.3 `engine/src/stage/diff/rows/tests.rs`

Helpers:

- `context(directory)` builds a `RunContext` with `ArtifactStorage::local` under the directory, a scratch directory under it, `WorkspaceConfig::default()` and the fixed clock of the `run` module's tests.
- `open(context, definition)` opens a workspace with `context.open_workspace(definition.variables().clone())`.
- `captured(context, workspace, definition)` builds a `CaptureOutput`. For each source of kind `Sql` it stores the query with `store_query` and counts the rows with `SELECT count(*) FROM ({query}) AS source`. `captured_at` is `2026-11-06T12:00:00Z` and `adopted_from` is `None`.
- `apply(definition, namespace)` builds a `RunInput` with web `W`, actor `00000000-0000-4000-8000-000000000002`, `Operation::Apply { resend_all: false }` and the definition text.
- `rows(workspace, sql)` returns the rows of a query as `Vec<Vec<Value>>`.

Each test of `prepare_rows` parses the definition once with `input.parse_definition()` and passes the result as `definition`, as `diff` does.

D0 is `definition/examples/aviation.yaml`, read with `include_str!` as `engine/src/graph/plan/tests.rs:41-45` does. A changed definition is made with `str::replace` on D0's text, as `pipeline_converted_hashes` does (`engine/tests/pipeline.rs:605-606`).

**`prepare_rows_first_run`** (S1 run 1). Input: D0, namespace `aviation`. Expected `PreparedRows::targets`, in this order:

| `target` | `table` | `columns` | `sources` | `without_id` |
| --- | --- | --- | --- | --- |
| `entity/sink-airfields` | `_target/entity/sink-airfields` | `FIELD_NAME` | `airfields` | 0 |
| `entity/sink-aircraft` | `_target/entity/sink-aircraft` | `EMPTY_MASS`, `MASS_UNIT`, `FIRST_FLIGHT`, `MODEL` | `aircraft` | 0 |
| `link/aircraft-based-at` | `_target/link/aircraft-based-at` | none | `aircraft` | 0 |

`_target/entity/sink-airfields` has the columns `_op`, `_key`, `ICAO`, `FIELD_NAME`, `_content_hash`, `_entity_id`, `_source_id`. Rows, ordered by `_entity_id`:

| `_key` | `ICAO` | `FIELD_NAME` | `_entity_id` | `_source_id` |
| --- | --- | --- | --- | --- |
| `{"ICAO":"ESSB"}` | `ESSB` | `Bromma` | `W~9a1348a1-6ded-5391-bd06-f2a96b5bffcb` | `ESSB` |
| `{"ICAO":"ESSA"}` | `ESSA` | `Arlanda` | `W~9ec2610c-ca36-53f4-b809-e9af4c4b3b68` | `ESSA` |

`_target/entity/sink-aircraft` has the columns `_op`, `_key`, `TAIL`, `MODEL`, `FIRST_FLIGHT`, `EMPTY_MASS`, `MASS_UNIT`, `HOME_BASE`, `_content_hash`, `_entity_id`, `_source_id`. Rows:

| `_key` | `TAIL` | `_entity_id` | `_source_id` |
| --- | --- | --- | --- |
| `{"TAIL":"SE-XXX"}` | `SE-XXX` | `W~468da978-f2fd-52d7-ad32-e319a155c918` | `SE-XXX` |
| `{"TAIL":"N100"}` | `N100` | `W~e0db547f-47bc-5587-a517-7b9eb11d952c` | `N100` |

`_target/link/aircraft-based-at` has the columns of the aircraft checkpoint, then `_content_hash`, `_entity_id`, `_source_id`, `_left_entity_id`, `_right_entity_id`. `T` stands for `https://example.com/@demo/types/entity-type`. Rows:

| `TAIL` | `HOME_BASE` | `_entity_id` | `_source_id` | `_left_entity_id` | `_right_entity_id` |
| --- | --- | --- | --- | --- | --- |
| `N100` | `ESSA` | `W~6ab96f70-86d5-5088-99a0-b31f86e6270c` | `T/aircraft/v/1::N100::T/airfield/v/1::ESSA` | `W~e0db547f-47bc-5587-a517-7b9eb11d952c` | `W~9ec2610c-ca36-53f4-b809-e9af4c4b3b68` |
| `SE-XXX` | `ESSA` | `W~b16436f1-2384-575c-b2d3-e5606539d19e` | `T/aircraft/v/1::SE-XXX::T/airfield/v/1::ESSA` | `W~468da978-f2fd-52d7-ad32-e319a155c918` | `W~9ec2610c-ca36-53f4-b809-e9af4c4b3b68` |

Further assertions: every `_op` is `snapshot`. Every `_content_hash` has 32 hexadecimal digits. Both link rows have the hash `d41d8cd98f00b204e9800998ecf8427e`. The two aircraft hashes differ. `_issues` has the seven columns of the `issues` file and no rows.

**`prepare_rows_empty_source`** (S3 run 4). Input: D0 with ` WHERE false` appended after `t(TAIL, MODEL, FIRST_FLIGHT, EMPTY_MASS, MASS_UNIT, HOME_BASE)`. `CaptureOutput::sources["aircraft"].rows` is 0. Expected:

- Three targets with the names, `columns` and `sources` of S1 run 1, and `without_id` 0.
- `_target/entity/sink-airfields` equals the table of S1 run 1, including both hashes.
- `_target/entity/sink-aircraft` and `_target/link/aircraft-based-at` have the columns of S1 run 1 and no rows.
- `_issues` has no rows.

The coverage rule is applied in step 4. This test shows what step 4 receives: empty tables and the source set `aircraft` for both targets.

**`prepare_rows_renamed_sink`** (S4 run 2). The test runs D0 in one workspace and D0 with `id: sink-aircraft` replaced by `id: sink-planes` in a second workspace. Expected for the second run:

- The targets are `entity/sink-airfields`, `entity/sink-planes`, `link/aircraft-based-at`. No target is named `entity/sink-aircraft`.
- `SELECT _entity_id, _source_id, _content_hash FROM "_target/entity/sink-planes" ORDER BY _entity_id` equals the same query on `_target/entity/sink-aircraft` of the first run: `W~468da978-f2fd-52d7-ad32-e319a155c918` and `W~e0db547f-47bc-5587-a517-7b9eb11d952c` with unchanged hashes.
- `columns` and `sources` of `entity/sink-planes` equal those of `entity/sink-aircraft`.

**`prepare_rows_type_bump`** (S5 run 2). Input: D0 with `entity-type/aircraft/v/1` replaced by `entity-type/aircraft/v/2`, which changes the sink and the link's `from`. Expected:

| Table | `_source_id` | `_entity_id` | `_left_entity_id` | `_right_entity_id` |
| --- | --- | --- | --- | --- |
| `_target/entity/sink-aircraft` | `SE-XXX` | `W~345b1a19-003d-56e6-a008-4471367c5a5f` | | |
| `_target/entity/sink-aircraft` | `N100` | `W~b9e995c6-78ed-50af-b213-2b98cfaf5d60` | | |
| `_target/link/aircraft-based-at` | `T/aircraft/v/2::SE-XXX::T/airfield/v/1::ESSA` | `W~abe0b07a-580f-5a18-81ec-5886fec9b2ac` | `W~345b1a19-003d-56e6-a008-4471367c5a5f` | `W~9ec2610c-ca36-53f4-b809-e9af4c4b3b68` |
| `_target/link/aircraft-based-at` | `T/aircraft/v/2::N100::T/airfield/v/1::ESSA` | `W~f2142c0e-36fb-598e-8f88-8b8079a48daf` | `W~b9e995c6-78ed-50af-b213-2b98cfaf5d60` | `W~9ec2610c-ca36-53f4-b809-e9af4c4b3b68` |

The `_content_hash` of each aircraft row equals the hash of the same `TAIL` in a D0 run, because the entity type is not hashed. The airfield rows equal those of S1 run 1.

**`prepare_rows_without_definition`** (S8 run 4). Input: `RunInput` with `Operation::Restore { target: None }`, `definition: None`, namespace `aviation`; the argument `definition` is `None`; `CaptureOutput` with no sources. Expected: `targets` is empty, `issues` is `_issues`, and `_issues` has the seven columns and no rows. The test reads `SELECT table_name FROM information_schema.tables` and asserts that no name starts with `_capture/`, `_source/`, `_step/`, `_ids/` or `_target/`.

**`prepare_rows_repeat`**. `prepare_rows` is called twice with D0 in one workspace. Expected: both calls succeed, and the second call's `TargetRows` and the rows of the three final tables equal the first call's.

**`stage_sources_tables`**. D0. Expected: the returned map is `aircraft -> _source/aircraft`, `airfields -> _source/airfields`. `SELECT _op, _key, TAIL FROM "_source/aircraft" ORDER BY TAIL` returns `(snapshot, {"TAIL":"N100"}, N100)` and `(snapshot, {"TAIL":"SE-XXX"}, SE-XXX)`.

**`stage_sources_capture_missing`**. D0 and a `CaptureOutput` without the entry `aircraft`. Expected: `Permanent`, `capture_missing`.

**`stage_sources_invalid_columns`** (rstest). A capture file made from `SELECT 1 AS ID, 2 AS "_KeY"` gives `Permanent`, `reserved_column`, the code of the contract "Reserved column names". A capture file made from `SELECT 1 AS OTHER` for a source with the primary key `ID` gives `Permanent`, `query_invalid`. Both port `staging_invalid_columns` (`engine/tests/pipeline.rs:184`) to the stage error.

**`run_pipelines_checkpoint_source`**. Namespace `demo`. The pipeline of `saved-orders` is declared before the pipeline of `orders` and reads the definition checkpoint `demo/orders` as its source, as in `definition/tests/ui/valid-forms.yaml:13-21`:

```yaml
connector: demo
sources:
  orders:
    sql: SELECT 1 AS ID
    primaryKey: [ID]
  saved-orders:
    checkpoint: demo/orders
pipelines:
  entities:
    - source: saved-orders
      steps:
        - id: sink-saved
          sink:
            entityType: https://example.com/saved/v/1
            entityId: ID
    - source: orders
      steps:
        - id: save-orders
          checkpoint: demo/orders
        - id: sink-orders
          sink:
            entityType: https://example.com/entity/v/1
            entityId: ID
```

Expected:

- The targets are `entity/sink-orders`, then `entity/sink-saved`, because the pipeline of `orders` runs first.
- `_target/entity/sink-orders` has one row with `_source_id` `1` and `_entity_id` `W~d0163448-4140-5adc-8530-c1605c455948`.
- `_target/entity/sink-saved` has one row with `_source_id` `1`, `_key` `{"ID":1}` and `_entity_id` `W~f14918f5-f24b-5534-91d8-a076af3b622a`.
- `sources` is `orders` for both targets. No set holds `saved-orders`.

**`run_pipelines_source_sets`**. A definition with the SQL sources `a` and `b`. The pipeline of `a` writes the definition checkpoint `cp-a`. The pipeline of `b` has `inputs: { other: cp-a }`, one SQL step that joins `input` with `other`, a sink `sink-b` and the definition checkpoint `cp-b`. A link pipeline `l-a` reads `cp-a`, and a link pipeline `l-b` reads `cp-b`. Expected `sources`: `entity/sink-b` has `a` and `b`; `link/l-a` has `a`; `link/l-b` has `a` and `b`.

**`assign_ids_recorded_vectors`**: the vectors of `engine/tests/fixtures/entity-ids-typescript.json` through the whole pass. Namespace `conn-a`. One source with the primary key `ID`:

```sql
SELECT * FROM (VALUES ('M-0001'), ('1'), ('1.5'), ('Grüße-仓库'), ('a::b'), ('A|B'), ('')) t(ID)
```

One sink `sink` with entity type `https://x/@t/types/entity-type/material/v/1` and `entityId: ID`. Expected rows of `_target/entity/sink`:

| `_source_id` | `_entity_id` |
| --- | --- |
| `M-0001` | `W~fdb92954-9bd5-5558-ae43-40437c693f27` |
| `1` | `W~2f37a211-5787-5474-83b3-e3d7cf6bb83a` |
| `1.5` | `W~42a6299f-2d8d-5b73-b11f-64badff46a94` |
| `Grüße-仓库` | `W~5aec7f53-3989-5d44-ace4-a78b860193a5` |
| `a::b` | `W~b0ed6b55-ea24-512b-97fe-e17e1c7f6861` |
| `A\|B` | `W~1ecf2406-4eba-5b0e-93f2-1a08389594d7` |

The row with the empty ID is left out: `without_id` is 1, and `_issues` holds the one row `(entity, sink, NULL, {"ID":""}, missing_id, NULL, NULL)`. The eighth vector gives the empty text a UUID at the level of `derive_entity_id`. A blank ID column gives a row no ID, as in the planner today (`engine/src/graph/property/mod.rs:116-123`).

The seventh vector, the link, is covered by a second definition in the same test: a pipeline that writes the definition checkpoint `rows` from `SELECT 'M-0001' AS FROM_ID, 'P-0100' AS TO_ID, 1 AS ID`, and a link pipeline `stored-at` with link type `https://x/@t/types/entity-type/stored-at/v/1`, `from` of type `…/material/v/1` in `FROM_ID` and `to` of type `…/plant/v/1` in `TO_ID`. Expected row of `_target/link/stored-at`: `_entity_id` `W~25bbb6e3-3e0a-53c2-a2f3-b8b83f7ff314`, `_left_entity_id` `W~fdb92954-9bd5-5558-ae43-40437c693f27`, `_right_entity_id` `W~0162f676-2ab3-5f3d-8360-2ea1f9e797b4`, and the `_source_id` of 7.1.

**`assign_ids_typed_columns`**: ID columns of type `DOUBLE`, `DECIMAL` and `TIMESTAMP`. Namespace `conn-a`, entity type `https://x/@t/types/entity-type/material/v/1`, three sources with one sink each:

| Source SQL | `_source_id` | `_entity_id` | UUID from DuckDB's own text, which must not appear |
| --- | --- | --- | --- |
| `SELECT 1.0::DOUBLE AS ID` | `1` | `W~2f37a211-5787-5474-83b3-e3d7cf6bb83a` | `220b4749-b9d0-52de-a40f-6ab4c1ac30e4` for `1.0` |
| `SELECT 1.5::DOUBLE AS ID` | `1.5` | `W~42a6299f-2d8d-5b73-b11f-64badff46a94` | |
| `SELECT 8030.00::DECIMAL(10, 2) AS ID` | `8030` | `W~1c16a41d-45af-5666-a314-4eb504e76502` | `af432e25-43fe-56a9-83da-029071596195` for `8030.00` |
| `SELECT TIMESTAMP '2026-11-09 10:30:00' AS ID` | `2026-11-09T10:30:00Z` | `W~d6579a17-67f5-5a25-8ee8-79d1e162014c` | `f7b835e7-c0aa-58b9-a67e-25be4a0f29a0` for `2026-11-09 10:30:00` |

The first two UUIDs are the second and third recorded vectors. The other two were computed with Python's `uuid.uuid5` over the texts that `rendered_text` asserts. While `Planner::plan_entities` still derives IDs (`engine/src/graph/plan/mod.rs:282-309`), the test also plans the rows of each hashed table with it and asserts that `PlannedWrite::entity_id` equals `_entity_id`. That comparison is removed with the stage 3 change. Labs covers the `DOUBLE` case in `numeric_graph_ids_advance_the_duckdb_resume_anchor` (labs `src/graph/sink.rs:1163`), where the two renderings differ.

**`assign_ids_missing_id`**. Namespace `demo`, entity type `https://example.com/entity/v/1`, primary key `K`, `entityId: ID`:

```sql
SELECT * FROM (VALUES (1, NULL), (2, ''), (3, '  '), (4, 'A')) t(K, ID)
```

Expected: `_target/entity/sink` has one row with `_source_id` `A` and `_entity_id` `W~cd83c211-532c-5bed-81ad-3544983db951`. `without_id` is 3. `_issues`, ordered by `key`, holds `(entity, sink, NULL, {"K":1}, missing_id, NULL, NULL)`, the same with `{"K":2}`, and the same with `{"K":3}`. A second case uses `SELECT 1 AS K, [1, 2] AS ID`: a list has no text form, so the row has no ID.

**`assign_ids_missing_endpoint`**. Namespace `demo`, both endpoint types `https://example.com/entity/v/1`, link type `https://example.com/link/v/1`. The definition checkpoint `rows` holds:

```sql
SELECT * FROM (VALUES (1, 'A', 'B'), (2, NULL, 'B'), (3, 'A', ''), (4, NULL, NULL)) t(ID, FROM_ID, TO_ID)
```

Case 1, a link pipeline `plain` without steps. Expected: one row with `_entity_id` `W~7bc3827e-295d-5a2f-8042-54a4370d72cb`, `_source_id` `https://example.com/entity/v/1::A::https://example.com/entity/v/1::B`, `_left_entity_id` `W~cd83c211-532c-5bed-81ad-3544983db951`, `_right_entity_id` `W~ca8e2f11-cfce-504c-b09f-6638a9759456`. `without_id` is 3. `_issues` holds three rows `(link, plain, NULL, {"ID":n}, missing_endpoint, NULL, NULL)` for `n` 2, 3 and 4.

Case 2, a link pipeline `projected` with the step `SELECT FROM_ID, TO_ID FROM input`. Expected: the same final row, `without_id` 3, and three issue rows whose `key` is `NULL`.

**`assign_ids_ranges`**. Namespace `demo`, entity type `https://example.com/entity/v/1`, source `SELECT range AS ID FROM range(150000)` with the primary key `ID`. The table needs three ranges. Expected: `_target/entity/sink` has 150,000 rows and 150,000 distinct `_entity_id` values, and `without_id` is 0. Rows on both sides of each range boundary:

| `ID` | `_entity_id` |
| --- | --- |
| 0 | `W~6797432a-0e7a-5e1b-93e4-bb7355dd73ee` |
| 65535 | `W~8357f013-c750-578a-89e4-3c9750b0a40d` |
| 65536 | `W~e34f8463-73b1-5a56-914a-d31bd046b4cb` |
| 131072 | `W~45229dba-4b5e-5da2-a499-69c04c1cd93a` |
| 149999 | `W~127d7aa6-bd5b-5d23-9c7c-2e26daefda77` |

The test also asserts `SELECT count(*) FROM "_target/entity/sink" WHERE _source_id <> ID::VARCHAR` returns 0, which shows that every ID was joined to its own row.

**`property_columns_resolution`** (unit test, no workspace).

| Properties | Table columns | Expected |
| --- | --- | --- |
| `model` from `MODEL` | `_op`, `_key`, `tail`, `model` | `model` |
| `empty-mass` from `{ amount: EMPTY_MASS, unit: MASS_UNIT }`, `first-flight` from `{ column: FIRST_FLIGHT, coerce: date }`, `model` from `MODEL` | The aircraft columns | `EMPTY_MASS`, `MASS_UNIT`, `FIRST_FLIGHT`, `MODEL` |
| Two properties that both read `NAME` | `ID`, `NAME` | `NAME` once |
| No properties | Any | Empty |
| `model` from `MODEL` | `ID` | `Permanent`, `query_invalid` |

**`issues_table_empty`**. `issues_table(workspace, &[])`. Expected: the table `_issues` has the columns `kind`, `target`, `entity_id`, `key`, `issue`, `property`, `reason`, all `VARCHAR`, and no rows.

### 7.4 `engine/src/run/error.rs`, unit tests

The shared mapping functions are tested in `shared-run.md` section 7.2. This spec adds one case:

**`code_stage_two_variants`** (rstest over `CaptureMissing` and `RowKey`). Expected: `as_str` returns `capture_missing` and `row_key`, `kind` returns `StageError::Permanent`, and `Code::of(&code.report())` returns the code.

### 7.5 Existing tests and where they go

| Test | Today | After this spec |
| --- | --- | --- |
| `engine/tests/pipeline.rs:502` `definition_aviation_tables` | Runs the loop by hand. | It stays as a test of the workspace methods and gains the link hash assertion. `prepare_rows_first_run` covers the loop. |
| `engine/tests/pipeline.rs:184` `staging_invalid_columns` | Asserts `ReservedColumn` and `MissingColumn`. | It stays. `stage_sources_invalid_columns` covers the mapping. |
| `engine/tests/pipeline.rs:426` `staging_empty_source` | An empty source keeps its columns. | It stays. `prepare_rows_empty_source` covers the whole path. |
| `engine/tests/entity_id.rs:23` `derive_entity_id_recorded_vectors` | The eight vectors. | It stays. `assign_ids_recorded_vectors` runs them through a table. |
| `engine/src/graph/property/tests.rs:170` `rendered_text` | The text of a `DOUBLE`, a `DECIMAL` and a `TIMESTAMP`. | It moves to `engine/src/workspace/value.rs`. |
| `engine/src/graph/tests.rs:79`, `:94`, `:109` | Entity and link IDs of the typed operations. | They stay until the stage 3 spec changes the operations. |
| `engine/src/sources/tests.rs:177`, `:266` (checkout) | Use `SourceReader::stage_sources` to read captured rows. | They call `load_capture` and `stage_table`, as in section 5. |
| Labs `tests/golden_test.rs:301` | Five struct hashes against DuckDB. | Ported as `pipeline_recorded_hashes`. The whole-row hashes are left behind, because the monorepo has no whole-row hash. |
| Labs `src/engine/candidate.rs:683` `empty_source_still_materializes_its_checkpoint` | An empty source gives an empty definition checkpoint. | Covered by `prepare_rows_empty_source`: the link pipeline's table is empty. |

## 8. Open questions and contract problems

### Open questions

1. **`rowid` was not tested.** The design depends on three DuckDB facts that no existing test covers: a table created with `CREATE OR REPLACE TABLE … AS SELECT` has a `rowid` that is unique per row; the `rowid` of a row stays the same while the table is not replaced; and a column named `rowid` hides it. `assign_ids_ranges` tests the first two, and `pipeline_reserved_columns` shows whether DuckDB accepts a column named `rowid` at all. If one of the first two does not hold, `hashed_table` adds the row key as a column: `SELECT row_number() OVER () - 1 AS _row, source.*, {hash} AS _content_hash …`, and the range queries and the join use `_row`. The final table then selects the columns of the hashed table without `_row`.
2. **`UNION ALL` in a workspace statement was not tested.** `issues_table` needs it. The `SELECT` check passes SQL through `json_serialize_sql` (`engine/src/workspace/select.rs:22`). `issues_table_empty` and `assign_ids_missing_id` show whether a set operation passes.
3. **The scan of a range query.** 4.9 states the cost if DuckDB scans all row keys per range. If a profile shows this for large targets, `ID_RANGE_ROWS` is raised. The memory per range grows in proportion.
4. **Two columns with the same name in one `SELECT`.** How DuckDB names the second column of `CREATE TABLE … AS SELECT source.*, … AS _content_hash` when `source` already has `_content_hash` was not checked. `check_reserved` makes the case impossible.
5. **Disk use.** The hashed table and the ID table of a target are not read again after `assign_ids` returns, unless a row has no ID. The first version keeps them until the workspace closes. Replacing each with an empty table through `Workspace::create_table` would free their blocks for later targets. This is left until a run reaches `WorkspaceConfig::disk_limit`.
6. **`DiskLimit` is now `Retryable`.** An earlier version of this spec made `StatementError::DiskLimit` `Permanent` with its own code, because the same input needs the same disk space. The shared table maps it to `workspace_unavailable`, which is `Retryable`, because another worker or a changed setting can let the same input succeed (`shared-run.md` section 6). This spec follows the shared table. A run that exceeds the limit on every worker is retried until the retry policy of the run interface stops it.
7. **The struct text of the current DuckDB version.** See `pipeline_recorded_hashes` in 7.2.
8. **`coverage` on a source of kind `Checkpoint`.** Such a source has a `coverage` field (`definition/src/source/mod.rs:143-146`) and no capture. The contract "Guards" lets such a source stand for the sources of the producing pipeline, and `TargetRows::sources` holds captured sources only, so the field has no effect. D6 covers partial sources.

### Contract problems

1. **Reserved-column classification, resolved in this review.** Shared error mapping now preserves `reserved_column` through `PreparationError::Step`; accessor validation precedes column-existence checks. Stage 2 does not add its own mapping.

### Required reserved-accessor cases

Test this application rule through target preparation, not only the name-check helper. For both a sink and a link target, a plain accessor on present `_key`, an accessor on absent `_row`, a coerced accessor on `_OP`, and a measure with a reserved amount or unit column fail with permanent `reserved_column`, including with zero rows. A normal target still carries `_key` metadata; selecting `_key AS source_key` and mapping `source_key` succeeds and produces one metadata column plus one property column. The resulting `changes` file must load and plan without duplicate column names.

The shared export validation in `shared-run.md`, "Checkpoint decimal validation", applies when prepared rows are stored. It changes no hash or ID calculation here.
