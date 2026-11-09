use alloc::vec::Vec;
use core::num::NonZero;

use error_stack::Report;
use time::UtcDateTime;

use crate::{
    FailureKind, Payload, RunEvent, RunFailure, RunStart, StepFailure, StepIndex, StepName,
};

/// Reports an event or a step request that cannot follow the events recorded for a run.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum InvalidTransition {
    #[display("the run has already finished")]
    Finished,
    #[display("step {actual} cannot follow the recorded steps; the next step is {expected}")]
    UnexpectedIndex {
        expected: StepIndex,
        actual: StepIndex,
    },
    #[display("step {index} is retrying `{expected}`, but the event names `{actual}`")]
    UnexpectedName {
        index: StepIndex,
        expected: StepName,
        actual: StepName,
    },
    #[display("the run was cancelled without a cancel request")]
    CancelNotRequested,
    #[display("the run completed while step `{name}` waits for another attempt")]
    StepRetrying { name: StepName },
    #[display("a run records at most {maximum} steps")]
    TooManySteps { maximum: u32 },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RunPhase {
    /// No step has been attempted.
    Pending,
    Running,
    Completed,
    Failed(RunFailure),
    Cancelled,
}

/// What a run function's request for a step does.
#[derive(Debug)]
pub enum StepDecision<'state> {
    /// The step is recorded. Return its output without executing it.
    Replay(&'state Payload),
    /// Execute the step, no earlier than `not_before` when it is set. Attempts count from one.
    Execute {
        attempt: NonZero<u32>,
        not_before: Option<UtcDateTime>,
    },
    /// A cancel was requested. Record [`RunEvent::Cancelled`].
    Cancel,
    /// The run function diverged from the recorded steps. Record the failure.
    Fail(RunFailure),
}

#[derive(Debug, Clone)]
struct RecordedStep {
    name: StepName,
    output: Payload,
}

#[derive(Debug, Clone)]
struct Retry {
    name: StepName,
    failures: NonZero<u32>,
    not_before: UtcDateTime,
}

/// The state of a run, built by applying its [`RunEvent`]s in order to its [`RunStart`].
///
/// The same events always produce the same state, so any process can rebuild a run from its
/// recorded events.
#[derive(Debug, Clone)]
pub struct RunState {
    start: RunStart,
    steps: Vec<RecordedStep>,
    retry: Option<Retry>,
    cancel_requested: bool,
    phase: RunPhase,
}

impl RunState {
    #[must_use]
    pub const fn new(start: RunStart) -> Self {
        Self {
            start,
            steps: Vec::new(),
            retry: None,
            cancel_requested: false,
            phase: RunPhase::Pending,
        }
    }

    #[must_use]
    pub const fn is_finished(&self) -> bool {
        matches!(
            self.phase,
            RunPhase::Completed | RunPhase::Failed(_) | RunPhase::Cancelled
        )
    }

    #[must_use]
    pub const fn phase(&self) -> &RunPhase {
        &self.phase
    }

    /// Returns the step that failed and waits for another attempt.
    #[must_use]
    pub fn retrying_step(&self) -> Option<&StepName> {
        self.retry.as_ref().map(|retry| &retry.name)
    }

    #[must_use]
    pub const fn cancel_requested(&self) -> bool {
        self.cancel_requested
    }

    /// Returns the index of the first step that has not been recorded.
    #[must_use]
    pub fn next_index(&self) -> StepIndex {
        // `apply` records at most `u32::MAX` steps, so the length always fits.
        StepIndex::new(u32::try_from(self.steps.len()).unwrap_or(u32::MAX))
    }

    /// Decides what the run function's request for step `index`, named `name`, does.
    ///
    /// # Errors
    ///
    /// - [`InvalidTransition::Finished`] if the run has finished.
    /// - [`InvalidTransition::UnexpectedIndex`] if `index` is beyond the next step.
    pub fn decide(
        &self,
        index: StepIndex,
        name: &StepName,
    ) -> Result<StepDecision<'_>, Report<InvalidTransition>> {
        if self.is_finished() {
            return Err(Report::new(InvalidTransition::Finished));
        }
        let expected = self.next_index();
        if index > expected {
            return Err(Report::new(InvalidTransition::UnexpectedIndex {
                expected,
                actual: index,
            }));
        }

        if let Some(recorded) = self.steps.get(index.get() as usize) {
            return Ok(if recorded.name == *name {
                StepDecision::Replay(&recorded.output)
            } else {
                StepDecision::Fail(RunFailure::NonDeterministic {
                    index,
                    recorded: recorded.name.clone(),
                    requested: name.clone(),
                })
            });
        }

        if self.cancel_requested {
            return Ok(StepDecision::Cancel);
        }

        Ok(match &self.retry {
            None => StepDecision::Execute {
                attempt: NonZero::<u32>::MIN,
                not_before: None,
            },
            Some(retry) if retry.name != *name => {
                StepDecision::Fail(RunFailure::NonDeterministic {
                    index,
                    recorded: retry.name.clone(),
                    requested: name.clone(),
                })
            }
            Some(retry) => StepDecision::Execute {
                attempt: retry.failures.saturating_add(1),
                not_before: Some(retry.not_before),
            },
        })
    }

    /// Applies the next recorded event.
    ///
    /// # Errors
    ///
    /// Returns [`InvalidTransition`] if `event` cannot follow the events applied so far.
    pub fn apply(&mut self, event: RunEvent) -> Result<(), Report<InvalidTransition>> {
        if self.is_finished() {
            return Err(Report::new(InvalidTransition::Finished));
        }

        match event {
            RunEvent::StepCompleted {
                index,
                name,
                output,
            } => {
                self.check_step(index, &name)?;
                if index.get() == u32::MAX {
                    return Err(Report::new(InvalidTransition::TooManySteps {
                        maximum: u32::MAX,
                    }));
                }
                self.steps.push(RecordedStep { name, output });
                self.retry = None;
                self.phase = RunPhase::Running;
            }
            RunEvent::StepFailed {
                index,
                name,
                failure,
                at,
            } => {
                self.check_step(index, &name)?;
                self.fail_step(index, name, failure, at);
            }
            RunEvent::CancelRequested => self.cancel_requested = true,
            RunEvent::Completed => {
                if let Some(retry) = &self.retry {
                    return Err(Report::new(InvalidTransition::StepRetrying {
                        name: retry.name.clone(),
                    }));
                }
                self.phase = RunPhase::Completed;
            }
            RunEvent::Failed(failure) => self.phase = RunPhase::Failed(failure),
            RunEvent::Cancelled => {
                if !self.cancel_requested {
                    return Err(Report::new(InvalidTransition::CancelNotRequested));
                }
                self.phase = RunPhase::Cancelled;
            }
        }
        Ok(())
    }

    fn check_step(
        &self,
        index: StepIndex,
        name: &StepName,
    ) -> Result<(), Report<InvalidTransition>> {
        let expected = self.next_index();
        if index != expected {
            return Err(Report::new(InvalidTransition::UnexpectedIndex {
                expected,
                actual: index,
            }));
        }
        if let Some(retry) = &self.retry
            && retry.name != *name
        {
            return Err(Report::new(InvalidTransition::UnexpectedName {
                index,
                expected: retry.name.clone(),
                actual: name.clone(),
            }));
        }
        Ok(())
    }

    fn fail_step(
        &mut self,
        index: StepIndex,
        name: StepName,
        failure: StepFailure,
        at: UtcDateTime,
    ) {
        let failures = self.retry.take().map_or(NonZero::<u32>::MIN, |retry| {
            retry.failures.saturating_add(1)
        });

        if failure.kind == FailureKind::Permanent || failures >= self.start.policy.max_attempts {
            self.phase = RunPhase::Failed(RunFailure::Step {
                index,
                name,
                attempts: failures,
                code: failure.code,
            });
            return;
        }

        let delay = time::Duration::try_from(self.start.policy.delay(failures))
            .unwrap_or(time::Duration::MAX);
        self.retry = Some(Retry {
            name,
            failures,
            not_before: at.saturating_add(delay),
        });
        self.phase = RunPhase::Running;
    }
}

#[cfg(test)]
mod tests;
