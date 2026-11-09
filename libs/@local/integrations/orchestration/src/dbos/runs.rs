//! [`Runs`] on the DBOS client: starting, reading and cancelling runs without a worker.

use alloc::vec;

use dbos::{
    DuplicationPolicy, Enqueue, EnqueueOptions,
    sysdb::types::{WorkflowFilter, WorkflowRecord, WorkflowStatus},
};
use error_stack::{Report, ResultExt as _};

use crate::{
    BackendError, RunFailure, RunId, RunPhase, RunStart, RunStatus, Runs, StartError,
    dbos::{
        DbosBackend, QUEUE, WORKFLOW, app_version,
        stored::{RunFailureStored, RunStartStored},
    },
};

impl Runs for DbosBackend {
    /// Enqueues the run under the ID `run` with its admission key as the deduplication ID. A run
    /// that exists under this ID is attached to if it was started with the same start.
    #[tracing::instrument(skip_all, fields(run = %run))]
    async fn start(&self, run: RunId, start: RunStart) -> Result<(), Report<StartError>> {
        let version = app_version(start.version);
        let stored = RunStartStored::from(start);

        if let Some(record) = self
            .record(&run)
            .await
            .change_context(StartError::Backend)?
        {
            let existing: RunStartStored =
                serde_json::from_str(record.input.as_deref().unwrap_or_default())
                    .change_context(StartError::Backend)?;
            return if existing == stored {
                Ok(())
            } else {
                Err(Report::new(StartError::StartMismatch))
            };
        }

        let handle = self
            .client
            .enqueue_with::<_, (), RunFailureStored>(
                WORKFLOW,
                &stored,
                EnqueueOptions {
                    workflow_id: Some(run.as_ref()),
                    app_version: Some(&version),
                    ..EnqueueOptions::on(Enqueue {
                        deduplication_id: Some(&stored.admission),
                        duplication_policy: DuplicationPolicy::ReturnExisting,
                        ..Enqueue::new(QUEUE)
                    })
                },
            )
            .await
            .change_context(StartError::Backend)?;

        let active = handle.workflow_id();
        if active == run.as_ref() {
            return Ok(());
        }
        Err(Report::new(StartError::AlreadyActive {
            active: active.parse().change_context(StartError::Backend)?,
        }))
    }

    async fn status(&self, run: &RunId) -> Result<Option<RunStatus>, Report<BackendError>> {
        let Some(record) = self.record(run).await.change_context(BackendError)? else {
            return Ok(None);
        };
        let steps = self
            .client
            .list_workflow_steps(run.as_ref())
            .await
            .change_context(BackendError)?;
        let completed = steps.iter().filter(|step| step.output.is_some()).count();

        Ok(Some(RunStatus {
            phase: phase(record.status, record.error.as_deref(), !steps.is_empty())?,
            steps_recorded: u32::try_from(completed).unwrap_or(u32::MAX),
        }))
    }

    /// Cancelling marks the run cancelled at once, and its next step does not start.
    async fn cancel(&self, run: &RunId) -> Result<(), Report<BackendError>> {
        match self.client.cancel(run.as_ref()).await {
            Ok(()) | Err(dbos::Error::WorkflowNotFound { .. }) => Ok(()),
            Err(error) => Err(Report::new(error).change_context(BackendError)),
        }
    }
}

impl DbosBackend {
    /// Reads the run's workflow row, or `None` if no run has this ID.
    async fn record(&self, run: &RunId) -> dbos::Result<Option<WorkflowRecord>> {
        let filter = WorkflowFilter {
            workflow_ids: vec![run.as_ref()],
            ..WorkflowFilter::default()
        };
        Ok(self.client.list_workflows(&filter).await?.pop())
    }
}

/// The phase of a run, from its workflow row's status and error and whether any step has been
/// recorded.
///
/// # Errors
///
/// Returns [`BackendError`] if a failed run's recorded error is not one this backend wrote.
fn phase(
    status: WorkflowStatus,
    error: Option<&str>,
    has_steps: bool,
) -> Result<RunPhase, Report<BackendError>> {
    Ok(match status {
        WorkflowStatus::Enqueued | WorkflowStatus::Delayed => RunPhase::Pending,
        WorkflowStatus::Pending if !has_steps => RunPhase::Pending,
        WorkflowStatus::Pending => RunPhase::Running,
        WorkflowStatus::Success => RunPhase::Completed,
        WorkflowStatus::Cancelled => RunPhase::Cancelled,
        WorkflowStatus::Error => RunPhase::Failed(run_failure(error)?),
        WorkflowStatus::MaxRecoveryAttemptsExceeded => {
            RunPhase::Failed(backend_failure("recovery-exhausted"))
        }
    })
}

/// Decodes the error DBOS recorded for a failed run.
///
/// The run's own failure is the application error of a [`RunFailureStored`]. An engine error in
/// its place, such as a failure to decode the input, reads as a backend failure.
#[expect(
    clippy::wildcard_enum_match_arm,
    reason = "`dbos::Error` is non-exhaustive"
)]
fn run_failure(error: Option<&str>) -> Result<RunFailure, Report<BackendError>> {
    let error =
        error.ok_or_else(|| Report::new(BackendError).attach("the failed run records no error"))?;
    match serde_json::from_str::<dbos::Error<RunFailureStored>>(error)
        .change_context(BackendError)?
    {
        dbos::Error::Application(failure) => {
            RunFailure::try_from(failure).change_context(BackendError)
        }
        _ => Ok(backend_failure("backend-error")),
    }
}

fn backend_failure(code: &str) -> RunFailure {
    RunFailure::Function {
        code: code.parse().expect("should be a failure code"),
    }
}

#[cfg(test)]
mod tests {
    use core::num::NonZero;

    use dbos::sysdb::types::WorkflowStatus;
    use rstest::rstest;
    use serde_json::json;

    use crate::{
        BackendError, RunFailure, RunPhase, StepIndex,
        dbos::{runs::phase, stored::RunFailureStored},
    };

    #[rstest]
    #[case::enqueued(WorkflowStatus::Enqueued, false, RunPhase::Pending)]
    #[case::claimed(WorkflowStatus::Pending, false, RunPhase::Pending)]
    #[case::running(WorkflowStatus::Pending, true, RunPhase::Running)]
    #[case::success(WorkflowStatus::Success, true, RunPhase::Completed)]
    #[case::cancelled(WorkflowStatus::Cancelled, true, RunPhase::Cancelled)]
    fn phase_without_error(
        #[case] status: WorkflowStatus,
        #[case] has_steps: bool,
        #[case] expected: RunPhase,
    ) {
        assert_eq!(
            phase(status, None, has_steps).expect("should map the status"),
            expected
        );
    }

    #[test]
    fn phase_failed_step() {
        let error = dbos::Error::Application(RunFailureStored::Step {
            index: 1,
            name: "deliver".to_owned(),
            attempts: NonZero::new(3).expect("three should be nonzero"),
            code: "graph-unavailable".to_owned(),
        });
        let recorded = serde_json::to_string(&error).expect("should encode the error");

        assert_eq!(
            phase(WorkflowStatus::Error, Some(&recorded), true).expect("should map the status"),
            RunPhase::Failed(RunFailure::Step {
                index: StepIndex::new(1),
                name: "deliver".parse().expect("should be a step name"),
                attempts: NonZero::new(3).expect("three should be nonzero"),
                code: "graph-unavailable"
                    .parse()
                    .expect("should be a failure code"),
            })
        );
    }

    #[test]
    fn phase_failed_by_engine() {
        let recorded = json!({ "WorkflowFailed": { "workflow_id": "run-1", "message": "boom" } });

        assert_eq!(
            phase(WorkflowStatus::Error, Some(&recorded.to_string()), true)
                .expect("should map the status"),
            RunPhase::Failed(RunFailure::Function {
                code: "backend-error".parse().expect("should be a failure code"),
            }),
            "an engine error in place of the run's failure should read as a backend failure"
        );
    }

    #[test]
    fn phase_failed_without_error() {
        let report = phase(WorkflowStatus::Error, None, true)
            .expect_err("a failed run without a recorded error should be rejected");

        assert_eq!(*report.current_context(), BackendError);
    }
}
