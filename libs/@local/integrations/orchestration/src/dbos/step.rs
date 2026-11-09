//! The [`StepContext`] of the DBOS backend.

use alloc::string::String;
use core::{future::Future, num::NonZero};

use dbos::{StepOptions, sysdb};
use error_stack::Report;
use serde::{Serialize, de::DeserializeOwned};

use crate::{
    FailureKind, RetryPolicy, RunError, StepContext, StepFailure, StepName,
    dbos::stored::{RunFailureStored, StepFailureStored},
};

/// Runs each step of a run as a DBOS step, retried by DBOS as the run's [`RetryPolicy`] says.
pub(crate) struct DbosStepContext {
    options: StepOptions<StepFailureStored>,
    /// The number of steps that completed, which is the next step's index.
    completed: u32,
    /// Why a step stopped the run, as the error the workflow returns. The run function returns
    /// [`RunError::Stopped`] and the workflow records this.
    pub reason: Option<dbos::Error<RunFailureStored>>,
}

impl DbosStepContext {
    pub(crate) fn new(policy: RetryPolicy) -> Self {
        let options = StepOptions {
            max_attempts: policy.max_attempts.get(),
            interval: policy.initial_delay,
            backoff_rate: f64::from(policy.multiplier.get()),
            max_interval: policy.max_delay,
            ..StepOptions::default()
        }
        .should_retry(|error: &dbos::Error<StepFailureStored>| {
            !matches!(
                error,
                dbos::Error::Application(StepFailureStored {
                    kind: FailureKind::Permanent,
                    ..
                })
            )
        });
        Self {
            options,
            completed: 0,
            reason: None,
        }
    }
}

impl StepContext for DbosStepContext {
    async fn run<T, F, Fut>(&mut self, name: StepName, mut step: F) -> Result<T, Report<RunError>>
    where
        T: Serialize + DeserializeOwned + Send,
        F: FnMut() -> Fut + Send,
        Fut: Future<Output = Result<T, Report<StepFailure>>> + Send,
    {
        let outcome = dbos::step_with(name.as_ref(), self.options.clone(), || {
            let attempt = step();
            async move {
                attempt.await.map_err(|report| {
                    tracing::warn!(error = ?report, "step failed");
                    dbos::Error::Application(StepFailureStored::from(report.current_context()))
                })
            }
        })
        .await;

        match outcome {
            Ok(output) => {
                self.completed += 1;
                Ok(output)
            }
            Err(error) => {
                self.reason = Some(stop_reason(self.completed, &name, error));
                Err(Report::new(RunError::Stopped))
            }
        }
    }
}

/// The reason a step stopped the run, from the error the DBOS step ended with.
///
/// A step's own failure fails the run with a [`RunFailureStored`], which DBOS records. A step
/// that DBOS stopped keeps DBOS's error, so a cancelled run stays cancelled and a run its
/// database failed stays pending for recovery.
#[expect(
    clippy::wildcard_enum_match_arm,
    reason = "`dbos::Error` is non-exhaustive"
)]
fn stop_reason(
    index: u32,
    name: &StepName,
    error: dbos::Error<StepFailureStored>,
) -> dbos::Error<RunFailureStored> {
    let step_failed = |attempts: u32, code: String| {
        dbos::Error::Application(RunFailureStored::Step {
            index,
            name: String::from(name.as_ref()),
            attempts: NonZero::new(attempts).unwrap_or(NonZero::<u32>::MIN),
            code,
        })
    };

    match error {
        dbos::Error::Application(failure) => step_failed(1, failure.code),
        dbos::Error::MaxStepRetriesExceeded {
            attempts,
            mut errors,
            ..
        } => step_failed(
            attempts,
            match errors.pop() {
                Some(dbos::Error::Application(failure)) => failure.code,
                _ => String::from("step-failed"),
            },
        ),
        dbos::Error::SystemDatabase(sysdb::Error::UnexpectedStep {
            expected, recorded, ..
        }) => dbos::Error::Application(RunFailureStored::NonDeterministic {
            index,
            recorded,
            requested: expected,
        }),
        dbos::Error::SystemDatabase(error) => dbos::Error::SystemDatabase(error),
        dbos::Error::WorkflowCancelled { workflow_id } => {
            dbos::Error::WorkflowCancelled { workflow_id }
        }
        other => {
            tracing::error!(error = %other, "DBOS stopped a step for an unhandled reason");
            dbos::Error::Application(RunFailureStored::Function {
                code: String::from("backend-error"),
            })
        }
    }
}
