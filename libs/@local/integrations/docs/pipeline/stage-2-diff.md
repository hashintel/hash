# Stage 2: the stage function and step 4 (diff)

This spec implements the stage function `diff` and step 4 of [`01-contracts.md`](01-contracts.md). [`stage-2-rows.md`](stage-2-rows.md) covers `prepare_rows` and everything below it.

Paths are relative to `libs/@local/integrations/` unless they start with `apps/` or `tests/`. Line numbers under `engine/src/storage` and the line `engine/src/sql.rs:31` are those of the checkout branch. All other monorepo line numbers are those of `origin/main` at `c47a17eed3`. Labs paths are relative to `pocs/integrations_rs` at `40a8d14`. No SQL in this file was run.

## 1. Purpose

The stage function `diff` turns checkpoint 1 into checkpoint 2. It opens a DuckDB workspace, calls `prepare_rows`, which produces one table per target, and then runs step 4. Step 4 joins all rows of the run with the base run's hash table on entity ID, labels each entity ID, applies the three guards, and writes the files `hashes`, `changes`, `archives` and `issues`. The stage keeps no state of its own: every input is a file named by `CaptureOutput`, by `current.json`, or by a marker of an earlier run.

## 2. Module layout

All files are under `engine/src/stage/diff/`. The files of steps 2 and 3 are named by `stage-2-rows.md`.

| File | Content | Items and visibility |
| --- | --- | --- |
| `mod.rs` | The stage function, the output types, and the helpers every step 4 file uses. | `pub`: `diff`, `DiffOutput`, `TargetDiff`, `DiffCounts`. Private: `compute`, `resends_all`, `create`, `select`, `unexpected_row`, `empty_sql`, the table name constants, `HASH_COLUMNS`, `ROW_COLUMNS`. |
| `prior.rs` | What the run starts from: the base run's hash table and the resend set. | `pub(super)`: `load_base`, `load_resend`, `MarkerMissing`. Private: `load_sending`, `load_rejected`, `marker_missing`, `resend_sql`, `carried_sql`. |
| `union.rs` | The union of all targets' rows and the duplicate guard. | `pub(super)`: `union_rows`, `check_duplicates`, `DuplicateEntityIds`, `DuplicateEntityId`. Private: `union_sql`, `DUPLICATES_SQL`. |
| `coverage.rs` | The source coverage rule. | `pub(super)`: `Protection`, `protected_targets`. Private: `keeps_rows`. |
| `labels.rs` | The join that labels every entity ID and builds the new hash table rows. | `pub(super)`: `label_rows`. Private: `label_sql`, `protected_sql`. |
| `totals.rs` | The counts per target and the archive limit. | `pub(super)`: `TargetTotals`, `read_totals`, `check_archive_limit`, `ArchiveLimitExceeded`. Private: `TOTALS_SQL`. |
| `files.rs` | The four kinds of checkpoint file and `DiffOutput::targets`. | `pub(super)`: `store_hashes`, `store_archives`, `store_issues`, `store_targets`. Private: `key_column`, `changes_sql`, `HASHES_SQL`, `ARCHIVES_SQL`. |
| `tests.rs` | The tests of section 7. | The module is compiled only for tests. |

A child module reads the private items of `mod.rs` through `super::`. `mod.rs` declares `mod rows;`, the directory of `stage-2-rows.md`. `engine/src/lib.rs` gets `mod stage;` and exports the four `pub` items of `mod.rs`.

`prior.rs` imports `PlanOutput` from `stage::plan` and `SendOutput` from `stage::send`, and nothing else from those modules. The contract "Module tree" allows a stage module to import the output type of another stage.

## 3. Types

`DiffOutput`, `TargetDiff` and `DiffCounts` are given in the contracts' section "Checkpoint 2: `DiffOutput`". This spec adds only their derives.

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffOutput { /* fields as in the contracts */ }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TargetDiff { /* fields as in the contracts */ }

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffCounts { /* fields as in the contracts */ }
```

The field names in JSON are the Rust field names.

Types that the contracts do not give:

```rust
/// The counts of one `(kind, target)` group of the diff result.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(super) struct TargetTotals {
    /// Entity IDs labelled `insert`.
    pub inserted: u64,
    /// Entity IDs labelled `update`.
    pub updated: u64,
    /// Entity IDs labelled `resend`.
    pub resent: u64,
    /// Entity IDs that the run has a row for and that have no label.
    pub unchanged: u64,
    /// Entity IDs labelled `archive`.
    pub archived: u64,
    /// Archives that count toward the archive limit.
    pub limited: u64,
    /// Entity IDs whose base row has `live = true`.
    pub was_live: u64,
}

/// The entity IDs that more than one row of the run has.
#[derive(Debug, derive_more::Display)]
#[display("{count} entity IDs have more than one row")]
pub(super) struct DuplicateEntityIds {
    /// The number of entity IDs with more than one row.
    pub count: u64,
    /// At most five of them, in the order of their entity IDs.
    pub examples: Vec<DuplicateEntityId>,
}

/// One entity ID that more than one row of the run has.
#[derive(Debug)]
pub(super) struct DuplicateEntityId {
    /// The entity ID as `{web}~{uuid}`.
    pub entity_id: Box<str>,
    /// The number of rows with this entity ID.
    pub rows: u64,
    /// The smallest `{kind}/{target}` among those rows.
    pub first_target: Box<str>,
    /// The largest `{kind}/{target}` among those rows.
    pub last_target: Box<str>,
}

/// The base rows that the source coverage rule keeps live.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(super) struct Protection {
    /// The targets of the definition to which the coverage rule applies.
    pub protected: BTreeSet<Target>,
    /// Every target of the definition.
    pub defined: BTreeSet<Target>,
}

/// The run would archive more rows of one kind than the archive limit allows.
#[derive(Debug, derive_more::Display)]
#[display("the run would archive {archives} of {live} live {kind} rows")]
pub(super) struct ArchiveLimitExceeded {
    pub kind: Kind,
    /// The archives that count toward the limit.
    pub archives: u64,
    /// The base rows of `kind` with `live = true`.
    pub live: u64,
}

/// A run named by `current.json` lacks a marker it must have.
#[derive(Debug, derive_more::Display)]
#[display("run {run} has no `{marker}/_done.json`")]
pub(super) struct MarkerMissing {
    pub run: RunId,
    /// `diff`, `plan` or `send`.
    pub marker: &'static str,
}
```

`DuplicateEntityIds`, `ArchiveLimitExceeded` and `MarkerMissing` are attachments of a `Report<StageError>`. They hold entity IDs, target names, run IDs and counts, and no row value.

`Protection::defined` is filled also when `protected` is empty. `protected_sql` reads it only when `protected` is not empty.

This spec uses these items of the shared `run` module, as `shared-run.md` sections 3 and 4 give them:

- `Kind::as_str`, `Change::as_str` and `FromStr` of `Kind`.
- `Target::new(kind, id)`, `Target::kind()` and `Target::id()`. `Target` displays as `{kind}/{id}` and is serialized as that text, so it is the key of `DiffOutput::targets` in JSON.
- `Code` with `Code::report` and `Code::wrap`, and the mapping functions `error::statement`, `error::close` and the others of `run/error.rs`. Step 4 adds no variant to `Code`.
- The key builders `ArtifactNamespace::diff_output`, `plan_output` and `send_output`. Each takes `Uuid::from(run)`.
- `RunContext::open_workspace`, `finished`, `finish`, `read`, `load_table` and `store_query`. `load_table` downloads a file with `RunContext::fetch`, and `store_query` stores one with `RunContext::publish`.

## 4. Functions

### Constraints of `Workspace`

- Every `sql` argument is one `SELECT` statement. `Select::check` refuses anything else (`engine/src/workspace/select.rs:37`). Step 4 therefore builds every table with `Workspace::create_table` (`engine/src/workspace/mod.rs:404`) and has no `INSERT`, `UPDATE` or `DROP`.
- A query cannot open a file. The only table functions are `generate_series`, `range` and `unnest` (`engine/src/workspace/select.rs:14`). A Parquet file enters the workspace through `load_table` and leaves it through `store_query`.
- `create_table` runs `CREATE OR REPLACE TABLE` (`engine/src/workspace/connection/mod.rs:315`). Building a table again replaces it.
- No method drops a table. Every table of the stage lives until the database is removed.
- `Workspace::query` returns all rows in memory (`engine/src/workspace/connection/mod.rs:286-293`). Step 4 calls it for the duplicate guard, which returns at most five rows, for the totals, which return one row per target, and once per `changes` file to find the column `_key`, which returns one row.
- A query reads `$NAME` parameters from `WorkspaceConfig::variables` (`engine/src/workspace/connection/mod.rs:241`). The SQL of step 4 has no parameter. Names and texts are written as quoted identifiers (`Identifier`, `engine/src/sql.rs:9`) and string literals (`literal`, `engine/src/sql.rs:31`).
- DuckDB compares identifiers without regard to case (`engine/src/sql.rs:7`).

### Workspace tables of step 4

Every table of step 4 has the prefix `_diff/`. The existing code uses `_capture/`, `_source/` and `_step/` (`engine/src/sources/mod.rs:315-316`, `engine/src/workspace/connection/pipeline.rs:240`).

| Constant | Table | Columns | Built by |
| --- | --- | --- | --- |
| `BASE` | `_diff/base` | The columns of `hashes`. | `load_base` |
| `REJECTED` | `_diff/rejected` | The columns of `rejected`. | `load_rejected` |
| none | `_diff/sending/{n}/writes` | The columns of `writes`. `{n}` is the position of the run in `Current::sending`, from 0. | `load_sending` |
| none | `_diff/sending/{n}/hashes` | The columns of `hashes`. | `load_sending` |
| `RESEND` | `_diff/resend` | `entity_id`. One row per entity ID of the resend set. | `load_resend` |
| `CARRIED` | `_diff/carried` | `entity_id`, `kind`, `target`, `source_id`, `content_hash`. One row per entity ID that a listed run wrote and the base does not have. | `load_resend` |
| `ROWS` | `_diff/rows` | `entity_id`, `kind`, `target`, `source_id`, `content_hash`. One row per row of the run. | `union_rows` |
| `RESULT` | `_diff/result` | `entity_id`, `kind`, `target`, `source_id`, `content_hash`, `live`, `change`, `present`, `was_live`, `resend`. One row per entity ID. | `label_rows` |

In `_diff/result` the first six columns are the row of the new hash table. `change` is `insert`, `update`, `resend`, `archive` or null. `present` is true when the run has a row for the entity ID. `was_live` is true when the base has the entity ID with `live = true`. `resend` is true when the entity ID is in the resend set.

### `diff` (`mod.rs`)

```rust
pub async fn diff(
    context: &RunContext,
    input: &RunInput,
    capture: &CaptureOutput,
) -> Result<DiffOutput, Report<StageError>>
```

Steps:

1. Build the marker key and call `finished`. Return the stored output when there is one.
2. Call `read` of `run/current.rs`. This is the only read of `current.json` in the stage.
3. Parse the definition once with `RunInput::parse_definition`. A restore to empty has none.
4. Open the workspace with `RunContext::open_workspace` and the definition's variables (`Definition::variables`, `definition/src/definition/mod.rs:92`). A run without a definition gets empty variables.
5. Call `compute`.
6. Close the workspace with `Workspace::close`, whether `compute` succeeded or failed.
7. Return the error of `compute`, if any. Otherwise return the error of the close, if any.
8. Call `finish` and return what it returns.

```rust
pub async fn diff(context, input, capture) -> Result<DiffOutput, Report<StageError>> {
    let key = context.namespace.diff_output(Uuid::from(input.run));
    if let Some(output) = finished::<DiffOutput>(context, &key).await? {
        return Ok(output);
    }
    let current = read(context).await?;
    let definition = input.parse_definition()?;
    let variables = definition
        .as_ref()
        .map_or_else(Variables::default, |definition| definition.variables().clone());
    let workspace = context.open_workspace(variables).await?;
    let computed = compute(context, &workspace, input, capture, definition.as_ref(), &current).await;
    let closed = workspace.close().await.map_err(error::close);
    let output = computed?;
    closed?;
    finish(context, &key, &output).await
}
```

The function has a `tracing::instrument` span with the run ID as a field, written as at `engine/src/sources/mod.rs:224`.

The run itself is never listed in `Current::sending` at step 2. `mark_sending` runs in stage 4, after the run's `diff/_done.json` exists, and step 1 then returns.

The database file of the workspace stays in `RunContext::scratch` after the close. The caller removes it with the scratch directory (`shared-run.md` section 4.5). When the stage's future is dropped, the workspace is dropped without a close, and the file stays as well.

Errors: those of `finished`, `read`, `RunInput::parse_definition`, `RunContext::open_workspace`, `compute` and `finish`, unchanged. A failed close gives `workspace_unavailable` through `error::close`.

### `compute` (`mod.rs`)

```rust
async fn compute(
    context: &RunContext,
    workspace: &Workspace,
    input: &RunInput,
    capture: &CaptureOutput,
    definition: Option<&Definition>,
    current: &Current,
) -> Result<DiffOutput, Report<StageError>>
```

Steps:

1. Load the base run's hash table.
2. Build the resend tables.
3. Call `prepare_rows`.
4. Build the union of all targets' rows.
5. Run the duplicate guard.
6. Compute the `Protection` of the source coverage rule.
7. Run the diff.
8. Read the totals.
9. Check the archive limit, unless `RunInput::allow_mass_archive` is true.
10. Store `hashes`, `archives` and `issues`.
11. Store the `changes` files and build `DiffOutput::targets`.
12. Return the output with `base` set to `Current::committed` and `resent` set to `Current::sending`, in the listed order.

```rust
async fn compute(context, workspace, input, capture, definition, current)
    -> Result<DiffOutput, Report<StageError>>
{
    load_base(context, workspace, current.committed).await?;
    load_resend(context, workspace, current).await?;
    let prepared = prepare_rows(context, workspace, input, definition, capture).await?;
    union_rows(workspace, &prepared.targets).await?;
    check_duplicates(workspace).await?;
    let protection = definition
        .map(|definition| protected_targets(definition, capture, &prepared.targets))
        .unwrap_or_default();
    label_rows(workspace, &protection, resends_all(&input.operation)).await?;
    let totals = read_totals(workspace).await?;
    if !input.allow_mass_archive {
        check_archive_limit(&totals)?;
    }
    Ok(DiffOutput {
        base: current.committed,
        resent: current.sending.clone(),
        hashes: store_hashes(context, workspace).await?,
        archives: store_archives(context, workspace).await?,
        issues: store_issues(context, workspace, &prepared.issues).await?,
        targets: store_targets(context, workspace, &prepared.targets, totals).await?,
    })
}
```

Steps 1 and 2 come before `prepare_rows`, so a missing marker fails the stage before the definition's SQL runs. No file is stored before both guards have passed.

A restore to empty needs no branch. `prepare_rows` returns no targets, so `_diff/rows` is empty, `protection` is empty, and every base row with `live = true` is archived.

Errors: those of the functions it calls, unchanged.

### `resends_all` (`mod.rs`)

```rust
const fn resends_all(operation: &Operation) -> bool {
    matches!(operation, Operation::Apply { resend_all: true } | Operation::Reconcile { .. })
}
```

The function returns true for a reconcile and for an apply with `resend_all`.

### `create`, `select`, `unexpected_row`, `empty_sql` (`mod.rs`)

```rust
/// Replaces `table` with the rows of `sql`.
async fn create(workspace: &Workspace, table: &str, sql: String) -> Result<(), Report<StageError>> {
    workspace.create_table(table.into(), sql.into_boxed_str()).await.map_err(error::statement)
}

/// Runs `sql` and returns its rows.
async fn select(workspace: &Workspace, sql: String) -> Result<Rows, Report<StageError>> {
    workspace.query(sql.into_boxed_str()).await.map_err(error::statement)
}

/// The error for a result row that does not have the columns the query selects.
fn unexpected_row() -> Report<StageError> {
    Code::QueryInvalid.report()
}

/// A query that returns no rows and has `columns`, each given as a name and a DuckDB type.
fn empty_sql(columns: &[(&str, &str)]) -> String;
```

`error::statement` gives each `StatementError` its code as in `shared-run.md` section 6. `empty_sql(&[("entity_id", "VARCHAR"), ("live", "BOOLEAN")])` returns:

```sql
SELECT CAST(NULL AS VARCHAR) AS "entity_id", CAST(NULL AS BOOLEAN) AS "live" WHERE FALSE
```

Two column lists are used: `HASH_COLUMNS` is `entity_id`, `kind`, `target`, `source_id`, `content_hash`, all `VARCHAR`, and `live`, `BOOLEAN`. `ROW_COLUMNS` is `HASH_COLUMNS` without `live`.

### `load_base` (`prior.rs`)

```rust
pub(super) async fn load_base(
    context: &RunContext,
    workspace: &Workspace,
    base: Option<RunId>,
) -> Result<(), Report<StageError>>
```

Steps:

1. Without a base, create `_diff/base` as an empty table with `HASH_COLUMNS` and return. Every row of the run is then absent from the base.
2. Read the base run's `diff/_done.json` with `finished`. Fail when it does not exist.
3. Load `DiffOutput::hashes` of the base run into `_diff/base` with `load_table`.

```rust
pub(super) async fn load_base(context, workspace, base) -> Result<(), Report<StageError>> {
    let Some(base) = base else {
        return create(workspace, BASE, empty_sql(HASH_COLUMNS)).await;
    };
    let output = finished::<DiffOutput>(context, &context.namespace.diff_output(Uuid::from(base)))
        .await?
        .ok_or_else(|| marker_missing(base, "diff"))?;
    load_table(context, workspace, &output.hashes, BASE.into()).await
}
```

Errors: Permanent, `marker_missing`, when the base run has no `diff/_done.json`. Otherwise those of `finished` and `load_table`. A hash table file that cannot be downloaded is reported by `load_table` with its own kind.

### `marker_missing` (`prior.rs`)

```rust
fn marker_missing(run: RunId, marker: &'static str) -> Report<StageError> {
    Code::MarkerMissing.report().attach(MarkerMissing { run, marker })
}
```

`marker_missing` is a code of the contract "Errors", with the kind Permanent: nothing is deleted (D10), so a marker that is absent now stays absent.

### `load_resend` (`prior.rs`)

```rust
pub(super) async fn load_resend(
    context: &RunContext,
    workspace: &Workspace,
    current: &Current,
) -> Result<(), Report<StageError>>
```

Steps:

1. For each run in `Current::sending`, in the listed order, load its `writes` file and its hash table with `load_sending`.
2. When a run is committed, load its `rejected` file with `load_rejected`.
3. Create `_diff/resend` from `resend_sql`.
4. Create `_diff/carried` from `carried_sql`.

```rust
pub(super) async fn load_resend(context, workspace, current) -> Result<(), Report<StageError>> {
    for (position, run) in current.sending.iter().enumerate() {
        load_sending(context, workspace, position, *run).await?;
    }
    let rejected = match current.committed {
        Some(base) => load_rejected(context, workspace, base).await?,
        None => false,
    };
    create(workspace, RESEND, resend_sql(current.sending.len(), rejected)).await?;
    create(workspace, CARRIED, carried_sql(current.sending.len())).await
}
```

Errors: those of `load_sending`, `load_rejected` and `create`.

### `load_sending` (`prior.rs`)

```rust
async fn load_sending(
    context: &RunContext,
    workspace: &Workspace,
    position: usize,
    run: RunId,
) -> Result<(), Report<StageError>> {
    let plan = finished::<PlanOutput>(context, &context.namespace.plan_output(Uuid::from(run)))
        .await?
        .ok_or_else(|| marker_missing(run, "plan"))?;
    let diff = finished::<DiffOutput>(context, &context.namespace.diff_output(Uuid::from(run)))
        .await?
        .ok_or_else(|| marker_missing(run, "diff"))?;
    load_table(context, workspace, &plan.writes, format!("_diff/sending/{position}/writes").into()).await?;
    load_table(context, workspace, &diff.hashes, format!("_diff/sending/{position}/hashes").into()).await
}
```

Steps:

1. Read the run's `plan/_done.json` and `diff/_done.json`. A run is listed in `sending` only after stage 3 finished, so both exist.
2. Load `PlanOutput::writes` and `DiffOutput::hashes` into the two tables of that position.

The run's `send/_done.json` is not read. Every entity ID of its `writes` file joins the resend set, whether or not the write was sent.

Errors: Permanent, `marker_missing`, when one of the two markers does not exist. Otherwise those of `finished` and `load_table`.

### `load_rejected` (`prior.rs`)

```rust
/// Loads the base run's rejected writes and returns whether there are any.
async fn load_rejected(
    context: &RunContext,
    workspace: &Workspace,
    base: RunId,
) -> Result<bool, Report<StageError>> {
    let send = finished::<SendOutput>(context, &context.namespace.send_output(Uuid::from(base)))
        .await?
        .ok_or_else(|| marker_missing(base, "send"))?;
    let Some(rejected) = send.rejected else {
        return Ok(false);
    };
    load_table(context, workspace, &rejected, REJECTED.into()).await?;
    Ok(true)
}
```

Steps:

1. Read the base run's `send/_done.json`. Stage 4 writes it before it commits, so a committed run has it.
2. Return false when `SendOutput::rejected` is absent.
3. Load the file into `_diff/rejected` and return true.

Errors: Permanent, `marker_missing`, when the base run has no `send/_done.json`. Otherwise those of `finished` and `load_table`.

### `resend_sql` (`prior.rs`)

```rust
fn resend_sql(sending: usize, rejected: bool) -> String
```

Steps:

1. Write one `SELECT entity_id` per listed run and one for `_diff/rejected` when `rejected` is true.
2. With no part, return `empty_sql(&[("entity_id", "VARCHAR")])`.
3. Otherwise join the parts with `UNION ALL` and select the distinct entity IDs.

For two listed runs and a `rejected` file the result is:

```sql
SELECT DISTINCT entity_id
FROM (
    SELECT entity_id FROM "_diff/sending/0/writes"
    UNION ALL
    SELECT entity_id FROM "_diff/sending/1/writes"
    UNION ALL
    SELECT entity_id FROM "_diff/rejected"
) AS listed
```

### `carried_sql` (`prior.rs`)

```rust
fn carried_sql(sending: usize) -> String
```

Steps:

1. With no listed run, return `empty_sql(ROW_COLUMNS)`.
2. Otherwise write, per listed run, the rows of its hash table whose entity ID is in its `writes` file, with the run's position in `Current::sending` as `ordinal`.
3. Keep the rows whose entity ID the base does not have.
4. Keep, per entity ID, the row of the run listed last.

For two listed runs the result is:

```sql
SELECT entity_id, kind, target, source_id, content_hash
FROM (
    SELECT h.entity_id, h.kind, h.target, h.source_id, h.content_hash, 0 AS ordinal
    FROM "_diff/sending/0/hashes" AS h
    WHERE EXISTS (SELECT 1 FROM "_diff/sending/0/writes" AS w WHERE w.entity_id = h.entity_id)
    UNION ALL
    SELECT h.entity_id, h.kind, h.target, h.source_id, h.content_hash, 1 AS ordinal
    FROM "_diff/sending/1/hashes" AS h
    WHERE EXISTS (SELECT 1 FROM "_diff/sending/1/writes" AS w WHERE w.entity_id = h.entity_id)
) AS failed
WHERE NOT EXISTS (SELECT 1 FROM "_diff/base" AS b WHERE b.entity_id = failed.entity_id)
QUALIFY row_number() OVER (PARTITION BY entity_id ORDER BY ordinal DESC) = 1
```

What the two tables hold:

- `_diff/resend` holds the resend set of the contracts' section "The resend set".
- `_diff/carried` holds the rows that the new hash table copies from a failed run. An entity ID of a `rejected` file needs no such row: a rejected write is a write of the base run, and every write of a run is in that run's hash table.
- The query relies on one rule of checkpoints 2 and 3: every entity ID of a `writes` file is in the hash table of the same run, because a write comes from `changes` or `archives`. An entity ID that broke this rule would stay in `_diff/resend` and get no row in `_diff/carried`.
- When a later listed run resent an earlier one, the later `writes` file holds every entity ID of the earlier one. The stage still reads every listed run and records all of them in `DiffOutput::resent`.

### `union_rows` and `union_sql` (`union.rs`)

```rust
pub(super) async fn union_rows(
    workspace: &Workspace,
    targets: &[TargetRows],
) -> Result<(), Report<StageError>> {
    create(workspace, ROWS, union_sql(targets)).await
}

fn union_sql(targets: &[TargetRows]) -> String
```

Steps of `union_sql`:

1. With no target, return `empty_sql(ROW_COLUMNS)`.
2. Otherwise write one `SELECT` per target that reads the three engine columns of its table and adds the kind and the ID of the target as literals.
3. Join the parts with `UNION ALL`.

Each target has its own columns, so the union reads only the columns every target's table has: `_entity_id`, `_source_id` and `_content_hash`. The kind is written with `literal(target.kind().as_str())` and the ID with `literal(target.id())`. For D0 of the scenarios the result is, with the table names `prepare_rows` returns:

```sql
SELECT "_entity_id" AS entity_id, 'entity' AS kind, 'sink-airfields' AS target, "_source_id" AS source_id, "_content_hash" AS content_hash FROM "_target/entity/sink-airfields"
UNION ALL
SELECT "_entity_id" AS entity_id, 'entity' AS kind, 'sink-aircraft' AS target, "_source_id" AS source_id, "_content_hash" AS content_hash FROM "_target/entity/sink-aircraft"
UNION ALL
SELECT "_entity_id" AS entity_id, 'link' AS kind, 'aircraft-based-at' AS target, "_source_id" AS source_id, "_content_hash" AS content_hash FROM "_target/link/aircraft-based-at"
```

Errors: those of `create`.

### `check_duplicates` (`union.rs`)

```rust
pub(super) async fn check_duplicates(workspace: &Workspace) -> Result<(), Report<StageError>>
```

`DUPLICATES_SQL`:

```sql
SELECT
    entity_id,
    CAST(count(*) AS UBIGINT) AS row_count,
    min(kind || '/' || target) AS first_target,
    max(kind || '/' || target) AS last_target,
    CAST(count(*) OVER () AS UBIGINT) AS duplicates
FROM "_diff/rows"
GROUP BY entity_id
HAVING count(*) > 1
ORDER BY entity_id
LIMIT 5
```

Steps:

1. Run `DUPLICATES_SQL`. It has one `GROUP BY` over all targets together (P13). The window count runs after `HAVING` and before `LIMIT`, so `duplicates` is the number of entity IDs with more than one row.
2. Return `Ok` when the query returns no row.
3. Otherwise build `DuplicateEntityIds` from the rows and fail.

```rust
pub(super) async fn check_duplicates(workspace) -> Result<(), Report<StageError>> {
    let rows = select(workspace, DUPLICATES_SQL.to_owned()).await?;
    let mut count = 0;
    let mut examples = Vec::new();
    for row in rows.iter() {
        let [Value::Text(entity_id), Value::UBigInt(row_count), Value::Text(first), Value::Text(last), Value::UBigInt(duplicates)] = row
        else { return Err(unexpected_row()) };
        count = *duplicates;
        examples.push(DuplicateEntityId {
            entity_id: entity_id.as_str().into(),
            rows: *row_count,
            first_target: first.as_str().into(),
            last_target: last.as_str().into(),
        });
    }
    if examples.is_empty() {
        return Ok(());
    }
    Err(Code::DuplicateEntityId.report().attach(DuplicateEntityIds { count, examples }))
}
```

`first_target` and `last_target` differ when two targets produce the same entity ID, and are equal when one target produces it twice.

Errors: Permanent, `duplicate_entity_id`. Otherwise those of `select`.

### `protected_targets` and `keeps_rows` (`coverage.rs`)

```rust
/// Returns the targets to which the coverage rule applies, and every target of the definition.
pub(super) fn protected_targets(
    definition: &Definition,
    capture: &CaptureOutput,
    targets: &[TargetRows],
) -> Protection {
    Protection {
        protected: targets
            .iter()
            .filter(|rows| rows.sources.iter().any(|source| keeps_rows(definition, capture, source)))
            .map(|rows| rows.target.clone())
            .collect(),
        defined: targets.iter().map(|rows| rows.target.clone()).collect(),
    }
}

/// Returns whether `source` stops the targets that read it from archiving.
fn keeps_rows(definition: &Definition, capture: &CaptureOutput, source: &SourceName) -> bool {
    match definition.sources().get(source).map(|source| source.coverage) {
        Some(Coverage::Partial) | None => true,
        Some(Coverage::Complete) => capture.sources.get(source).is_some_and(|captured| captured.rows == 0),
        Some(Coverage::CompleteOrEmpty) => false,
    }
}
```

Steps of `protected_targets`:

1. For each target, read `TargetRows::sources`.
2. Put the target in `protected` when at least one of those sources keeps rows.
3. Put every target in `defined`. `prepare_rows` returns one `TargetRows` for every sink and link pipeline of the definition.

Rules of `keeps_rows`, per coverage (`Coverage`, `definition/src/source/mod.rs:85`; `Source::coverage`, `definition/src/source/mod.rs:145`):

- `Partial`: the source keeps rows.
- `Complete`: the source keeps rows when `CaptureOutput::sources` has an entry for it and `CapturedSource::rows` is 0.
- `CompleteOrEmpty`: the source never keeps rows.
- A source name that the definition does not have keeps rows. `prepare_rows` does not return such a name. The function then archives nothing for that target.

`TargetRows::sources` holds the captured sources on the target's data path, as the contract "Guards" states: a source of kind `Checkpoint` is replaced by the sources of the pipeline that produces its definition checkpoint. Every name in it therefore has an entry in `CaptureOutput::sources` (`stage-2-rows.md`).

`label_sql` protects a base row when its target is in `protected`. When `protected` is not empty, it also protects a base row whose target is not in `defined`. This is the contract's rule that the base rows of targets the definition no longer has stay `live = true` when the coverage rule applies to at least one target of the run. A sink renamed in the run in which its source is empty or partial therefore archives nothing.

`engine/src/sources/fingerprint.rs:64-72` is the only other reader of `Source::coverage`.

A restore to empty has no definition and no `TargetRows`. `compute` then uses an empty `Protection`, so the rule does not apply.

Errors: none.

### `label_rows`, `label_sql`, `protected_sql` (`labels.rs`)

```rust
pub(super) async fn label_rows(
    workspace: &Workspace,
    protection: &Protection,
    resend_all: bool,
) -> Result<(), Report<StageError>> {
    create(workspace, RESULT, label_sql(protection, resend_all)).await
}

fn label_sql(protection: &Protection, resend_all: bool) -> String

fn protected_sql(protection: &Protection) -> String
```

`protected_sql` returns `FALSE` when `Protection::protected` is empty. Otherwise it returns a test of the base row's target: the target is protected, or the definition no longer has it. Each target is written with `literal` of its display form `{kind}/{id}`. For S3 run 4 of the scenarios the text is:

```sql
coalesce((p.kind || '/' || p.target) IN ('entity/sink-aircraft', 'link/aircraft-based-at') OR (p.kind || '/' || p.target) NOT IN ('entity/sink-aircraft', 'entity/sink-airfields', 'link/aircraft-based-at'), FALSE)
```

The two lists are in the order of `Target`. `Protection::defined` is not empty when `protected` is not, so the `NOT IN` list is never empty.

`label_sql` returns this text, with `{protected}` replaced by `protected_sql` and `{resend_all}` by `TRUE` or `FALSE`:

```sql
WITH prior AS (
    SELECT entity_id, kind, target, source_id, content_hash, live, TRUE AS in_base
    FROM "_diff/base"
    UNION ALL
    SELECT entity_id, kind, target, source_id, content_hash, FALSE AS live, FALSE AS in_base
    FROM "_diff/carried"
),
joined AS (
    SELECT
        coalesce(r.entity_id, p.entity_id) AS entity_id,
        coalesce(r.kind, p.kind) AS kind,
        coalesce(r.target, p.target) AS target,
        coalesce(r.source_id, p.source_id) AS source_id,
        coalesce(r.content_hash, p.content_hash) AS content_hash,
        r.entity_id IS NOT NULL AS present,
        coalesce(p.in_base, FALSE) AS in_base,
        coalesce(p.live, FALSE) AS was_live,
        coalesce(r.content_hash = p.content_hash, FALSE) AS same_hash,
        s.entity_id IS NOT NULL AS resend,
        {protected} AS protected
    FROM "_diff/rows" AS r
    FULL OUTER JOIN prior AS p ON p.entity_id = r.entity_id
    LEFT JOIN "_diff/resend" AS s ON s.entity_id = coalesce(r.entity_id, p.entity_id)
)
SELECT
    entity_id,
    kind,
    target,
    source_id,
    content_hash,
    present OR (was_live AND protected AND NOT resend) AS live,
    CASE
        WHEN present AND NOT in_base THEN 'insert'
        WHEN present AND NOT was_live THEN 'update'
        WHEN present AND NOT same_hash THEN 'update'
        WHEN present AND (resend OR {resend_all}) THEN 'resend'
        WHEN present THEN NULL
        WHEN NOT in_base THEN 'archive'
        WHEN was_live AND resend THEN 'archive'
        WHEN was_live AND protected THEN NULL
        WHEN was_live THEN 'archive'
        WHEN resend OR {resend_all} THEN 'archive'
        ELSE NULL
    END AS change,
    present,
    was_live,
    resend
FROM joined
```

How the statement is built:

- `prior` holds what earlier runs recorded: every row of the base, and the rows of `_diff/carried`. The two parts share no entity ID, because `carried_sql` leaves out the entity IDs of the base. `in_base` separates them.
- The `FULL OUTER JOIN` on entity ID gives one row per entity ID that is in the run's rows, in `prior`, or in both. The duplicate guard has passed, so `_diff/rows` has one row per entity ID.
- The `LEFT JOIN` to `_diff/resend` adds only the flag `resend`. Every entity ID of the resend set is in the base or in `_diff/carried`, so the join adds no row and loses none.
- The hash table row of a present entity ID takes all five values from the run's row. The rows of a renamed sink therefore get the new `target`. The row of an absent entity ID keeps the values of `prior`.

The branches of `CASE`, in order, and the line of the contracts' table "The diff" each one implements:

| Branch | Line | Meaning |
| --- | --- | --- |
| `present AND NOT in_base` | 1 | The base does not have the entity ID. This covers a run with no base, and an entity ID that only a failed run wrote. |
| `present AND NOT was_live` | 2 | The base has the entity ID with `live = false`. |
| `present AND NOT same_hash` | 3 | The base has it live with another hash. |
| `present AND (resend OR resend_all)` | 4 | The hash is equal, and the entity ID is in the resend set or the run resends everything. |
| `present` | 4 | The hash is equal. The row is unchanged. |
| `NOT in_base` | 7 | Only a failed run has the entity ID. The row comes from `_diff/carried`. |
| `was_live AND resend` | 5 | The row is gone and the entity ID is in the resend set. The coverage rule does not stop this archive. |
| `was_live AND protected` | 5 | The row is gone and the coverage rule keeps it. The row stays `live = true`. |
| `was_live` | 5 | The row is gone. |
| `resend OR resend_all` | 6 | The base has the entity ID with `live = false`, and it is archived again. |
| `ELSE` | 6 | The base has the entity ID with `live = false`. Nothing is written. |

`live` is true for every present entity ID, and for an absent one only in the eighth branch.

How the coverage rule enters: `protected` is tested on the `kind` and `target` of the base row. A base row whose target has left the definition is protected when the rule applies to at least one target of the run, and is archived otherwise. A run that resends everything does not change the eighth branch: a reconcile archives nothing for a target whose source is partial or empty.

Errors: those of `create`.

### `read_totals` (`totals.rs`)

```rust
pub(super) async fn read_totals(
    workspace: &Workspace,
) -> Result<BTreeMap<Target, TargetTotals>, Report<StageError>>
```

`TOTALS_SQL`:

```sql
SELECT
    kind,
    target,
    CAST(count(*) FILTER (WHERE change = 'insert') AS UBIGINT) AS inserted,
    CAST(count(*) FILTER (WHERE change = 'update') AS UBIGINT) AS updated,
    CAST(count(*) FILTER (WHERE change = 'resend') AS UBIGINT) AS resent,
    CAST(count(*) FILTER (WHERE change IS NULL AND present) AS UBIGINT) AS unchanged,
    CAST(count(*) FILTER (WHERE change = 'archive') AS UBIGINT) AS archived,
    CAST(count(*) FILTER (WHERE change = 'archive' AND was_live AND NOT resend) AS UBIGINT) AS limited,
    CAST(count(*) FILTER (WHERE was_live) AS UBIGINT) AS was_live
FROM "_diff/result"
GROUP BY kind, target
ORDER BY kind, target
```

Steps:

1. Run `TOTALS_SQL`. It returns one row per `(kind, target)` of the new hash table.
2. Turn each row into a `Target` and a `TargetTotals`. A row of another shape, or a `kind` that is neither `entity` nor `link`, is `unexpected_row`.

```rust
pub(super) async fn read_totals(workspace) -> Result<BTreeMap<Target, TargetTotals>, Report<StageError>> {
    let rows = select(workspace, TOTALS_SQL.to_owned()).await?;
    let mut totals = BTreeMap::new();
    for row in rows.iter() {
        let [Value::Text(kind), Value::Text(target), Value::UBigInt(inserted), Value::UBigInt(updated),
             Value::UBigInt(resent), Value::UBigInt(unchanged), Value::UBigInt(archived),
             Value::UBigInt(limited), Value::UBigInt(was_live)] = row
        else { return Err(unexpected_row()) };
        let kind = Kind::from_str(kind).map_err(|_| unexpected_row())?;
        let target = Target::new(kind, target).map_err(|_| unexpected_row())?;
        totals.insert(target, TargetTotals { /* the seven counts */ });
    }
    Ok(totals)
}
```

The count definitions, each over the rows of `_diff/result` with the group's `kind` and `target`:

| Count | Definition |
| --- | --- |
| `inserted` | `change = 'insert'`. |
| `updated` | `change = 'update'`. |
| `resent` | `change = 'resend'`. |
| `unchanged` | The run has a row for the entity ID and `change` is null. A base row that the coverage rule keeps live is in no count. |
| `archived` | `change = 'archive'`. This covers lines 5, 6 and 7 of "The diff". |
| `limited` | `change = 'archive'`, the base row has `live = true`, and the entity ID is not in the resend set. These are the archives the contract "Guards" counts for the archive limit. |
| `was_live` | The base has the entity ID with `live = true`. |

`kind` and `target` are those of the new hash table row. For an archive they are the base row's.

Errors: Permanent, `query_invalid`, for a row of another shape. Otherwise those of `select`.

### `check_archive_limit` (`totals.rs`)

```rust
pub(super) fn check_archive_limit(
    totals: &BTreeMap<Target, TargetTotals>,
) -> Result<(), Report<StageError>>
```

Steps:

1. For `Kind::Entity`, then `Kind::Link`, add up `limited` and `was_live` over the targets of that kind.
2. Fail for the first kind whose `archives` is above 1,000 and whose doubled `archives` is above `live`. That is the contract's rule "exceeds the larger of 1,000 and half of the base rows of that kind with `live = true`", written without a division. `limited` holds the archives the contract counts: those of base rows with `live = true` whose entity ID is not in the resend set.

```rust
pub(super) fn check_archive_limit(totals) -> Result<(), Report<StageError>> {
    for kind in [Kind::Entity, Kind::Link] {
        let of_kind = || totals.iter().filter(|(target, _)| target.kind() == kind);
        let archives: u64 = of_kind().map(|(_, totals)| totals.limited).sum();
        let live: u64 = of_kind().map(|(_, totals)| totals.was_live).sum();
        if archives > 1_000 && archives.saturating_mul(2) > live {
            return Err(Code::ArchiveLimit.report().attach(ArchiveLimitExceeded { kind, archives, live }));
        }
    }
    Ok(())
}
```

`compute` skips the call when `RunInput::allow_mass_archive` is true. The limit applies to every operation, also to a restore to empty.

Errors: Permanent, `archive_limit`.

### `store_hashes`, `store_archives`, `store_issues` (`files.rs`)

```rust
pub(super) async fn store_hashes(context: &RunContext, workspace: &Workspace)
    -> Result<ArtifactRef, Report<StageError>>;

pub(super) async fn store_archives(context: &RunContext, workspace: &Workspace)
    -> Result<ArtifactRef, Report<StageError>>;

pub(super) async fn store_issues(context: &RunContext, workspace: &Workspace, issues: &str)
    -> Result<ArtifactRef, Report<StageError>>;
```

Each function has one step: it calls `store_query` with its SQL.

`HASHES_SQL` writes one row per entity ID, sorted by `entity_id`. The `FULL OUTER JOIN` keeps every row of the base.

```sql
SELECT entity_id, kind, target, source_id, content_hash, live
FROM "_diff/result"
ORDER BY entity_id
```

`ARCHIVES_SQL`:

```sql
SELECT entity_id, kind, target, source_id
FROM "_diff/result"
WHERE change = 'archive'
ORDER BY kind, entity_id
```

The SQL of `store_issues`, where `{issues}` is `PreparedRows::issues` as a quoted identifier:

```sql
SELECT kind, target, entity_id, key, issue, property, reason
FROM {issues}
ORDER BY kind, target, key, entity_id, issue, property
```

`archives` and `issues` are stored also when they have no rows. `Workspace::capture` writes the columns of an empty result (`engine/src/workspace/connection/capture.rs:65-67`). The issue ordering in the store query makes the output rows reproducible; downstream stages do not use that order. Equal schemas and ordered rows need not produce equal Parquet bytes (CR-3).

Errors: those of `store_query`.

### `store_targets` (`files.rs`)

```rust
pub(super) async fn store_targets(
    context: &RunContext,
    workspace: &Workspace,
    targets: &[TargetRows],
    totals: BTreeMap<Target, TargetTotals>,
) -> Result<BTreeMap<Target, TargetDiff>, Report<StageError>>
```

Steps:

1. For each `TargetRows`, take the target's totals out of `totals`. A target without a row in `_diff/result` has all counts 0.
2. When `inserted + updated + resent` is above 0, find with `key_column` whether the target's table has `_key`, and store the target's `changes` file with `store_query` and `changes_sql`. Otherwise the target has no file.
3. Add an entry with the file and the counts. `without_id` is `TargetRows::without_id`.
4. For each remaining entry of `totals` with `archived` above 0, add an entry with no file and only `archived` set. These are targets that are in the base or in a failed run and no longer in the definition.

```rust
pub(super) async fn store_targets(context, workspace, targets, mut totals)
    -> Result<BTreeMap<Target, TargetDiff>, Report<StageError>>
{
    let mut output = BTreeMap::new();
    for rows in targets {
        let totals = totals.remove(&rows.target).unwrap_or_default();
        let changes = if totals.inserted + totals.updated + totals.resent > 0 {
            let has_key = key_column(workspace, &rows.table).await?;
            Some(store_query(context, workspace, changes_sql(rows, has_key).into_boxed_str()).await?)
        } else {
            None
        };
        output.insert(rows.target.clone(), TargetDiff {
            changes,
            counts: DiffCounts {
                inserted: totals.inserted,
                updated: totals.updated,
                resent: totals.resent,
                unchanged: totals.unchanged,
                archived: totals.archived,
                without_id: rows.without_id,
            },
        });
    }
    for (target, totals) in totals {
        if totals.archived > 0 {
            output.insert(target, TargetDiff {
                changes: None,
                counts: DiffCounts { archived: totals.archived, ..DiffCounts::default() },
            });
        }
    }
    Ok(output)
}
```

What `DiffOutput::targets` holds is the contract's rule in "Checkpoint 2: `DiffOutput`":

- It holds one entry for every sink and link pipeline of the definition, also when all its counts are 0.
- It holds one entry for every kind and target of the `archives` file that the definition no longer has. A removed or renamed sink appears in no `TargetRows`. Its base rows go through the same join: a row that another target now produces is carried under the new target, and every other live row is archived under the old one, unless the coverage rule keeps it.
- The `archived` counts of all entries add up to the row count of `archives`.
- An entry for a target outside the definition never has a `changes` file. Stage 3 finds a target of the definition for every `changes` file.

Errors: those of `key_column` and `store_query`.

### `key_column` (`files.rs`)

```rust
/// Returns whether `table` has the column `_key`.
async fn key_column(workspace: &Workspace, table: &str) -> Result<bool, Report<StageError>> {
    let rows = select(workspace, format!(
        "SELECT CAST(count(*) AS UBIGINT) AS key_columns FROM information_schema.columns \
         WHERE table_name = {} AND lower(column_name) = '_key'",
        literal(table),
    )).await?;
    let Some([Value::UBigInt(count)]) = rows.iter().next() else { return Err(unexpected_row()) };
    Ok(*count > 0)
}
```

The query reads no row of the table, as `table_columns` of `stage-2-rows.md` does. The table of a sink always has `_key`. The table of a link pipeline has it when its last step selects it (`stage-2-rows.md` section 4.8). `TargetRows` does not say whether the table has `_key`, so step 4 asks the workspace.

Errors: Permanent, `query_invalid`, for a row of another shape. Otherwise those of `select`.

### `changes_sql` (`files.rs`)

```rust
fn changes_sql(rows: &TargetRows, has_key: bool) -> String
```

Steps:

1. Write the select list: `_row`, `_entity_id`, `_change`, `_source_id`, `_key` when `has_key` is true, for a link the two endpoint columns, then each name of `TargetRows::columns` once, in its first position.
2. Join the target's table with `_diff/result` on entity ID and keep the rows labelled `insert`, `update` or `resend`.
3. Order by entity ID.

The kind, the target ID and the labels are written with `literal` of `Kind::as_str`, `Target::id` and `Change::as_str`. Step 3 of `stage-2-rows.md` refuses a column of the target's table with a reserved name (`reserved_column`), so no name of `TargetRows::columns` equals an engine column of the file.

For `entity/sink-airfields` of D0, with the columns `["FIELD_NAME"]`:

```sql
SELECT
    CAST(row_number() OVER (ORDER BY d.entity_id) - 1 AS UBIGINT) AS "_row",
    d.entity_id AS "_entity_id",
    d.change AS "_change",
    d.source_id AS "_source_id",
    CAST(t."_key" AS VARCHAR) AS "_key",
    t."FIELD_NAME" AS "FIELD_NAME"
FROM "_target/entity/sink-airfields" AS t
JOIN "_diff/result" AS d ON d.entity_id = t."_entity_id"
WHERE d.kind = 'entity' AND d.target = 'sink-airfields' AND d.change IN ('insert', 'update', 'resend')
ORDER BY d.entity_id
```

For `link/aircraft-based-at` of D0, which has no property column. Its table is a copy of the definition checkpoint `aviation/aircraft` and has `_key`:

```sql
SELECT
    CAST(row_number() OVER (ORDER BY d.entity_id) - 1 AS UBIGINT) AS "_row",
    d.entity_id AS "_entity_id",
    d.change AS "_change",
    d.source_id AS "_source_id",
    CAST(t."_key" AS VARCHAR) AS "_key",
    t."_left_entity_id" AS "_left_entity_id",
    t."_right_entity_id" AS "_right_entity_id"
FROM "_target/link/aircraft-based-at" AS t
JOIN "_diff/result" AS d ON d.entity_id = t."_entity_id"
WHERE d.kind = 'link' AND d.target = 'aircraft-based-at' AND d.change IN ('insert', 'update', 'resend')
ORDER BY d.entity_id
```

- `_row` is the position of the row among the changed rows of the target in the order of `_entity_id`, starting at 0. An entity ID occurs once per file, so the order is total.
- `_source_id` is not null, because every row of `_diff/result` with a label from the run's rows has one.
- `_key` is cast to `VARCHAR`, as the `key` column of `issues` is (`stage-2-rows.md` section 4.8). Without `has_key` the file has no `_key` column.
- The join on entity ID is exact, because an entity ID has one row in the run. The tests on `d.kind` and `d.target` only reduce the rows of `_diff/result` that the join reads.
- A property column keeps the type it has in the target's table.

Errors: none.

### Cost

N is the number of rows of the run, B the number of rows of the base hash table, R the number of entity IDs in N and B together, and C the number of changed rows.

| Statement | Reads | Join or sort |
| --- | --- | --- |
| `load_table` of the base hash table | One download and one insert of B rows. | None. |
| `union_sql` | Three columns of every target's table, once: N rows. | None. |
| `DUPLICATES_SQL` | `_diff/rows`, once. | One hash aggregate over N rows. |
| `label_sql` | `_diff/rows` and `_diff/base`, once each. | One hash join of N and B rows. One join with `_diff/resend`, which is empty unless a run failed or a write was rejected. |
| `TOTALS_SQL` | `_diff/result`, once. | One hash aggregate into one group per target. |
| `HASHES_SQL` | `_diff/result`, once. | One sort of R rows. |
| `ARCHIVES_SQL` | `_diff/result`, once. | One sort of the archived rows. |
| `key_column`, per target with a changed row | The catalog only. | None. |
| `changes_sql`, per target with a changed row | The target's table and `_diff/result`, once each. | One hash join and one sort of the target's changed rows. |

A run in which nothing changed reads the run's rows twice, the loaded base once, and `_diff/result` three times. It has one join of N and B rows and one sort of R rows, and it runs no `changes_sql`. A run after a failed run adds, per listed run, one download of its `writes` file and its hash table and one pass over each.

DuckDB writes to its temporary directory when a join or a sort needs more memory than `WorkspaceConfig::memory_limit` (`engine/src/workspace/mod.rs:46-48`).

## 5. Existing code

### Monorepo

| Path and line | Item | Change |
| --- | --- | --- |
| `engine/src/workspace/mod.rs:39`, `:222` | `WorkspaceConfig`, `Workspace::open` | Not called. `RunContext::open_workspace` builds the configuration and opens the workspace. |
| `engine/src/workspace/mod.rs:369` | `Workspace::query` | Used as is, through `select`. |
| `engine/src/workspace/mod.rs:404` | `Workspace::create_table` | Used as is, through `create`. |
| `engine/src/workspace/mod.rs:455` | `Workspace::close` | Used as is. Its error is mapped with `error::close`. |
| `engine/src/workspace/mod.rs:156`, `:189` | `Workspace::load_capture`, `Workspace::capture` | Used as is, only through `load_table` and `store_query`. |
| `engine/src/workspace/rows.rs:8`, `:85` | `Rows`, `Rows::iter` | Used as is. |
| `engine/src/workspace/error.rs:175`, `:259` | `StatementError`, `CloseError` | Used as is. `error::statement` and `error::close` map them. |
| `engine/src/sql.rs:9`, `:31` | `Identifier`, `literal` | Used as is. `literal` exists only on the checkout branch. |
| `engine/src/storage/namespace.rs:16` | `ArtifactNamespace` | `shared-run.md` section 4.3 adds the key builders. This spec calls `diff_output`, `plan_output` and `send_output`. |
| `engine/src/storage/artifact/reference.rs:37` | `ArtifactRef` | Used as is. |
| `engine/Cargo.toml:37` | `tempfile` | Used in the tests. |
| `definition/src/definition/mod.rs:92`, `:97` | `Definition::variables`, `Definition::sources` | Used as is. |
| `definition/src/source/mod.rs:85`, `:145` | `Coverage`, `Source::coverage` | Used as is. |
| `engine/src/graph/plan/mod.rs:151` | The duplicate check in `GraphPlan::finish` | Not used. `check_duplicates` replaces it for stage 2. The stage 3 spec decides whether it stays. |
| `engine/src/lib.rs:20-29`, `:31-53` | The module list and the exports | Add `mod stage;` and export `diff`, `DiffOutput`, `TargetDiff` and `DiffCounts`. |

A hash table reader or writer, a diff, a guard and a reader of `current.json` were not found in the monorepo.

### Labs

| Labs code | Logic taken | Logic left |
| --- | --- | --- |
| The entity diff SQL, `src/graph/sink.rs:151` | One `FULL OUTER JOIN` on entity ID with a `CASE` that separates absent on either side, equal hash and other hash. | One state table per sink. The label `delete` becomes `archive`, and `unchanged` becomes a null label. |
| The counts per label, `src/graph/sink.rs:158-176` | One `GROUP BY` over the diff result. | The counts are per target and kind here. |
| The mass-archive guard, `src/graph/sink.rs:177-190` | The limit: more than the larger of 1,000 and half of the prior live rows. An override. | The limit per sink, the float arithmetic, the environment variable `HASH_ALLOW_MASS_ARCHIVE`, and the dropping of tables. |
| The partial carry-forward, `src/graph/sink.rs:127-136` | Nothing. | The `INSERT … NOT IN`. The eighth branch of `label_sql` keeps the rows live inside the join. |
| `assert_unique_entity_ids`, `src/graph/sink.rs:919-953` | `GROUP BY` on the entity ID, `HAVING COUNT(*) > 1`, `LIMIT 5`, and the row count per ID. | The check per sink. The new query adds the total, an order and the targets. |
| `plan_entity_sink`, `src/graph/sink.rs:319-477` | The rows of a sink joined to their labels in entity ID order (`:353-363`) become `changes_sql`. The deleted IDs in order (`:416-422`) become `ARCHIVES_SQL`. | Request building, the quarantine entries, the removal of failed rows from the state (`:438-451`), and the replacement of the state while planning (`:452-459`). |
| `migrate_meta`, `src/graph/sink.rs:553-608`, and `src/graph/state_meta.rs` | Nothing (D1). | All of it. |
| The link diff SQL, `src/graph/link_pipeline.rs:126` | The same join. | The key of source and target ID. A link joins by its entity ID in the same statement as the entities. |
| `assert_unique_pairs`, `src/graph/link_pipeline.rs:372-404` | Covered by `check_duplicates`, because a link's entity ID is derived from the pair. | The separate query. |
| `plan_link_table`, `src/graph/link_pipeline.rs:209-305` | The pairs with their labels in order (`:226-233`) and the deleted pairs (`:257-263`), as for entities. | Request building and the replacement of the state (`:284-291`). |
| The empty-source rule, `src/engine/candidate.rs:76-103` | The row count of the capture decides. | The coverage `Partial` for the whole run (`:103`). The rule is per target here. |
| `finalize_projection_plan`, `src/graph/planner.rs:233-249` | An object of the prior state that the run does not mention is archived when it is live and coverage is complete, and carried otherwise. | The comparison of stored request bytes. |

## 6. Error mapping

`finished`, `finish`, `read`, `RunInput::parse_definition`, `RunContext::open_workspace`, `load_table`, `store_query` and `prepare_rows` return `Report<StageError>`. The stage returns their reports unchanged. `RunInput::parse_definition` fails with `invalid_definition`, and `RunContext::open_workspace` with `workspace_unavailable`.

Step 4 writes no mapping of its own for a shared error type. It calls the mapping functions of `run/error.rs`, which follow `shared-run.md` section 6, and raises the contract codes with `Code::report`. It adds no variant to `Code`.

| Raised by | Error | Code | Kind |
| --- | --- | --- | --- |
| `create`, `select`, through `error::statement` | `StatementError::NotSelect`, `StatementCount`, `TableFunction`, `UnknownParameter`, `UnsupportedType`, `InvalidQuery` | `query_invalid` | Permanent |
| | `StatementError::InvalidData` | `data_invalid` | Permanent |
| | `StatementError::Failed`, `DiskLimit`, `DiskUsage`, `Stopped` | `workspace_unavailable` | Retryable |
| `diff`, through `error::close` | Every `CloseError` | `workspace_unavailable` | Retryable |
| `check_duplicates`, `read_totals`, `key_column`, through `unexpected_row` | A result row of another shape. | `query_invalid` | Permanent |
| `load_base`, `load_sending`, `load_rejected` | A run named by `current.json` lacks a marker. | `marker_missing` | Permanent |
| `check_duplicates` | Two rows of the run have the same entity ID. | `duplicate_entity_id` | Permanent |
| `check_archive_limit` | The archives of one kind exceed the limit. | `archive_limit` | Permanent |

A result row of another shape means that the SQL of step 4 does not select what the code reads. No later attempt changes that, so `unexpected_row` uses `query_invalid`.

## 7. Tests

All tests of this section are in `engine/src/stage/diff/tests.rs`. They open a workspace in a `TempDir`, as `engine/tests/workspace.rs:25-38` does. A test builds a table with `Workspace::create_table` and a `SELECT * FROM (VALUES …) AS t(…)`, and reads a table with `Workspace::query` and an `ORDER BY`.

### Fixture F

Several unit tests use these four tables. The `Protection` has `protected` `{entity/guarded}` and `defined` `{entity/guarded, entity/open, entity/renamed}`. The targets `old`, `old-link` and `lost` are not in the definition.

`_diff/rows`:

| `entity_id` | `kind` | `target` | `source_id` | `content_hash` |
| --- | --- | --- | --- | --- |
| `e01` | `entity` | `open` | `s01` | `h1` |
| `e02` | `entity` | `open` | `s02` | `h1` |
| `e03` | `entity` | `open` | `s03` | `h2` |
| `e04` | `entity` | `open` | `s04` | `h1` |
| `e05` | `entity` | `open` | `s05` | `h1` |
| `e06` | `entity` | `open` | `s06` | `h1` |
| `e07` | `entity` | `renamed` | `s07` | `h1` |

`_diff/base`:

| `entity_id` | `kind` | `target` | `source_id` | `content_hash` | `live` |
| --- | --- | --- | --- | --- | --- |
| `e02` | `entity` | `open` | `s02` | `h1` | false |
| `e03` | `entity` | `open` | `s03` | `h1` | true |
| `e04` | `entity` | `open` | `s04` | `h1` | true |
| `e05` | `entity` | `open` | `s05` | `h1` | true |
| `e07` | `entity` | `old` | `s07` | `h1` | true |
| `e08` | `entity` | `open` | `s08` | `h1` | true |
| `e09` | `entity` | `guarded` | `s09` | `h1` | true |
| `e10` | `entity` | `guarded` | `s10` | `h1` | true |
| `e11` | `entity` | `open` | `s11` | `h1` | false |
| `e12` | `entity` | `open` | `s12` | `h1` | false |
| `e14` | `link` | `old-link` | `s14` | `h1` | true |

`_diff/carried`:

| `entity_id` | `kind` | `target` | `source_id` | `content_hash` |
| --- | --- | --- | --- | --- |
| `e06` | `entity` | `open` | `s06` | `h9` |
| `e13` | `link` | `lost` | `s13` | `h9` |

`_diff/resend` holds `e05`, `e06`, `e10`, `e12` and `e13`.

### `label_rows`

`labels_every_line`: fixture F with `resend_all` false. Expected `_diff/result`, where `source_id` is `s` followed by the number of the entity ID:

| `entity_id` | `kind` | `target` | `content_hash` | `live` | `change` | `present` | `was_live` | `resend` | Line |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `e01` | `entity` | `open` | `h1` | true | `insert` | true | false | false | 1 |
| `e02` | `entity` | `open` | `h1` | true | `update` | true | false | false | 2 |
| `e03` | `entity` | `open` | `h2` | true | `update` | true | true | false | 3 |
| `e04` | `entity` | `open` | `h1` | true | null | true | true | false | 4 |
| `e05` | `entity` | `open` | `h1` | true | `resend` | true | true | true | 4, in the resend set |
| `e06` | `entity` | `open` | `h1` | true | `insert` | true | false | true | 1, only a failed run has it |
| `e07` | `entity` | `renamed` | `h1` | true | null | true | true | false | 4, the target changes |
| `e08` | `entity` | `open` | `h1` | false | `archive` | false | true | false | 5 |
| `e09` | `entity` | `guarded` | `h1` | true | null | false | true | false | 5, coverage rule |
| `e10` | `entity` | `guarded` | `h1` | false | `archive` | false | true | true | 5, coverage rule and resend set |
| `e11` | `entity` | `open` | `h1` | false | null | false | false | false | 6 |
| `e12` | `entity` | `open` | `h1` | false | `archive` | false | false | true | 6, in the resend set |
| `e13` | `link` | `lost` | `h9` | false | `archive` | false | false | true | 7 |
| `e14` | `link` | `old-link` | `h1` | true | null | false | true | false | 5, the target left the definition and the coverage rule applies to `entity/guarded` |

`labels_when_resending_everything`: fixture F with `resend_all` true. `e04` and `e07` have `resend`, `e11` has `archive`, and `e09` and `e14` still have a null label and `live` true. Every other row is as above.

`labels_without_protection`: fixture F with an empty `Protection` and `resend_all` false. `e09` and `e14` have `archive` and `live` false. Every other row is as in `labels_every_line`.

`labels_without_base`: `_diff/rows` of fixture F, and empty `_diff/base`, `_diff/carried` and `_diff/resend`. All seven rows have `insert` and `live` true.

`labels_without_rows`: empty `_diff/rows`, the other three tables of fixture F, and an empty `Protection`. This is a restore to empty. `e03`, `e04`, `e05`, `e07`, `e08`, `e09`, `e10` and `e14` have `archive` because they were live. `e12`, `e06` and `e13` have `archive` because of the resend set. `e02` and `e11` have a null label. Every row has `live` false.

`protected_sql_texts`: an empty `protected` gives `FALSE`, also when `defined` is not empty. `protected` `{entity/a}` with `defined` `{entity/a, link/b}` gives `coalesce((p.kind || '/' || p.target) IN ('entity/a') OR (p.kind || '/' || p.target) NOT IN ('entity/a', 'link/b'), FALSE)`.

### `read_totals` and `check_archive_limit`

`totals_of_fixture`: after `labels_every_line`, `read_totals` returns:

| Target | `inserted` | `updated` | `resent` | `unchanged` | `archived` | `limited` | `was_live` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `entity/guarded` | 0 | 0 | 0 | 0 | 1 | 0 | 2 |
| `entity/open` | 2 | 2 | 1 | 1 | 2 | 1 | 4 |
| `entity/renamed` | 0 | 0 | 0 | 1 | 0 | 0 | 1 |
| `link/lost` | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| `link/old-link` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

`archive_limit_cases`: `check_archive_limit` on totals built in Rust, with one target per kind.

| Entity `limited` | Entity `was_live` | Link `limited` | Link `was_live` | Expected |
| --- | --- | --- | --- | --- |
| 0 | 0 | 0 | 0 | `Ok` |
| 1,000 | 1,000 | 0 | 0 | `Ok`. 1,000 is not above 1,000. |
| 1,001 | 2,002 | 0 | 0 | `Ok`. 1,001 is not above half of 2,002. |
| 1,001 | 2,001 | 0 | 0 | `archive_limit` with kind `entity`, archives 1,001, live 2,001. |
| 1,001 | 1,001 | 0 | 0 | `archive_limit` with kind `entity`. |
| 0 | 10 | 1,500 | 2,000 | `archive_limit` with kind `link`, archives 1,500, live 2,000. |
| 0 with `archived` 5,000 | 100 | 0 | 0 | `Ok`. Archives of rows that were not live do not count. |

### `union_rows` and `check_duplicates`

`union_of_two_targets`: table `ta` with `_entity_id`, `_source_id`, `_content_hash`, `NAME` and one row `('e1', 's1', 'h1', 'n')`. Table `tb` with `_entity_id`, `_source_id`, `_content_hash`, `_left_entity_id`, `_right_entity_id` and one row `('e2', 's2', 'h2', 'e1', 'e1')`. Targets `entity/a` on `ta` and `link/b` on `tb`. Expected `_diff/rows`: `('e1', 'entity', 'a', 's1', 'h1')` and `('e2', 'link', 'b', 's2', 'h2')`.

`union_of_no_target`: no target. `_diff/rows` has the five columns and no row.

`duplicates_across_targets`: `_diff/rows` with `e1` under `entity/a` and under `entity/b`, `e2` three times under `entity/a`, and `e3` once. Expected: Permanent, `duplicate_entity_id`, `count` 2, examples `(e1, 2, entity/a, entity/b)` and `(e2, 3, entity/a, entity/a)`.

`duplicates_are_capped_at_five`: `d1` to `d7`, each twice. Expected: `count` 7 and the five examples `d1` to `d5`.

`no_duplicates`: `e1`, `e2`, `e3` once each. Expected: `Ok`.

### `protected_targets`

`coverage_cases`: a definition with four SQL sources: `some` with `coverage: partial`, `none` and `full` with no `coverage` key, and `gone` with `coverage: complete-or-empty`. `CaptureOutput::sources` has the row counts `some` 5, `none` 0, `full` 3, `gone` 0.

| Target | `TargetRows::sources` | Protected |
| --- | --- | --- |
| `entity/a` | `some` | Yes. The source is partial. |
| `entity/b` | `none` | Yes. The source is complete and has no rows. |
| `entity/c` | `full` | No. |
| `entity/d` | `gone` | No. An empty `complete-or-empty` source archives. |
| `link/e` | `full`, `none` | Yes. One of its sources has no rows. |
| `link/f` | none | No. |

`Protection::defined` holds all six targets.

`coverage_none_applies`: the same definition with the row counts `some` 5, `none` 1, `full` 3, `gone` 0, and `some` with no `coverage` key. `protected` is empty and `defined` holds all six targets.

`coverage_without_capture_entry`: a source in `TargetRows::sources` with coverage `complete` and no entry in `CaptureOutput::sources` does not protect. The same source with `partial` protects.

### `prior.rs`

These tests use a `RunContext` over `ArtifactStorage::local` in a `TempDir`. A helper writes a marker with `finish` and a file with `RowFile::store`.

| Test | Storage | Expected |
| --- | --- | --- |
| `base_absent` | Nothing. `load_base` with `None`. | `_diff/base` has the six columns and no row. |
| `base_loaded` | Run B has `diff/_done.json` with a hash table of two rows. | `_diff/base` holds the two rows. |
| `base_marker_missing` | Run B has no `diff/_done.json`. | Permanent, `marker_missing`, `MarkerMissing { run: B, marker: "diff" }`. |
| `resend_empty` | `Current` with nothing committed and nothing listed. | `_diff/resend` and `_diff/carried` have no row. |
| `resend_from_rejected` | B is committed. Its `send/_done.json` names a `rejected` file with `e1` and `e2`. | `_diff/resend` holds `e1` and `e2`. `_diff/carried` has no row. |
| `resend_without_rejected` | B is committed. Its `SendOutput::rejected` is absent. | Both tables have no row. No table `_diff/rejected` is read. |
| `send_marker_missing` | B is committed and has no `send/_done.json`. | Permanent, `marker_missing`, marker `send`. |
| `resend_from_failed_run` | B is committed with a hash table that holds `e1`. X is listed. Its `writes` file holds `e1` and `e9`. Its hash table holds `e1`, `e9` as `(entity, t, s9, h9, true)` and `e5`. | `_diff/resend` holds `e1` and `e9`. `_diff/carried` holds `(e9, entity, t, s9, h9)`. `e5` is in neither table. |
| `resend_takes_the_last_listed_run` | X and Y are listed in that order. Both `writes` files hold `e9`. X's hash table has `e9` under target `tx`, Y's under `ty`. Nothing is committed. | `_diff/carried` holds one row for `e9` with target `ty`. |
| `plan_marker_missing` | X is listed and has no `plan/_done.json`. | Permanent, `marker_missing`, marker `plan`. |
| `resend_sql_texts` | None. | `resend_sql(0, false)` equals `empty_sql(&[("entity_id", "VARCHAR")])`. `resend_sql(2, true)` and `carried_sql(2)` equal the texts in section 4. `carried_sql(0)` equals `empty_sql(ROW_COLUMNS)`. |

### `files.rs`

`changes_sql_texts`: `TargetRows` for `entity/sink-airfields` with table `_target/entity/sink-airfields` and columns `["FIELD_NAME"]`, and for `link/aircraft-based-at` with table `_target/link/aircraft-based-at` and no columns, each with `has_key` true, give the two texts in section 4. The same `TargetRows` with `has_key` false give the texts without the line of `_key`. Columns `["A", "A"]` write `t."A" AS "A"` once.

`key_column_cases`: a table with the columns `_key` and `A` gives true, a table with `_KEY` gives true, and a table with only `A` gives false.

`files_of_fixture`: fixture F after `label_rows`, with a table `_target/entity/open` that has `_key`, `_entity_id`, `_source_id`, `_content_hash` and `NAME`, the rows `e01` to `e06`, `_key` equal to `k01` to `k06`, and `NAME` equal to `n01` to `n06`. `TargetRows` are `entity/open` on `_target/entity/open` with columns `["NAME"]` and `without_id` 3, `entity/renamed` and `entity/guarded` on tables with the same columns, where the table of `entity/renamed` holds `e07` and the table of `entity/guarded` is empty. An issues table has no row.

- `hashes` has 14 rows, `e01` to `e14` in that order, with the first six columns of the table in `labels_every_line`.
- `archives` has the rows `(e08, entity, open, s08)`, `(e10, entity, guarded, s10)`, `(e12, entity, open, s12)`, `(e13, link, lost, s13)` in that order.
- `issues` has the seven columns and no row.
- The `changes` file of `entity/open` has the columns `_row`, `_entity_id`, `_change`, `_source_id`, `_key`, `NAME` and the rows `(0, e01, insert, s01, k01, n01)`, `(1, e02, update, s02, k02, n02)`, `(2, e03, update, s03, k03, n03)`, `(3, e05, resend, s05, k05, n05)`, `(4, e06, insert, s06, k06, n06)`.
- `DiffOutput::targets` has four entries. `entity/open` has a file and the counts inserted 2, updated 2, resent 1, unchanged 1, archived 2, without_id 3. `entity/renamed` has no file and unchanged 1. `entity/guarded` has no file and archived 1. `link/lost` has no file and archived 1. `link/old-link` has no entry, because the coverage rule keeps its row.

`files_without_protection`: the same after `labels_without_protection`. `archives` also has `(e09, entity, guarded, s09)` after `e08` and `(e14, link, old-link, s14)` last. `entity/guarded` has archived 2, and `link/old-link` has an entry with no file and archived 1.

### Stage-level cases

These tests call `diff`. A helper `capture_output` builds the `CaptureOutput` of a definition: it stores the rows of each source's SQL with `store_query` and counts them. `captured_at` follows "What a test compares" in `03-scenarios.md`: `2026-11-06T12:00:00Z` for run 1 and one hour later for each later run. A restore or a reconcile has the `captured_at` of the run whose captures it adopts. A helper `settle` writes what stages 3 and 4 leave for a run: for a committed run `send/_done.json`, with a `rejected` file when IDs are given, and a `current.json` that commits the run; for a run that failed while sending `plan/_done.json` with a `writes` file of the given entity IDs, and a `current.json` that lists the run. Stage 2 reads only `entity_id` of a `writes` or `rejected` file. In a scenario, the `SendOutput::counts` that `settle` writes are those of the section "Expected `SendOutput`" of `03-scenarios.md`.

The first seven rows are the cases that `03-scenarios.md` lists for stage 2 in "Cases tested per stage".

| Case | Setup | Expected |
| --- | --- | --- |
| Two sinks of the same entity type produce the same ID | One source with the row `('A', 'x')` and two sinks `one` and `two` with the same entity type and ID column. | Permanent, `duplicate_entity_id`, `count` 1, one example with `first_target` `entity/one` and `last_target` `entity/two`. No `diff/_done.json`. |
| A row whose ID column is null or blank | One sink whose ID column is not the primary key. Two rows, with the IDs `'A'` and `NULL`. | `hashes` and `changes` have one row, for `A`. The target's `without_id` is 1 and `inserted` is 1. `issues` has one row with `missing_id`. `stage-2-rows.md` owns the issue's content. |
| A link row whose `from` or `to` column is null | D0 with `HOME_BASE` of `N100` set to `NULL`. | `issues` has one row with `missing_endpoint`. `link/aircraft-based-at` has `inserted` 1 and `without_id` 1. |
| Archives above the archive limit | Run 1 applies a source `SELECT 'id-' \|\| range AS id, 'n' AS name FROM range(2000)` and is settled as committed. Run 2 applies the same with `range(899)`. | Run 2 fails with Permanent, `archive_limit`, kind `entity`, archives 1,101, live 2,000. With `allow_mass_archive` true it returns `archived` 1,101 and `unchanged` 899. With `range(1000)` in run 2 it returns `archived` 1,000 without the flag. |
| A source with `coverage: partial` | S3 runs 1 and 2 with `coverage: partial` on the `aircraft` source. | Run 2 archives nothing. `hashes` equals run 1's. `entity/sink-aircraft` has `unchanged` 1 and `archived` 0. |
| An ID column of type `DECIMAL`, `DOUBLE` or `TIMESTAMP` | `stage-2-rows.md` owns this case. | The `_entity_id` of the `changes` file equals the planner's ID. |
| A link with a measure property whose unit changes | `stage-2-rows.md` owns this case. The test has two runs through `diff`. | The link has `update` in run 2. |
| The stage runs twice with the same input | S1 run 1, then `diff` again with the same input. | The second call returns an output equal to the first. The storage directory holds the same objects before and after the second call. |
| The marker exists and the input has changed | S1 run 1, then `diff` with the same run ID and another definition. | The call returns run 1's stored output. |
| A failure closes the workspace | The duplicate case above. | After the error, `Workspace::open` on the DuckDB file that `RunContext::open_workspace` created in `RunContext::scratch` succeeds, so the failed attempt holds no lock on it. |
| A definition that does not parse | `RunInput::definition` is `"connector: ["`. | Permanent, `invalid_definition`. |
| A restore to empty after a failed first run | Run 1 applies D0 and is settled as failed while sending with its six entity IDs. Run 2 is a restore to empty. Nothing is committed. | `base` absent, `resent` [1]. `archives` has the six IDs. `hashes` has six rows copied from run 1's hash table with `live` false. `targets` has the three targets of D0 with `archived` 2 each (P12). |
| The coverage rule does not stop the resend set | Run 1 applies D0 and commits. Run 2 applies D0 with a `G-ABCD` row and fails while sending. Run 3 applies D0 with an `aircraft` source that returns no rows. | `AC-GABCD` and `L-GABCD-ESSB` are in `archives`. The four aircraft and link rows of run 1 stay `live` true and have no label. |
| An apply with `resend_all` | Run 1 applies D0 and commits. Run 2 applies D0 with `resend_all` true. | Every target has `resent` 2. `hashes` equals run 1's. |
| A removed sink | Run 1 applies D0 and commits. Run 2 applies D0 without the step `sink-airfields`. | `archives` has `AF-ESSB` and `AF-ESSA` with target `sink-airfields`. `targets` has `entity/sink-airfields` with no file and `archived` 2, next to the two targets of the definition. |
| A sink renamed in the run in which its source is empty | Run 1 applies D0 and commits. Run 2 applies D0 with the step `sink-aircraft` renamed to `sink-planes` and an `aircraft` source that returns no rows. | The protected targets are `entity/sink-planes` and `link/aircraft-based-at`. `archives` is empty. `hashes` equals H1: `AC-SEXXX` and `AC-N100` keep the target `sink-aircraft` and `live` true. `targets` has `entity/sink-airfields` with `unchanged` 2, and `entity/sink-planes` and `link/aircraft-based-at` with all counts 0. No target has a file, and `targets` has no `entity/sink-aircraft`. |

### Scenarios

Every scenario of `03-scenarios.md` runs through `diff`, run by run. Between two runs the test calls `settle` with the outcome the scenario states. The fixture of a run is therefore the storage after the previous run: `current.json`, the `diff/_done.json` and files of the base run and of each listed run, the `send/_done.json` of the base run, and the `plan/_done.json` of each listed run.

Names used below:

- `T-AF` is `entity/sink-airfields`, `T-AC` is `entity/sink-aircraft`, `T-L` is `link/aircraft-based-at`.
- The entity names are those of the scenarios' section "Entities". An entity ID is `00000000-0000-4000-8000-000000000001~{uuid}`.
- `AC1` is `https://example.com/@demo/types/entity-type/aircraft/v/1`, and `AF1` is the same with `airfield/v/1`.
- A count that is not named is 0. `without_id` is 0 and `issues` is empty in every run.
- A hash is compared with the hash of the same entity in another run. The hash of a link of D0 is `md5('')`, which is `d41d8cd98f00b204e9800998ecf8427e`, because the link has no property.

**H1** is the hash table of S1 run 1. Its rows, in file order, all with `live` true:

| Entity | `kind` | `target` | `source_id` |
| --- | --- | --- | --- |
| `AC-SEXXX` | `entity` | `sink-aircraft` | `SE-XXX` |
| `L-N100-ESSA` | `link` | `aircraft-based-at` | `{AC1}::N100::{AF1}::ESSA` |
| `AF-ESSB` | `entity` | `sink-airfields` | `ESSB` |
| `AF-ESSA` | `entity` | `sink-airfields` | `ESSA` |
| `L-SEXXX-ESSA` | `link` | `aircraft-based-at` | `{AC1}::SE-XXX::{AF1}::ESSA` |
| `AC-N100` | `entity` | `sink-aircraft` | `N100` |

**C1** is the set of `changes` files of S1 run 1:

Every file has the columns `_row`, `_entity_id`, `_change`, `_source_id` and `_key` first. The tables of D0 all have `_key`.

| Target | Columns after `_key` | Rows as `_row`, entity, `_change`, `_source_id`, `_key`, values |
| --- | --- | --- |
| `T-AF` | `FIELD_NAME` | `0, AF-ESSB, insert, ESSB, {"ICAO":"ESSB"}, Bromma` and `1, AF-ESSA, insert, ESSA, {"ICAO":"ESSA"}, Arlanda`. |
| `T-AC` | `EMPTY_MASS`, `MASS_UNIT`, `FIRST_FLIGHT`, `MODEL`, in the order of `TargetRows::columns` | `0, AC-SEXXX, insert, SE-XXX, {"TAIL":"SE-XXX"}, 8030, KG, 1946-04-02, DC-3` and `1, AC-N100, insert, N100, {"TAIL":"N100"}, 69000, LB, 1957-07-15, L-1049`. |
| `T-L` | `_left_entity_id`, `_right_entity_id` | `0, L-N100-ESSA, insert, {AC1}::N100::{AF1}::ESSA, {"TAIL":"N100"}, AC-N100, AF-ESSA` and `1, L-SEXXX-ESSA, insert, {AC1}::SE-XXX::{AF1}::ESSA, {"TAIL":"SE-XXX"}, AC-SEXXX, AF-ESSA`. |

Run 1 of every scenario applies D0 with nothing stored. Its expected output is: `base` absent, `resent` empty, `hashes` H1, `changes` C1, `archives` empty, and `inserted` 2 for each of the three targets. In S6 and S7 the rows that follow state how run 1 is settled.

#### S1: first run

| Run | Starts from | Expected |
| --- | --- | --- |
| 2 | Run 1 is committed with no `rejected` file. | `base` 1, `resent` empty. Each target has `unchanged` 2 and no file. `hashes` equals H1 row for row. `archives` is empty. |

#### S2: a changed row

| Run | Starts from | Expected |
| --- | --- | --- |
| 2 | Run 1 is committed. | `base` 1. `T-AC` has `updated` 1, `unchanged` 1 and a file with the row `0, AC-N100, update` and `MODEL` `L-1049G`. `T-AF` and `T-L` have `unchanged` 2 and no file. `hashes` is H1 with another hash for `AC-N100`. `archives` is empty. |
| 3 | Run 2 is committed. | `base` 2. `T-AC` has `updated` 1, `unchanged` 1 and a file with the row `0, AC-SEXXX, update` and `EMPTY_MASS` equal to the empty text. `hashes` is run 2's with another hash for `AC-SEXXX`. |

#### S3: a deleted row

| Run | Starts from | Expected |
| --- | --- | --- |
| 2 | Run 1 is committed. | `base` 1. `T-AF` has `unchanged` 2. `T-AC` and `T-L` have `unchanged` 1 and `archived` 1. No target has a file. `archives` has `(AC-N100, entity, sink-aircraft, N100)`, then `(L-N100-ESSA, link, aircraft-based-at, {AC1}::N100::{AF1}::ESSA)`. `hashes` is H1 with `live` false for these two rows and the hashes of run 1. |
| 3 | Run 2 is committed. | `base` 2. `T-AC` has `updated` 1, `unchanged` 1 and the row `0, AC-N100, update`. `T-L` has `updated` 1, `unchanged` 1 and the row `0, L-N100-ESSA, update`. `T-AF` has `unchanged` 2. `hashes` equals H1. `archives` is empty. |
| 4 | Run 3 is committed. `CaptureOutput` has `aircraft` with `rows` 0. | `base` 3. `Protection::protected` is `{T-AC, T-L}`. `T-AF` has `unchanged` 2. `T-AC` and `T-L` have all counts 0. No file. `archives` is empty. `hashes` equals H1. |
| 5 | Run 4 is committed. The `aircraft` source has `coverage: complete-or-empty` and `rows` 0. | `base` 4. `Protection::protected` is empty. `T-AC` and `T-L` have `archived` 2. `archives` has `AC-SEXXX`, `AC-N100`, `L-N100-ESSA`, `L-SEXXX-ESSA` in that order. `hashes` is H1 with `live` false for these four rows. |

#### S4: a renamed sink

| Run | Starts from | Expected |
| --- | --- | --- |
| 2 | Run 1 is committed. | `base` 1. `targets` has `T-AF`, `entity/sink-planes` and `T-L`, each with `unchanged` 2 and no file, and no `T-AC`. `archives` is empty. `hashes` is H1 with `target` `sink-planes` for `AC-SEXXX` and `AC-N100` and the hashes of run 1. |
| 3 | Run 2 is committed. | `base` 2. `entity/sink-planes` has `updated` 2 and a file with the rows `0, AC-SEXXX, update` and `1, AC-N100, update`. The file has no `MODEL` column. `hashes` is run 2's with other hashes for the two aircraft. |

#### S5: a type version bump

| Run | Starts from | Expected |
| --- | --- | --- |
| 2 | Run 1 is committed. | `base` 1. `T-AF` has `unchanged` 2. `T-AC` has `inserted` 2, `archived` 2 and a file with `0, AC2-SEXXX, insert` and `1, AC2-N100, insert`. `T-L` has `inserted` 2, `archived` 2 and a file with `0, L2-SEXXX-ESSA, insert` and `1, L2-N100-ESSA, insert`. `archives` has `AC-SEXXX`, `AC-N100`, `L-N100-ESSA`, `L-SEXXX-ESSA` in that order. `hashes` has ten rows in this order: `AC2-SEXXX`, `AC-SEXXX`, `L-N100-ESSA`, `AF-ESSB`, `AF-ESSA`, `L2-SEXXX-ESSA`, `L-SEXXX-ESSA`, `AC2-N100`, `AC-N100`, `L2-N100-ESSA`. The four archived rows have `live` false, and the other six have `live` true. |

#### S6: a rejected write

| Run | Starts from | Expected |
| --- | --- | --- |
| 2 | Run 1 is committed. Its `send/_done.json` names a `rejected` file with `AC-N100` and `L-N100-ESSA`. | `base` 1, `resent` empty. `T-AC` has `resent` 1, `unchanged` 1 and the row `0, AC-N100, resend`. `T-L` has `resent` 1, `unchanged` 1 and the row `0, L-N100-ESSA, resend`. `T-AF` has `unchanged` 2. `hashes` equals H1. `archives` is empty. |

#### S7: a failed send, then roll forward

| Run | Starts from | Expected |
| --- | --- | --- |
| 2 | Run 1 is committed. | `base` 1, `resent` empty. `T-AF` has `unchanged` 2. `T-AC` has `inserted` 1, `updated` 1, `archived` 1 and a file with `0, AC-GABCD, insert` and `1, AC-N100, update`. `T-L` has `inserted` 1, `unchanged` 1, `archived` 1 and a file with `0, L-GABCD-ESSB, insert`, left `AC-GABCD`, right `AF-ESSB`. `archives` has `AC-SEXXX`, then `L-SEXXX-ESSA`. `hashes` has eight rows: H1 with `live` false for `AC-SEXXX` and `L-SEXXX-ESSA` and another hash for `AC-N100`, plus `L-GABCD-ESSB` before `L-N100-ESSA` and `AC-GABCD` after `AF-ESSA`, both `live` true. |
| 3 | Run 1 is committed. Run 2 is listed in `sending`. Its `plan/_done.json` names a `writes` file with `AC-GABCD`, `AC-N100`, `L-GABCD-ESSB`, `L-SEXXX-ESSA` and `AC-SEXXX`. | `base` 1, `resent` [2]. `T-AF` has `unchanged` 2. `T-AC` has `resent` 2, `archived` 1 and a file with `0, AC-SEXXX, resend` and `1, AC-N100, resend`. `T-L` has `resent` 1, `unchanged` 1, `archived` 1 and a file with `0, L-SEXXX-ESSA, resend`. `archives` has `(AC-GABCD, entity, sink-aircraft, G-ABCD)`, then `(L-GABCD-ESSB, link, aircraft-based-at, {AC1}::G-ABCD::{AF1}::ESSB)`. `hashes` has eight rows. The six of H1 are `live` true with run 1's hashes. `AC-GABCD` and `L-GABCD-ESSB` have the `kind`, `target`, `source_id` and `content_hash` of run 2's hash table and `live` false. |

#### S8: a restore

| Run | Starts from | Expected |
| --- | --- | --- |
| 2 | Run 1 is committed. | `base` 1. `T-AF` has `inserted` 1, `unchanged` 1, `archived` 1 and a file with `0, AF-ESGG, insert, Landvetter`. `T-AC` has `updated` 1, `unchanged` 1 and a file with `0, AC-N100, update`. `T-L` has `unchanged` 2. `archives` has `AF-ESSB`. `hashes` has seven rows: H1 with `AF-ESGG` after `AC-SEXXX`, `live` false for `AF-ESSB`, and another hash for `AC-N100`. |
| 3 | Run 2 is committed. `RunInput` has run 1's definition and `Restore { target: 1 }`. `CaptureOutput` has run 1's files and `adopted_from` 1. | `base` 2. `T-AF` has `updated` 1, `unchanged` 1, `archived` 1 and a file with `0, AF-ESSB, update`. `T-AC` has `updated` 1, `unchanged` 1 and a file with `0, AC-N100, update`. `T-L` has `unchanged` 2. `archives` has `AF-ESGG`. `hashes` has seven rows: the six of H1 with run 1's hashes and `live` true, and `AF-ESGG` with `live` false. |
| 4 | Run 3 is committed. `RunInput` has no definition and `Restore { target: None }`. `CaptureOutput` has no sources. | `base` 3. `prepare_rows` returns no targets. `targets` has `T-AF`, `T-AC` and `T-L`, each with no file and `archived` 2. `archives` has `AC-SEXXX`, `AF-ESSB`, `AF-ESSA`, `AC-N100`, `L-N100-ESSA`, `L-SEXXX-ESSA` in that order. `hashes` has run 3's seven rows, all with `live` false. `AF-ESGG` has no label. |

#### S9: a reconcile

| Run | Starts from | Expected |
| --- | --- | --- |
| 2 | Run 1 is committed. `RunInput` has run 1's definition and `Reconcile { target: 1 }`. `CaptureOutput` has run 1's files and `adopted_from` 1. | `base` 1. Each target has `resent` 2. The files are C1 with `resend` in place of `insert`. `hashes` equals H1. `archives` is empty. |
| 3 | Run 2 is committed. | `base` 2. `T-AF` has `unchanged` 2. `T-AC` and `T-L` have `unchanged` 1 and `archived` 1. `archives` has `AC-N100`, then `L-N100-ESSA`. `hashes` is H1 with `live` false for these two rows. |
| 4 | Run 3 is committed. `RunInput` has run 3's definition and `Reconcile { target: 3 }`. `CaptureOutput` has run 3's files. | `base` 3. `T-AF` has `resent` 2 and a file with `0, AF-ESSB, resend` and `1, AF-ESSA, resend`. `T-AC` has `resent` 1, `archived` 1 and a file with `0, AC-SEXXX, resend`. `T-L` has `resent` 1, `archived` 1 and a file with `0, L-SEXXX-ESSA, resend`. `archives` has `AC-N100`, then `L-N100-ESSA`. `hashes` equals run 3's. The two archives do not count toward the archive limit, because the rows were not live. |

### Labs tests to port

| Labs test | Ported as | Expected here |
| --- | --- | --- |
| `src/graph/sink.rs:1221` `extracted_plan_matches_reference_effects_and_resulting_state_bytes` | A stage-level test with the labs fixture (`src/graph/sink.rs:1049-1080`): committed rows `('A','old')`, `('B','same')`, `('C','removed')`, new rows `('A','changed')`, `('B','same')`, `('D','new')`, namespace `connector`, type `https://example.com/types/entity-type/item/v/1`. | `A` has `update`, `B` has no label, `C` is archived, `D` has `insert`. The counts are 1 each. With `resend_all`, `B` has `resend`; labs sends three upserts in that case. The entity UUIDs are those in `reference/labs.md`, "Inline tests, stage 2". |
| `src/graph/link_pipeline.rs:1147` `extracted_link_plan_matches_reference_effects_and_state_bytes` | The same test for a link pipeline with the labs pairs. | `A→B` has `update`, `B→C` has no label, `C→D` is archived, `D→E` has `insert`. |
| `src/graph/sink.rs:1387` `sibling_engine_golden_state_is_adopted_without_reupserts_or_byte_drift` | A stage-level test with five rows whose hashes equal the base. | `unchanged` 5, no file, and a hash table equal to the base's. |
| `src/engine/candidate.rs:609` `exact_capture_plans_without_graph_and_reuses_candidate_state` | S1. | One insert in the first run and no write in the second. |
| `src/engine/candidate.rs:683` `empty_source_still_materializes_its_checkpoint` | S3 run 4. | The link pipeline's table is empty, and the coverage rule keeps its rows. Labs archives them. |
| `src/graph/restore.rs:861` `restore_to_initial_empty_archives_g_and_clears_maintenance` | The stage-level case "A restore to empty after a failed first run". | The entities of the failed run are archived. |
| `src/graph/reconcile.rs:931` `force_cycle_completes_and_the_next_cycle_has_a_new_work_identity` | S9 run 2. | Every live entity has `resend`. |
| `src/graph/reconcile.rs:1102` `restore_to_the_same_target_resumes_the_existing_cycle_and_cursor` | A stage-level test: `a` and `b` are committed, a failed run wrote `g`, and the run restores to the committed run. | `g` is archived. `a` and `b` have no label, because the failed run did not write them. Labs sends all three. |

`src/graph/sink.rs:1129` `stale_sink_config_invalidates_previous_row_hashes` is not ported, because the first version has no config hash (D1). Labs has no test for the guards.

## 8. Open questions and contract problems

### Open questions

1. **Rows kept by the coverage rule are in no count.** `DiffOutput` of S3 run 4 does not differ from a run with nothing to archive. A count `kept` in `DiffCounts`, or a log line, would show it.
2. **The archive limit for a restore to empty and a type version bump.** Both archive every live row of a kind. With more than 1,000 live rows they need `allow_mass_archive`.
3. **The hash table of a listed run.** It is downloaded in full to copy the rows of entity IDs that are not in the base. The `writes` file holds `target` and `source_id` already, and the hash of a row with `live = false` is never compared. Reading only `writes` would save the download.

### Contract problems

1. **`TargetRows` does not say whether the target's table has `_key`.** The `changes` file has `_key` only when the target's table has one, and the table of a link pipeline with steps may lack it. Step 4 therefore runs `key_column` once per `changes` file. Change needed in "Inside stage 2": a field `has_key: bool` in `TargetRows`, which `stage-2-rows.md` already computes with its `has_key`, and `_key` in the table of the columns each target's table has.
