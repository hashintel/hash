//! Prepare for incremental updates: the capture tables hold, for each run, only the rows that
//! changed, each marked in its column `_change` as an `insert`, an `update` or a `delete`.

mod staging;
#[cfg(test)]
mod tests;

use alloc::collections::BTreeMap;
use std::path::Path;

use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::{Definition, LinkInput, PrimaryKey, SourceName};

use super::{
    changes::{Changes, Context},
    collect_changes, issues, run_pipelines,
    workspace::{OpenError, Workspace, WorkspaceConfig},
};
use crate::{
    lake::{Lake, LakeError, LakeSettings},
    run::{CapturePart, Input, PreparePart, RunId, RunRecord, Stage},
    stage::{
        StageError, begin,
        capture::SEQUENCE,
        end,
        failure::{STORAGE_UNCONFIGURED, from_lake, permanent, retryable},
    },
    storage::Storage,
    sync_table::{SyncTable, SyncTableError},
};

/// The definition does not parse, or a pipeline reads a second table.
const DEFINITION_INVALID: &str = "prepare_definition_invalid";
/// A table has no capture table, a capture table is of no table of the definition or does not
/// exist, or it cannot be staged: it lacks `_change` or a column of the primary key, has a column
/// `_op`, `_key`, `_seq` or `rowid`, or a row's `_change` is not `insert`, `update` or `delete`.
const CAPTURE_INVALID: &str = "prepare_capture_invalid";
/// An SQL step fails or leaves a staging column unusable, a checkpoint a pipeline reads was not
/// written, a sink or a link reads a column its table lacks, or a link pipeline with several inputs
/// has no SQL step.
const STEP_FAILED: &str = "prepare_step_failed";
/// The rows of a sink or a link cannot be turned into changes, as a step changed an `_op` to
/// something other than `insert`, `update` or `delete`, or the changes cannot be written to the
/// sync table.
const ROWS_INVALID: &str = "prepare_rows_invalid";

/// Reports why Prepare refuses the definition or the capture tables of a run.
#[derive(Debug, derive_more::Display, derive_more::Error)]
enum InputError {
    /// A join of two tables would see only the changed rows of each.
    #[display("the pipeline `{pipeline}` reads a second table")]
    SecondTable { pipeline: Box<str> },
    #[display("the table `{table}` has no capture table")]
    MissingTable { table: SourceName },
    #[display("the capture table `{table}` is of no table of the definition")]
    UnknownTable { table: Box<str> },
    #[display("the capture table of `{table}` cannot be staged")]
    Staging { table: SourceName },
}

/// A table of the definition and its capture table in the bucket.
#[derive(Debug)]
struct CapturedTable {
    name: SourceName,
    primary_key: PrimaryKey,
    /// The key of the table's capture table in the bucket.
    key: Box<str>,
    /// The table in the workspace that the run's rows are copied to.
    copy: Box<str>,
    /// The table in the workspace that the copy is staged to.
    staged: Box<str>,
}

/// The changes of a run, and the number of rows of the run in the sync table.
struct Prepared {
    changes: Changes,
    rows: u64,
}

/// Prepares `run`: turns the run's rows in the capture tables into the run's entity changes.
///
/// The changes are written to the sync table, and the `prepare` part to `run.json`. Each row, or
/// part of one, that cannot be written as captured is listed in the issues file.
///
/// A run that was prepared before is left as it is. Preparing a run again after a retryable error
/// leaves the rows an earlier attempt wrote to the sync table, and records their number.
///
/// # Errors
///
/// - [`StageError::Permanent`] if the definition or the capture tables are refused, an SQL step
///   fails, a row cannot be turned into a change, or the sync table cannot hold the rows. The code
///   in the `failure` part of `run.json` names the step. It is returned without writing if the run
///   cannot be prepared: it is not the run `current.json` names, it failed before, or its
///   `run.json` is missing or unreadable.
/// - [`StageError::NotReady`] if the run has not been captured
/// - [`StageError::Retryable`] if the bucket or the workspace cannot be used. Nothing is recorded,
///   and preparing the run again can succeed.
pub async fn prepare_incremental(storage: &Storage, run: RunId) -> Result<(), Report<StageError>> {
    let mut open = begin(storage, run, Stage::Prepare).await?;
    if open.record.prepare.is_some() {
        return Ok(());
    }
    let result = prepare(storage, &open.record)
        .await
        .map(|part| open.record.prepare = Some(part));
    end(storage, open, result).await
}

/// What an error of the lake means for Prepare: a capture table that does not exist is refused.
fn lake_failed(report: Report<LakeError>) -> Report<StageError> {
    from_lake(Stage::Prepare, CAPTURE_INVALID, report)
}

/// What an error of the sync table means for Prepare.
fn sync_failed(report: Report<SyncTableError>) -> Report<StageError> {
    let context = match report.current_context() {
        SyncTableError::Storage => retryable(Stage::Prepare),
        SyncTableError::Invalid => failed(ROWS_INVALID),
        SyncTableError::Unconfigured => failed(STORAGE_UNCONFIGURED),
    };
    report.change_context(context)
}

const fn failed(code: &'static str) -> StageError {
    permanent(Stage::Prepare, code)
}

/// Writes the run's changes and issues, and returns the `prepare` part.
async fn prepare(storage: &Storage, record: &RunRecord) -> Result<PreparePart, Report<StageError>> {
    let definition = Definition::from_yaml(&record.input.definition)
        .change_context(failed(DEFINITION_INVALID))?;
    one_table_per_pipeline(&definition).change_context(failed(DEFINITION_INVALID))?;
    let capture = record.capture.as_ref().ok_or_else(|| {
        Report::new(StageError::NotReady {
            stage: Stage::Prepare,
        })
    })?;
    let tables = captured_tables(&definition, capture).change_context(failed(CAPTURE_INVALID))?;

    let scratch = tempfile::tempdir().change_context(retryable(Stage::Prepare))?;
    let database = scratch.path().join("prepare.duckdb");
    let input = record.input.clone();
    let prepared = LakeSettings::of(storage)
        .map_err(lake_failed)?
        .run(lake_failed, move |lake| {
            let changes = stage_and_collect(lake, &database, &definition, &input, &tables)?;
            let rows = SyncTable::open(lake)
                .and_then(|table| table.write(input.run, &changes.rows))
                .map_err(sync_failed)?;
            Ok(Prepared { changes, rows })
        })
        .await?;

    let issues = issues::write(
        storage,
        record.input.run,
        scratch.path(),
        &prepared.changes.issues,
    )
    .await
    .change_context(retryable(Stage::Prepare))?;
    Ok(PreparePart {
        rows: prepared.rows,
        issues,
        issue_count: prepared.changes.issues.len() as u64,
    })
}

/// Copies the run's rows of each capture table from `lake` into a workspace at `database`, stages
/// each table, runs the SQL steps of `definition`, and turns their rows into changes.
fn stage_and_collect(
    lake: &Lake,
    database: &Path,
    definition: &Definition,
    input: &Input,
    tables: &[CapturedTable],
) -> Result<Changes, Report<StageError>> {
    let config = WorkspaceConfig {
        variables: definition.variables().clone(),
        ..WorkspaceConfig::default()
    };
    let target = lake.attach_database(database).map_err(lake_failed)?;
    for table in tables {
        lake.table(&table.key)
            .and_then(|capture| capture.copy_run(input.run, &target, &table.copy, SEQUENCE))
            .map_err(lake_failed)?;
    }
    target.detach().map_err(lake_failed)?;
    let workspace = Workspace::open(database, config, &[]).map_err(|report| {
        let context = match report.current_context() {
            OpenError::Load { .. } => failed(CAPTURE_INVALID),
            OpenError::Configure { .. } | OpenError::Open { .. } => retryable(Stage::Prepare),
        };
        report.change_context(context)
    })?;
    let mut staged = BTreeMap::new();
    for table in tables {
        staging::stage(&workspace, &table.copy, &table.staged, &table.primary_key)
            .change_context_lazy(|| InputError::Staging {
                table: table.name.clone(),
            })
            .change_context(failed(CAPTURE_INVALID))?;
        staged.insert(table.name.clone(), table.staged.clone());
    }
    let prepared =
        run_pipelines(&workspace, definition, &staged).change_context(failed(STEP_FAILED))?;
    let context = Context {
        run: input.run,
        web_id: input.web,
        id_namespace: &input.id_namespace,
        unit_maps: definition.unit_maps(),
    };
    collect_changes(&workspace, &prepared, &context).change_context(failed(ROWS_INVALID))
}

/// Refuses a definition in which a pipeline reads a second table: an entity pipeline with an
/// input for its SQL, or a link pipeline that starts from more than one input.
fn one_table_per_pipeline(definition: &Definition) -> Result<(), Report<InputError>> {
    let entity = definition
        .entity_pipelines()
        .iter()
        .find(|pipeline| !pipeline.inputs.is_empty())
        .map(|pipeline| pipeline.source.to_string());
    let link = definition
        .link_pipelines()
        .iter()
        .find(|link| match &link.input {
            LinkInput::Inputs(inputs) => inputs.iter().nth(1).is_some(),
            LinkInput::Checkpoint(_) => false,
        })
        .map(|link| link.id.to_string());
    entity.or(link).map_or(Ok(()), |pipeline| {
        Err(Report::new(InputError::SecondTable {
            pipeline: pipeline.into_boxed_str(),
        }))
    })
}

/// Pairs each table of `definition` with its capture table. A source that is a checkpoint of
/// another pipeline has none.
///
/// # Errors
///
/// - [`InputError::MissingTable`] if a table has no capture table. A table without changes needs a
///   query that gives no rows.
/// - [`InputError::UnknownTable`] if a capture table is of no table of the definition
fn captured_tables(
    definition: &Definition,
    capture: &CapturePart,
) -> Result<Vec<CapturedTable>, Report<InputError>> {
    let tables = definition
        .sources()
        .iter()
        .filter_map(|(name, source)| Some((name, source.primary_key()?)))
        .map(|(name, primary_key)| {
            let captured = capture.sources.get(name.as_ref()).ok_or_else(|| {
                Report::new(InputError::MissingTable {
                    table: name.clone(),
                })
            })?;
            Ok(CapturedTable {
                name: name.clone(),
                primary_key: primary_key.clone(),
                key: captured.key.clone(),
                copy: format!("_capture/{name}").into(),
                staged: format!("_source/{name}").into(),
            })
        })
        .collect::<Result<Vec<_>, Report<InputError>>>()?;
    if let Some(unknown) = capture.sources.keys().find(|captured| {
        !tables
            .iter()
            .any(|table| table.name.as_ref() == captured.as_ref())
    }) {
        return Err(Report::new(InputError::UnknownTable {
            table: unknown.clone(),
        }));
    }
    Ok(tables)
}
