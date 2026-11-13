//! Build immutable request bodies from the persisted diff checkpoint.
mod prepare;
mod rows;
mod target;
#[cfg(test)]
mod tests;
mod write;

use alloc::collections::BTreeMap;

use error_stack::Report;
use serde::{Deserialize, Serialize};
use type_system::provenance::{Location, SourceProvenance, SourceType};

use self::{
    target::plan_targets,
    write::{IssueFile, WriteFile},
};
use crate::{
    ArtifactRef, Kind, RunContext, RunInput, StageError,
    graph::{OperationKind, Planner, integration_provenance},
    run::{
        error,
        marker::{finish, finished},
        table::load_table,
    },
    stage::{capture::CaptureOutput, diff::DiffOutput},
};

/// Plans exact Graph bodies, batching and issue records from immutable checkpoint files.
///
/// Every request uses the capture's time and the IDs persisted by stage 2. A completed marker
/// is replayed before any inputs are opened. Fresh attempts close their workspace on failure
/// and before publishing the marker.
///
/// # Errors
/// Returns a classified [`StageError`] for invalid checkpoint rows, unencodable requests,
/// too many batches, or workspace/storage failures.
#[tracing::instrument(level = "info", skip_all, fields(run = %input.run))]
pub async fn plan(
    context: &RunContext,
    input: &RunInput,
    capture: &CaptureOutput,
    diff: &DiffOutput,
) -> Result<PlanOutput, Report<StageError>> {
    let key = context.namespace.plan_output(input.run.into());
    if let Some(output) = finished(context, &key).await? {
        return Ok(output);
    }
    let definition = input.parse_definition()?;
    let targets = plan_targets(definition.as_ref(), diff)?;
    let planner = Planner::new(
        integration_provenance(SourceProvenance {
            ty: SourceType::Integration,
            entity_id: None,
            authors: Vec::new(),
            location: Some(Location {
                name: Some(input.connector.to_string()),
                uri: None,
                description: None,
            }),
            first_published: None,
            last_updated: None,
            loaded_at: Some(capture.captured_at),
        }),
        definition
            .as_ref()
            .map_or_default(|definition| definition.unit_maps().clone()),
    );
    let workspace = context
        .open_workspace(
            definition
                .as_ref()
                .map_or_default(|definition| definition.variables().clone()),
        )
        .await?;
    let written = async {
        for target in &targets {
            load_table(context, &workspace, target.changes, target.table.clone()).await?;
        }
        load_table(context, &workspace, &diff.archives, "archives".into()).await?;
        let mut writes = WriteFile::create(context).await?;
        let mut issues = IssueFile::create(context).await?;
        for kind in [Kind::Entity, Kind::Link] {
            for create in [true, false] {
                prepare::upserts(
                    &workspace,
                    &planner,
                    &targets,
                    kind,
                    create,
                    &mut writes,
                    &mut issues,
                )
                .await?;
            }
        }
        prepare::archives(&workspace, &planner, &mut writes).await?;
        writes.store(context, issues.store(context).await?).await
    }
    .await;
    let closed = workspace.close().await.map_err(error::close);
    let output = match written {
        Ok(output) => {
            closed?;
            output
        }
        Err(report) => {
            if let Err(close) = closed {
                tracing::warn!(error = ?close, "the plan workspace did not close");
            }
            return Err(report);
        }
    };
    finish(context, &key, &output).await
}

/// Immutable planned bodies and issue references.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlanOutput {
    pub writes: ArtifactRef,
    pub issues: ArtifactRef,
    pub batches: u32,
    pub counts: BTreeMap<OperationKind, u64>,
}
