//! Prepare, the second stage: runs a definition's SQL on the rows a run captured and writes the
//! run's entity changes to the sync table.
//!
//! A version of Prepare stages each captured table so that every row has an `_op` of `insert`,
//! `update` or `delete`, a `_key` and a `_seq`. The steps after staging are the same for every
//! version: [`run_pipelines`] and [`collect_changes`].

mod changes;
mod entity_id;
mod incremental;
mod issues;
mod pipeline;
mod property;
#[cfg(test)]
mod tests;
mod workspace;

use alloc::collections::BTreeMap;

use error_stack::Report;
use hash_integrations_definition::{Definition, SourceKind, SourceName};

pub use self::incremental::prepare_incremental;
use self::{
    changes::{ChangeTable, Changes, Context},
    pipeline::{PreparationError, PreparedLink, PreparedSink},
    workspace::Workspace,
};

/// The tables the SQL steps of a definition leave for its sinks and its link pipelines.
#[derive(Debug)]
struct PreparedTables {
    sinks: Vec<PreparedSink>,
    links: Vec<PreparedLink>,
}

/// Runs the entity pipelines of `definition` on the `staged` tables, by the name of their source,
/// and then its link pipelines.
///
/// A pipeline whose source is a checkpoint reads the table an earlier pipeline wrote for it.
///
/// # Errors
///
/// Returns [`PreparationError`] if a step fails, a table loses its staging columns, a sink or a
/// link reads a column its table lacks, or a pipeline reads a checkpoint no earlier pipeline wrote.
///
/// # Panics
///
/// Panics if a pipeline's source is a table that `staged` does not hold.
fn run_pipelines(
    workspace: &Workspace,
    definition: &Definition,
    staged: &BTreeMap<SourceName, Box<str>>,
) -> Result<PreparedTables, Report<PreparationError>> {
    let mut checkpoints = BTreeMap::new();
    let mut sinks = Vec::new();
    for pipeline in definition.entity_pipelines() {
        let input = match definition
            .sources()
            .get(&pipeline.source)
            .map(|source| &source.kind)
        {
            Some(SourceKind::Checkpoint { checkpoint }) => {
                checkpoints.get(checkpoint).cloned().ok_or_else(|| {
                    Report::new(PreparationError::MissingCheckpoint {
                        checkpoint: checkpoint.clone(),
                    })
                })?
            }
            _ => staged
                .get(&pipeline.source)
                .cloned()
                .expect("every table of the definition should be staged"),
        };
        let prepared = workspace.prepare_pipeline(pipeline, &input, &checkpoints)?;
        checkpoints.extend(prepared.checkpoints);
        sinks.extend(prepared.sinks);
    }
    let mut links = Vec::new();
    for link in definition.link_pipelines() {
        let prepared = workspace.prepare_link_pipeline(link, &checkpoints)?;
        workspace.check_metadata(&prepared.table)?;
        links.push(prepared);
    }
    Ok(PreparedTables { sinks, links })
}

/// Reads the rows of each table in `tables` and turns them into changes.
///
/// # Errors
///
/// The errors of [`ChangeTable::read`] and [`ChangeTable::rows`].
fn collect_changes(
    workspace: &Workspace,
    tables: &PreparedTables,
    context: &Context<'_>,
) -> Result<Changes, Report<PreparationError>> {
    let mut changes = Changes::default();
    for sink in &tables.sinks {
        let table = ChangeTable::read(workspace, &sink.table)?;
        context.entity_changes(&mut changes, &sink.sink, table.rows()?);
    }
    for link in &tables.links {
        let table = ChangeTable::read(workspace, &link.table)?;
        context.link_changes(&mut changes, &link.pipeline, table.rows()?);
    }
    Ok(changes)
}
