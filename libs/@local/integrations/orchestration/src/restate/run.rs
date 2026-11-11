//! What a worker executes for a run: the `IntegrationRun` object, its steps, and the error a
//! failed run ends with.

use alloc::{string::String, sync::Arc};
use core::{future::Future, num::NonZero};

use error_stack::Report;
use restate_sdk::prelude::{
    ContextSideEffects as _, HandlerError, HandlerResult, Json, ObjectContext, RunFuture as _,
    RunRetryPolicy, TerminalError,
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};

use crate::{
    FailureKind, InvalidName, Payload, RetryPolicy, RunError, RunFailure, RunFunction, StepContext,
    StepFailure, StepIndex, StepName,
};

/// What a run is started with: the input of the `IntegrationRun` object's handler.
#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct Start {
    pub version: u32,
    pub policy: RetryPolicy,
    pub input: Payload,
}

/// The object every run executes: the run function on a [`Start`]. Its key is the run's admission
/// key, so Restate executes one run per admission key at a time.
pub(crate) struct IntegrationRun<F>(pub Arc<F>);

#[restate_sdk::object(name = "IntegrationRun")]
impl<F: RunFunction + 'static> IntegrationRun<F> {
    /// Restate calls this handler for every attempt of a run, with the journal of the attempts
    /// before it.
    #[handler]
    async fn run(
        &self,
        ctx: ObjectContext<'_>,
        Json(start): Json<Start>,
    ) -> Result<(), TerminalError> {
        if start.version != F::VERSION.get() {
            return Err(function_failed("version-mismatch"));
        }
        let input = start.input.decode::<F::Input>().map_err(|error| {
            tracing::error!(error = ?error, "the run's input is not the function's input");
            function_failed("invalid-input")
        })?;

        let mut context = RestateStepContext {
            ctx: &ctx,
            policy: start.policy,
            completed: 0,
            stopped: None,
        };
        match self.0.run(&mut context, input).await {
            Ok(()) => Ok(()),
            Err(report) => Err(match report.current_context() {
                RunError::Failed { code } => function_failed(code.as_ref()),
                RunError::Stopped => context
                    .stopped
                    .take()
                    .unwrap_or_else(|| function_failed("stopped-without-step")),
            }),
        }
    }
}

/// Runs each step of a run as a Restate `run` action, which Restate journals, and retries as the
/// run's [`RetryPolicy`] says.
struct RestateStepContext<'a, 'ctx> {
    ctx: &'a ObjectContext<'ctx>,
    policy: RetryPolicy,
    /// The number of steps that completed, which is the next step's index.
    completed: u32,
    /// Why a step stopped the run, as the error the handler ends with.
    stopped: Option<TerminalError>,
}

impl StepContext for RestateStepContext<'_, '_> {
    async fn run<T, F, Fut>(&mut self, name: StepName, mut step: F) -> Result<T, Report<RunError>>
    where
        T: Serialize + DeserializeOwned + Send,
        F: FnMut() -> Fut + Send,
        Fut: Future<Output = Result<T, Report<StepFailure>>> + Send,
    {
        // Restate calls the closure only for a step that is not recorded yet, and journals what
        // it returns.
        let step = &mut step;
        let recorded = self
            .ctx
            .run(move || async move { outcome(step().await) })
            .name(name.as_ref())
            .retry_policy(
                RunRetryPolicy::new()
                    .initial_delay(self.policy.initial_delay)
                    .exponentiation_factor(f32::from(self.policy.multiplier.get()))
                    .max_delay(self.policy.max_delay)
                    .max_attempts(self.policy.max_attempts.get()),
            )
            .await;

        let stopped = match recorded {
            Ok(Json(output)) => match output.decode() {
                Ok(output) => {
                    self.completed += 1;
                    return Ok(output);
                }
                Err(error) => {
                    tracing::error!(error = ?error, "the step's recorded output is not its type");
                    function_failed("invalid-output")
                }
            },
            Err(error) => self.step_failed(&name, error),
        };
        self.stopped = Some(stopped);
        Err(Report::new(RunError::Stopped))
    }
}

impl RestateStepContext<'_, '_> {
    /// The error the run ends with when Restate returns `error` for the step `name`: the
    /// cancellation itself, or the step's failure.
    fn step_failed(&self, name: &StepName, error: TerminalError) -> TerminalError {
        if error.code() == CANCELLED {
            return error;
        }
        // A permanent failure fails the step at once. Any other failure reaches here only after
        // Restate has attempted the step as often as the policy allows.
        let attempts = if error.code() == PERMANENT {
            NonZero::<u32>::MIN
        } else {
            self.policy.max_attempts
        };
        failed(&Failure::Step {
            index: self.completed,
            name: String::from(name.as_ref()),
            attempts,
            code: String::from(error.message()),
        })
    }
}

/// What one attempt of a step hands to Restate: its output to journal, an error to retry, or a
/// terminal error that fails the step for good.
fn outcome<T: Serialize>(result: Result<T, Report<StepFailure>>) -> HandlerResult<Json<Payload>> {
    let report = match result {
        Ok(output) => {
            return Payload::encode(&output).map(Json::from).map_err(|error| {
                tracing::error!(error = ?error, "the step's output does not encode as JSON");
                TerminalError::new_with_code(PERMANENT, "invalid-output").into()
            });
        }
        Err(report) => report,
    };
    tracing::warn!(error = ?report, "step failed");
    let failure = report.current_context();
    Err(match failure.kind {
        FailureKind::Permanent => {
            TerminalError::new_with_code(PERMANENT, failure.code.as_ref()).into()
        }
        FailureKind::Retryable => HandlerError::from(String::from(failure.code.as_ref())),
    })
}

/// The status code of the error Restate raises in a cancelled run.
pub(crate) const CANCELLED: u16 = 409;

/// The status code this backend gives a step failure that must not be retried.
const PERMANENT: u16 = 400;

/// Why a run failed. Restate keeps a status code and a message for a call that failed, and the
/// message of a failed run is this as JSON, which the run's status reads back.
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub(crate) enum Failure {
    Step {
        index: u32,
        name: String,
        attempts: NonZero<u32>,
        code: String,
    },
    Function {
        code: String,
    },
}

impl TryFrom<Failure> for RunFailure {
    type Error = InvalidName;

    fn try_from(failure: Failure) -> Result<Self, InvalidName> {
        Ok(match failure {
            Failure::Step {
                index,
                name,
                attempts,
                code,
            } => Self::Step {
                index: StepIndex::new(index),
                name: name.parse()?,
                attempts,
                code: code.parse()?,
            },
            Failure::Function { code } => Self::Function {
                code: code.parse()?,
            },
        })
    }
}

/// The error a failed run's handler ends with.
fn failed(failure: &Failure) -> TerminalError {
    TerminalError::new(serde_json::to_string(failure).expect("a failure should encode as JSON"))
}

fn function_failed(code: &str) -> TerminalError {
    failed(&Failure::Function {
        code: String::from(code),
    })
}
