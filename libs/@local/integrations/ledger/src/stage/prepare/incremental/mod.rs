//! Prepare for incremental updates: the captured files hold only the rows that changed, each
//! marked in its column `_change` as an `insert`, an `update` or a `delete`.

mod staging;
#[cfg(test)]
mod tests;

use alloc::collections::BTreeMap;
use std::path::{Path, PathBuf};

use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::{Definition, LinkInput, PrimaryKey, SourceName};

use super::{
    changes::{Changes, Context},
    collect_changes, issues, run_pipelines,
    workspace::{Workspace, WorkspaceConfig},
};
use crate::{
    run::{CapturePart, Input, PreparePart, RunId, RunRecord, Stage},
    stage::{
        StageError, begin, end,
        failure::{permanent, retryable},
    },
    storage::Storage,
    sync_table::{self, SyncTableError},
};

/// The definition does not parse, or a pipeline reads a second table.
const DEFINITION_INVALID: &str = "prepare_definition_invalid";
/// A capture file is missing, cannot be loaded, or cannot be staged.
const CAPTURE_INVALID: &str = "prepare_capture_invalid";
/// An SQL step fails, drops a staging column, or lacks a column a sink reads.
const STEP_FAILED: &str = "prepare_step_failed";
/// A row cannot be turned into a change, or cannot be written to the sync table.
const ROWS_INVALID: &str = "prepare_rows_invalid";

/// Reports why Prepare refuses the definition or the capture files of a run.
#[derive(Debug, derive_more::Display, derive_more::Error)]
enum InputError {
    /// A join of two tables would see only the changed rows of each.
    #[display("the pipeline `{pipeline}` reads a second table")]
    SecondTable { pipeline: Box<str> },
    #[display("the table `{table}` has no capture file")]
    MissingFile { table: SourceName },
    #[display("the capture file `{table}` is of no table of the definition")]
    UnknownFile { table: Box<str> },
    #[display("the capture file of `{table}` cannot be staged")]
    Staging { table: SourceName },
}

/// A table of the definition and the key of its capture file.
#[derive(Debug)]
struct CapturedTable {
    name: SourceName,
    primary_key: PrimaryKey,
    key: Box<str>,
}

/// Prepares `run`: turns the rows of its capture files into the run's entity changes.
///
/// The changes go to the sync table, the rows that could not be turned as they are to the issues
/// file, and the `prepare` part to `run.json`.
///
/// A run that was prepared before is left as it is. Preparing a run again after a retryable error
/// replaces the rows the earlier attempt wrote to the sync table.
///
/// # Errors
///
/// - [`StageError::Permanent`] if the definition or the capture files are refused, an SQL step
///   fails, or a row cannot be turned into a change. The code in the `failure` part of `run.json`
///   names the step. It is returned without writing if the run cannot be prepared: it is not the
///   run `current.json` names, it failed before, or its `run.json` is missing or unreadable.
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
    let mut files = Vec::with_capacity(tables.len());
    for table in &tables {
        files.push(
            storage
                .download(&table.key, scratch.path())
                .await
                .change_context(retryable(Stage::Prepare))?,
        );
    }
    // DuckDB blocks, so the workspace is used in one blocking task, which owns what it reads.
    let database = scratch.path().join("prepare.duckdb");
    let input = record.input.clone();
    let changes = tokio::task::spawn_blocking(move || {
        changes(&database, &definition, &input, &tables, &files)
    })
    .await
    .change_context(retryable(Stage::Prepare))??;

    let issues = issues::write(storage, record.input.run, scratch.path(), &changes.issues)
        .await
        .change_context(retryable(Stage::Prepare))?;
    let part = PreparePart {
        rows: changes.rows.len() as u64,
        issues,
        issue_count: changes.issues.len() as u64,
    };
    sync_table::write(storage, record.input.run, changes.rows)
        .await
        .map_err(|report| {
            let context = match report.current_context() {
                SyncTableError::Storage => retryable(Stage::Prepare),
                SyncTableError::Invalid => failed(ROWS_INVALID),
            };
            report.change_context(context)
        })?;
    Ok(part)
}

/// Stages each captured table in a workspace at `database`, runs the SQL steps of `definition`,
/// and turns their rows into changes.
fn changes(
    database: &Path,
    definition: &Definition,
    input: &Input,
    tables: &[CapturedTable],
    files: &[PathBuf],
) -> Result<Changes, Report<StageError>> {
    let config = WorkspaceConfig {
        variables: definition.variables().clone(),
        ..WorkspaceConfig::default()
    };
    let workspace = Workspace::open(database, config).change_context(retryable(Stage::Prepare))?;
    let mut staged = BTreeMap::new();
    for (table, file) in tables.iter().zip(files) {
        let capture = format!("_capture/{}", table.name);
        let source = format!("_source/{}", table.name).into_boxed_str();
        let refused = || InputError::Staging {
            table: table.name.clone(),
        };
        workspace
            .load_capture(file, &capture)
            .change_context_lazy(refused)
            .change_context(failed(CAPTURE_INVALID))?;
        staging::stage(&workspace, &capture, &source, &table.primary_key)
            .change_context_lazy(refused)
            .change_context(failed(CAPTURE_INVALID))?;
        staged.insert(table.name.clone(), source);
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
        .find(|link| matches!(&link.input, LinkInput::Inputs(inputs) if inputs.iter().nth(1).is_some()))
        .map(|link| link.id.to_string());
    entity.or(link).map_or(Ok(()), |pipeline| {
        Err(Report::new(InputError::SecondTable {
            pipeline: pipeline.into_boxed_str(),
        }))
    })
}

/// Pairs each table of `definition` with its capture file. A source that is a checkpoint of
/// another pipeline has no file.
///
/// # Errors
///
/// - [`InputError::MissingFile`] if a table has no capture file. A table without changes needs an
///   empty file.
/// - [`InputError::UnknownFile`] if a capture file is of no table
fn captured_tables(
    definition: &Definition,
    capture: &CapturePart,
) -> Result<Vec<CapturedTable>, Report<InputError>> {
    let tables = definition
        .sources()
        .iter()
        .filter_map(|(name, source)| Some((name, source.primary_key()?)))
        .map(|(name, primary_key)| {
            let file = capture.sources.get(name.as_ref()).ok_or_else(|| {
                Report::new(InputError::MissingFile {
                    table: name.clone(),
                })
            })?;
            Ok(CapturedTable {
                name: name.clone(),
                primary_key: primary_key.clone(),
                key: file.key.clone(),
            })
        })
        .collect::<Result<Vec<_>, Report<InputError>>>()?;
    if let Some(file) = capture.sources.keys().find(|file| {
        !tables
            .iter()
            .any(|table| table.name.as_ref() == file.as_ref())
    }) {
        return Err(Report::new(InputError::UnknownFile {
            table: file.clone(),
        }));
    }
    Ok(tables)
}
