mod run_input;
mod start;
#[cfg(test)]
mod tests;

use error_stack::{Report, ResultExt as _, bail};
use hash_integrations_definition::Definition;
use hash_integrations_orchestration::{Payload, RunId, RunStart, RunStatus, Runs, StartError};
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
use uuid::Uuid;

pub(crate) use self::run_input::{Invocation, RunInput};
use self::start::{FUNCTION_VERSION, RETRY_POLICY, admission_key, run_id};

/// Who asks, for which web, under which request ID.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Request {
    pub web: WebId,
    pub actor: ActorEntityUuid,
    pub id: Uuid,
}

/// The definition to run, as written, and how it was asked for.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Submission {
    pub definition: Box<str>,
    pub invocation: Invocation,
}

/// Why the service rejected a request.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub(crate) enum ServiceError {
    #[display("the request is for another web than this node's")]
    WebMismatch,
    #[display("the integration definition is invalid")]
    InvalidDefinition,
    #[display("run `{active}` of this integration is still active")]
    AlreadyActive { active: RunId },
    #[display(
        "the request ID was used before for a different run: another actor, definition, \
         invocation, function version or retry policy"
    )]
    RequestMismatch,
    #[display("the orchestration backend could not complete the request")]
    Backend,
}

/// Starts, inspects and cancels the integration runs of one node's web.
pub(crate) struct IntegrationService<R> {
    runs: R,
    web: WebId,
}

impl<R: Runs> IntegrationService<R> {
    pub(crate) const fn new(runs: R, web: WebId) -> Self {
        Self { runs, web }
    }

    /// Starts the run of `request`, or attaches to it when the request is repeated.
    ///
    /// A backend that compares starts attaches a repeated request only if it starts the same run:
    /// the same actor, definition and invocation, under the same [`FUNCTION_VERSION`] and
    /// [`RETRY_POLICY`]. A retry after a deploy that changes either fails with
    /// [`ServiceError::RequestMismatch`]. The Restate backend does not compare: a repeated request
    /// attaches to its run, which keeps its first start. It also does not refuse a run while
    /// another run of the integration is active; the new run waits for it.
    ///
    /// # Errors
    ///
    /// - [`ServiceError::WebMismatch`] if the request is for another web than this node's.
    /// - [`ServiceError::InvalidDefinition`] if the definition is not a valid definition.
    /// - [`ServiceError::AlreadyActive`] if another run of the integration is active and the
    ///   backend refuses a second one.
    /// - [`ServiceError::RequestMismatch`] if the request ID was used before for a different run
    ///   and the backend compares starts.
    /// - [`ServiceError::Backend`] if the backend could not start the run.
    pub(crate) async fn submit(
        &self,
        request: &Request,
        submission: Submission,
    ) -> Result<RunId, Report<ServiceError>> {
        self.check_web(request.web)?;

        let definition = Definition::from_yaml(&submission.definition)
            .change_context(ServiceError::InvalidDefinition)?;
        let input = RunInput {
            web: request.web,
            connector: definition.connector().as_ref().into(),
            owner: request.actor,
            definition: submission.definition,
            invocation: submission.invocation,
        };
        let start = RunStart {
            admission: admission_key(request.web, definition.connector()),
            version: FUNCTION_VERSION,
            policy: RETRY_POLICY,
            input: Payload::encode(&input).expect("a run input should encode as JSON"),
        };

        let run = run_id(request.web, request.id);
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
    /// - [`ServiceError::WebMismatch`] if `web` is another web than this node's.
    /// - [`ServiceError::Backend`] if the backend could not read the run.
    pub(crate) async fn status(
        &self,
        web: WebId,
        run: &RunId,
    ) -> Result<Option<RunStatus>, Report<ServiceError>> {
        self.check_web(web)?;

        self.runs
            .status(run)
            .await
            .change_context(ServiceError::Backend)
    }

    /// Asks `run` to stop before its next step. Cancelling a finished or unknown run succeeds.
    ///
    /// # Errors
    ///
    /// - [`ServiceError::WebMismatch`] if `web` is another web than this node's.
    /// - [`ServiceError::Backend`] if the backend could not record the request.
    pub(crate) async fn cancel(&self, web: WebId, run: &RunId) -> Result<(), Report<ServiceError>> {
        self.check_web(web)?;

        self.runs
            .cancel(run)
            .await
            .change_context(ServiceError::Backend)
    }

    fn check_web(&self, web: WebId) -> Result<(), Report<ServiceError>> {
        if web != self.web {
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
