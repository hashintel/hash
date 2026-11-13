//! Hash and diff checkpoint contract.
mod files;
mod labels;
mod prior;
mod rows;
#[cfg(test)]
mod tests;
use alloc::collections::{BTreeMap, BTreeSet};

use error_stack::Report;
use hash_integrations_definition::{Definition, SourceName};
pub(crate) use rows::prepare_rows;
use serde::{Deserialize, Serialize};

use crate::{
    ArtifactRef, Operation, RunContext, RunId, RunInput, StageError, Target, Workspace,
    run::{
        current::{self, Current},
        error,
        marker::{finish, finished},
    },
    stage::capture::CaptureOutput,
};

const BASE: &str = "_diff/base";
const ROWS: &str = "_diff/rows";
const CARRIED: &str = "_diff/carried";
const RESEND: &str = "_diff/resend";
const RESULT: &str = "_diff/result";
const ROW_COLUMNS: &str = "entity_id, kind, target, source_id, content_hash";
const HASH_COLUMNS: &str = "entity_id, kind, target, source_id, content_hash, live";

/// Prepares captured rows and checkpoints their differences from committed desired state.
///
/// A completed checkpoint is replayed before reading current state. Every fresh attempt closes
/// its workspace before publishing the completion marker, including attempts that fail.
///
/// # Errors
/// Returns a classified [`StageError`] for invalid rows, missing predecessor checkpoints,
/// duplicate identities, unsafe archive counts, or workspace/storage failures.
#[tracing::instrument(level = "debug", skip_all, fields(run_id = %input.run))]
pub async fn diff(
    context: &RunContext,
    input: &RunInput,
    capture: &CaptureOutput,
) -> Result<DiffOutput, Report<StageError>> {
    let key = context.namespace.diff_output(input.run.into());
    if let Some(output) = finished(context, &key).await? {
        return Ok(output);
    }
    let current = current::read(context).await?;
    let definition = input.parse_definition()?;
    let workspace = context
        .open_workspace(
            definition
                .as_ref()
                .map_or_default(|definition| definition.variables().clone()),
        )
        .await?;
    let computed = compute(
        context,
        &workspace,
        input,
        definition.as_ref(),
        capture,
        current,
    )
    .await;
    let closed = workspace.close().await.map_err(error::close);
    let output = computed?;
    closed?;
    finish(context, &key, &output).await
}

async fn compute(
    context: &RunContext,
    workspace: &Workspace,
    input: &RunInput,
    definition: Option<&Definition>,
    capture: &CaptureOutput,
    current: Current,
) -> Result<DiffOutput, Report<StageError>> {
    prior::load(context, workspace, &current).await?;
    let prepared = prepare_rows(context, workspace, input, definition, capture).await?;
    labels::union_rows(workspace, &prepared.targets).await?;
    labels::check_duplicates(workspace).await?;
    let resend_all = matches!(
        input.operation,
        Operation::Apply { resend_all: true } | Operation::Reconcile { .. }
    );
    labels::label(
        workspace,
        &prepared.targets,
        definition,
        capture,
        resend_all,
    )
    .await?;
    let counts = labels::totals(workspace).await?;
    if !input.allow_mass_archive {
        labels::check_archive_limit(&counts)?;
    }
    files::store(context, workspace, prepared, counts, current).await
}

async fn create(workspace: &Workspace, table: &str, sql: String) -> Result<(), Report<StageError>> {
    workspace
        .create_table(table.into(), sql.into_boxed_str())
        .await
        .map_err(error::statement)
}

fn empty_rows(live: bool) -> String {
    let mut sql = "SELECT CAST(NULL AS VARCHAR) AS entity_id, CAST(NULL AS VARCHAR) AS kind, \
                   CAST(NULL AS VARCHAR) AS target, CAST(NULL AS VARCHAR) AS source_id, CAST(NULL \
                   AS VARCHAR) AS content_hash"
        .to_owned();
    if live {
        sql.push_str(", CAST(NULL AS BOOLEAN) AS live");
    }
    sql.push_str(" WHERE false");
    sql
}

/// The desired state and changed rows bound by stage 2.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DiffOutput {
    pub base: Option<RunId>,
    pub resent: Vec<RunId>,
    pub hashes: ArtifactRef,
    pub archives: ArtifactRef,
    pub issues: ArtifactRef,
    pub targets: BTreeMap<Target, TargetDiff>,
}
/// Changes and counts for one target, including empty targets.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TargetDiff {
    pub changes: Option<ArtifactRef>,
    pub counts: DiffCounts,
}
/// Row classifications for a target.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DiffCounts {
    pub inserted: u64,
    pub updated: u64,
    pub resent: u64,
    pub unchanged: u64,
    pub archived: u64,
    pub without_id: u64,
}
/// Rows produced by steps 2 and 3 before diffing.
#[derive(Debug)]
pub struct PreparedRows {
    pub targets: Vec<TargetRows>,
    pub issues: Box<str>,
}
/// A prepared target's table and its mapped inputs.
#[derive(Debug)]
pub struct TargetRows {
    pub target: Target,
    pub table: Box<str>,
    pub columns: Vec<Box<str>>,
    pub sources: BTreeSet<SourceName>,
    pub without_id: u64,
}
