//! Shared run inputs, persisted state, and checkpoint utilities.
mod context;
pub(crate) mod current;
pub(crate) mod error;
pub(crate) mod marker;
pub(crate) mod serde;
pub(crate) mod table;
mod target;

#[cfg(test)]
pub(crate) mod tests;

use core::str::FromStr;

use ::serde::{Deserialize, Serialize};
use error_stack::Report;
use hash_integrations_definition::{ConnectorId, Definition};
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
use uuid::Uuid;

pub use self::{
    context::{Clock, FixedClock, RunContext, SendSettings, SystemClock},
    error::{Code, StageError},
    target::{Change, InvalidText, Kind, Target},
};
use crate::{
    ArtifactNamespace,
    graph::Graph,
    sources::{SecretStore, SourceReader},
    stage::{
        capture::capture,
        diff::diff,
        plan::plan,
        send::{SendOutput, send},
    },
};

/// Identifies one ingestion run using lowercase hyphenated UUID text.
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    Serialize,
    Deserialize,
    derive_more::Display,
    derive_more::From,
    derive_more::Into,
)]
#[serde(transparent)]
pub struct RunId(Uuid);
impl FromStr for RunId {
    type Err = uuid::Error;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        Uuid::try_parse(text).map(Self)
    }
}

/// The operation submitted by a caller, resolved once by [`start`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum OperationRequest {
    Apply {
        definition: Box<str>,
        namespace: Box<str>,
        resend_all: bool,
    },
    Restore {
        target: Option<RunId>,
    },
    Reconcile,
}
/// The operation with its restore/reconcile target pinned to a particular run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum Operation {
    Apply { resend_all: bool },
    Restore { target: Option<RunId> },
    Reconcile { target: RunId },
}

/// A request to start or resume an ingestion run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RunRequest {
    pub run: RunId,
    pub web: WebId,
    #[serde(
        serialize_with = "serde::serialize_connector",
        deserialize_with = "serde::deserialize_connector"
    )]
    pub connector: ConnectorId,
    pub actor: ActorEntityUuid,
    pub operation: OperationRequest,
    pub allow_mass_archive: bool,
}

/// Immutable resolved input read by every stage.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RunInput {
    pub run: RunId,
    pub web: WebId,
    #[serde(
        serialize_with = "serde::serialize_connector",
        deserialize_with = "serde::deserialize_connector"
    )]
    pub connector: ConnectorId,
    pub actor: ActorEntityUuid,
    pub operation: Operation,
    pub definition: Option<Box<str>>,
    pub namespace: Box<str>,
    pub allow_mass_archive: bool,
}

fn parse(text: &str) -> Result<Definition, Report<StageError>> {
    Definition::from_yaml(text).map_err(|report| Code::InvalidDefinition.wrap(report))
}
impl RunInput {
    /// Parses this run's definition once for a stage, or returns no definition for empty state.
    ///
    /// # Errors
    /// Returns permanent `invalid_definition` if the stored definition is invalid.
    pub fn parse_definition(&self) -> Result<Option<Definition>, Report<StageError>> {
        self.definition.as_deref().map(parse).transpose()
    }
}

/// Resolves and publishes a run's input, or validates a request against its existing input.
///
/// A retry retains the original resolved reconcile target even after current state changes.
///
/// # Errors
/// Returns permanent errors for a mismatching request/integration, invalid definition, absent
/// target, or reconcile without a committed run. Storage and scratch failures retain their
/// shared retry classifications.
#[tracing::instrument(level = "debug", skip_all, fields(web_id = %request.web, run_id = %request.run))]
pub async fn start(
    context: &RunContext,
    request: RunRequest,
) -> Result<RunInput, Report<StageError>> {
    if context.namespace != ArtifactNamespace::new(request.web.into(), &request.connector) {
        return Err(Code::IntegrationMismatch.report());
    }
    let key = context.namespace.input(request.run.into());
    let input = match marker::finished(context, &key).await? {
        Some(stored) => stored,
        None => marker::finish(context, &key, &resolve(context, &request).await?).await?,
    };
    if !resolved_from(&input, &request) {
        return Err(Code::RequestMismatch.report());
    }
    Ok(input)
}

/// Runs one request through its persisted checkpoints and commits delivery.
///
/// Reusing a run ID resumes completed stages from their winning markers. Each stage owns its
/// workspace lifecycle; the caller owns the run's scratch directory and external resources.
///
/// # Errors
/// Returns the first classified [`StageError`] from input resolution, capture, diffing, planning,
/// delivery, or conditional commit. A failed run retains its completed checkpoints for retry.
#[tracing::instrument(level = "info", skip_all, fields(run = %request.run))]
pub async fn run(
    context: &RunContext,
    request: RunRequest,
    sources: &SourceReader,
    secrets: &impl SecretStore,
    graph: &impl Graph,
) -> Result<SendOutput, Report<StageError>> {
    let input = start(context, request).await?;
    let captured = capture(context, &input, sources, secrets).await?;
    let diffed = diff(context, &input, &captured).await?;
    let planned = plan(context, &input, &captured, &diffed).await?;
    send(context, &input, &diffed, &planned, graph).await
}

async fn stored_input(context: &RunContext, run: RunId) -> Result<RunInput, Report<StageError>> {
    marker::finished(context, &context.namespace.input(run.into()))
        .await?
        .ok_or_else(|| Code::TargetMissing.report())
}
async fn resolve(
    context: &RunContext,
    request: &RunRequest,
) -> Result<RunInput, Report<StageError>> {
    let (operation, definition, namespace) = match &request.operation {
        OperationRequest::Apply {
            definition,
            namespace,
            resend_all,
        } => {
            if parse(definition)?.connector() != &request.connector {
                return Err(Code::IntegrationMismatch.report());
            }
            (
                Operation::Apply {
                    resend_all: *resend_all,
                },
                Some(definition.clone()),
                namespace.clone(),
            )
        }
        OperationRequest::Restore {
            target: Some(target),
        } => {
            let stored = stored_input(context, *target).await?;
            (
                Operation::Restore {
                    target: Some(*target),
                },
                stored.definition,
                stored.namespace,
            )
        }
        OperationRequest::Restore { target: None } => {
            let namespace = match current::read(context).await?.committed {
                Some(committed) => stored_input(context, committed).await?.namespace,
                None => Box::default(),
            };
            (Operation::Restore { target: None }, None, namespace)
        }
        OperationRequest::Reconcile => {
            let target = current::read(context)
                .await?
                .committed
                .ok_or_else(|| Code::NothingCommitted.report())?;
            let stored = stored_input(context, target).await?;
            (
                Operation::Reconcile { target },
                stored.definition,
                stored.namespace,
            )
        }
    };
    Ok(RunInput {
        run: request.run,
        web: request.web,
        connector: request.connector.clone(),
        actor: request.actor,
        operation,
        definition,
        namespace,
        allow_mass_archive: request.allow_mass_archive,
    })
}
fn resolved_from(input: &RunInput, request: &RunRequest) -> bool {
    if input.run != request.run
        || input.web != request.web
        || input.connector != request.connector
        || input.actor != request.actor
        || input.allow_mass_archive != request.allow_mass_archive
    {
        return false;
    }
    match (&input.operation, &request.operation) {
        (
            Operation::Apply { resend_all },
            OperationRequest::Apply {
                definition,
                namespace,
                resend_all: requested_resend,
            },
        ) => {
            resend_all == requested_resend
                && input.definition.as_deref() == Some(definition)
                && input.namespace == *namespace
        }
        (Operation::Restore { target }, OperationRequest::Restore { target: requested }) => {
            target == requested
        }
        (Operation::Reconcile { .. }, OperationRequest::Reconcile) => true,
        _ => false,
    }
}
