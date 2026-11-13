//! Submission and workflow execution of integration runs.

mod function;
mod start;
#[cfg(test)]
mod tests;

use error_stack::{Report, ResultExt as _, bail};
use hash_integrations_definition::{ConnectorId, Definition};
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
use uuid::Uuid;

pub use self::function::PipelineFunction;
use self::start::{FUNCTION_VERSION, RETRY_POLICY, admission_key, interface_run_id, run_id};
use crate::{
    OperationRequest, RunRequest,
    orchestration::{Payload, RunId, RunStart, RunStatus, Runs, StartError},
};

/// Who asks, for which web, under which request ID.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Request {
    pub web: WebId,
    pub actor: ActorEntityUuid,
    pub id: Uuid,
}

/// What to run, and for which connector.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Submission {
    pub connector: ConnectorId,
    pub operation: OperationRequest,
    pub allow_mass_archive: bool,
}

/// Why the service rejected a request.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum ServiceError {
    #[display("the request is for another web than this node's")]
    WebMismatch,
    #[display("the integration definition is invalid")]
    InvalidDefinition,
    #[display("run `{active}` of this integration is still active")]
    AlreadyActive { active: RunId },
    #[display(
        "the request ID was used before for a different run: another actor, definition, \
         operation, function version or retry policy"
    )]
    RequestMismatch,
    #[display("the orchestration backend could not complete the request")]
    Backend,
}

/// Starts, inspects and cancels the integration runs of one node's web.
pub struct IntegrationService<R> {
    runs: R,
    web: WebId,
}

impl<R: Runs> IntegrationService<R> {
    /// Binds submissions, status reads and cancellation to one web.
    #[must_use]
    pub const fn new(runs: R, web: WebId) -> Self {
        Self { runs, web }
    }

    /// Starts the run of `request`, or attaches to it when the request is repeated.
    ///
    /// A repeated request attaches only if it starts the same run: the same actor, operation and
    /// options, function version and retry policy. Version 1 uses three attempts with initial
    /// one-second delay, multiplier two, and a sixty-second maximum. A retry after a deploy that
    /// changes the version or policy fails with [`ServiceError::RequestMismatch`].
    ///
    /// # Errors
    ///
    /// - [`ServiceError::WebMismatch`] if the request is for another web than this node's.
    /// - [`ServiceError::InvalidDefinition`] if an apply definition is invalid or names another
    ///   connector.
    /// - [`ServiceError::AlreadyActive`] if another run of the integration is active.
    /// - [`ServiceError::RequestMismatch`] if the request ID was used before for a different run.
    /// - [`ServiceError::Backend`] if the backend could not start the run.
    ///
    /// # Panics
    /// Panics if the plain-data [`RunRequest`] can no longer be encoded as JSON.
    pub async fn submit(
        &self,
        request: &Request,
        submission: Submission,
    ) -> Result<RunId, Report<ServiceError>> {
        self.check_web(request)?;

        if let OperationRequest::Apply { definition, .. } = &submission.operation {
            let definition = Definition::from_yaml(definition)
                .change_context(ServiceError::InvalidDefinition)?;
            if definition.connector() != &submission.connector {
                bail!(ServiceError::InvalidDefinition);
            }
        }
        let run = run_id(request.web, request.id);
        let admission = admission_key(request.web, &submission.connector);
        let input = RunRequest {
            run,
            web: request.web,
            connector: submission.connector,
            actor: request.actor,
            operation: submission.operation,
            allow_mass_archive: submission.allow_mass_archive,
        };
        let start = RunStart {
            admission,
            version: FUNCTION_VERSION,
            policy: RETRY_POLICY,
            input: Payload::encode(&input).expect("a run input should encode as JSON"),
        };
        let run = interface_run_id(run);
        self.runs
            .start(run.clone(), start)
            .await
            .map_err(start_error)?;

        Ok(run)
    }

    /// Returns the status of `run`, or `None` if no run has this ID.
    ///
    /// # Errors
    ///
    /// - [`ServiceError::WebMismatch`] if the request is for another web than this node's.
    /// - [`ServiceError::Backend`] if the backend could not read the run.
    pub async fn status(
        &self,
        request: &Request,
        run: &RunId,
    ) -> Result<Option<RunStatus>, Report<ServiceError>> {
        self.check_web(request)?;

        self.runs
            .status(run)
            .await
            .change_context(ServiceError::Backend)
    }

    /// Asks `run` to stop before its next step. Cancelling a finished or unknown run succeeds.
    ///
    /// # Errors
    ///
    /// - [`ServiceError::WebMismatch`] if the request is for another web than this node's.
    /// - [`ServiceError::Backend`] if the backend could not record the request.
    pub async fn cancel(&self, request: &Request, run: &RunId) -> Result<(), Report<ServiceError>> {
        self.check_web(request)?;

        self.runs
            .cancel(run)
            .await
            .change_context(ServiceError::Backend)
    }

    fn check_web(&self, request: &Request) -> Result<(), Report<ServiceError>> {
        if request.web != self.web {
            bail!(ServiceError::WebMismatch);
        }

        Ok(())
    }
}

fn start_error(report: Report<StartError>) -> Report<ServiceError> {
    let context = match report.current_context() {
        StartError::AlreadyActive { active } => ServiceError::AlreadyActive {
            active: active.clone(),
        },
        StartError::StartMismatch => ServiceError::RequestMismatch,
        StartError::Backend => ServiceError::Backend,
    };

    report.change_context(context)
}
