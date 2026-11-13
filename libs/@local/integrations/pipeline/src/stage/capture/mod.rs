//! Reads sources once per run or adopts an existing capture checkpoint.
mod error;
#[cfg(test)]
mod tests;

use alloc::collections::BTreeMap;

use error_stack::Report;
use hash_integrations_definition::{SourceKind, SourceName};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use self::error::source_error;
pub use crate::sources::CapturedSource;
use crate::{
    CaptureRun, Code, Operation, RunContext, RunId, RunInput, SecretStore, SourceReader,
    StageError,
    run::{
        error as run_error,
        marker::{finish, finished},
    },
};

/// Captures selected by the stage's immutable completion marker.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CaptureOutput {
    #[serde(with = "time::serde::rfc3339")]
    pub captured_at: OffsetDateTime,
    #[serde(with = "crate::run::serde::sources")]
    pub sources: BTreeMap<SourceName, CapturedSource>,
    pub adopted_from: Option<RunId>,
}

/// Captures an apply run's sources, adopts a target capture, or returns the winning checkpoint.
///
/// The reader uses the same artifact storage as `context`. Each attempt reads its capture time
/// once; source bindings preserve completed reads across failed attempts. An adopted checkpoint
/// retains its original time and records the immediately requested target.
///
/// # Errors
/// Returns a classified [`StageError`] for invalid definitions, inaccessible sources or
/// credentials, invalid data, workspace/storage failures, or a missing adopted target.
#[tracing::instrument(level = "debug", skip_all, fields(run_id = %input.run))]
pub async fn capture(
    context: &RunContext,
    input: &RunInput,
    sources: &SourceReader,
    secrets: &impl SecretStore,
) -> Result<CaptureOutput, Report<StageError>> {
    let key = context.namespace.capture_output(input.run.into());
    if let Some(output) = finished(context, &key).await? {
        return Ok(output);
    }
    let output = match input.operation {
        Operation::Apply { .. } => apply(context, input, sources, secrets).await?,
        Operation::Restore {
            target: Some(target),
        }
        | Operation::Reconcile { target } => {
            let target_key = context.namespace.capture_output(target.into());
            let adopted: CaptureOutput = finished(context, &target_key)
                .await?
                .ok_or_else(|| Code::TargetMissing.report())?;
            CaptureOutput {
                adopted_from: Some(target),
                ..adopted
            }
        }
        Operation::Restore { target: None } => CaptureOutput {
            captured_at: context.clock.now(),
            sources: BTreeMap::new(),
            adopted_from: None,
        },
    };
    finish(context, &key, &output).await
}

async fn apply(
    context: &RunContext,
    input: &RunInput,
    sources: &SourceReader,
    secrets: &impl SecretStore,
) -> Result<CaptureOutput, Report<StageError>> {
    let captured_at = context.clock.now();
    let definition = input
        .parse_definition()?
        .ok_or_else(|| Code::InvalidDefinition.report())?;
    let workspace = if definition
        .sources()
        .values()
        .any(|source| matches!(source.kind, SourceKind::Sql { .. }))
    {
        Some(
            context
                .open_workspace(definition.variables().clone())
                .await?,
        )
    } else {
        None
    };
    let captured = sources
        .capture_sources(
            workspace.as_ref(),
            &definition,
            &context.namespace,
            CaptureRun {
                web: input.web.into(),
                actor: input.actor.into(),
                id: input.run.into(),
            },
            secrets,
        )
        .await;
    let closed = match workspace {
        Some(workspace) => workspace.close().await.map_err(run_error::close),
        None => Ok(()),
    };
    // Always close the workspace, preserving a source failure as the primary error.
    let sources = captured.map_err(source_error)?;
    closed?;
    Ok(CaptureOutput {
        captured_at,
        sources,
        adopted_from: None,
    })
}
