//! Property tests for [`RunState`].
//!
//! The tests apply random sequences of step requests and events to a [`RunState`] and to a model
//! that recomputes every answer from the list of accepted events. After each action, both must
//! give the same decision, accept or reject the same event, and report the same state.

use core::{num::NonZero, time::Duration};

use hash_integrations_orchestration::{
    FailureCode, FailureKind, FunctionVersion, InvalidTransition, Payload, RetryPolicy, RunEvent,
    RunFailure, RunPhase, RunStart, RunState, StepDecision, StepFailure, StepIndex, StepName,
};
use proptest::{
    arbitrary::any,
    collection, prop_assert, prop_assert_eq, prop_oneof, property_test,
    sample::{Index, select},
    strategy::{Just, Strategy},
};
use proptest_derive::Arbitrary;
use time::{UtcDateTime, macros::utc_datetime};

const T0: UtcDateTime = utc_datetime!(2026-11-09 12:00);

const STEPS: [&str; 3] = ["capture", "plan", "deliver"];

#[derive(Debug, Clone, Arbitrary)]
enum Action {
    #[proptest(weight = 6)]
    Request {
        index: Index,
        #[proptest(strategy = "step()")]
        step: &'static str,
    },
    #[proptest(weight = 5)]
    Complete {
        index: Index,
        #[proptest(strategy = "step()")]
        step: &'static str,
    },
    #[proptest(weight = 4)]
    Fail {
        index: Index,
        #[proptest(strategy = "step()")]
        step: &'static str,
        #[proptest(strategy = "failure_kind()")]
        kind: FailureKind,
    },
    #[proptest(weight = 3)]
    Advance {
        #[proptest(strategy = "0..=120_u16")]
        seconds: u16,
    },
    CancelRequested,
    Completed,
    Failed,
    Cancelled,
}

fn step() -> impl Strategy<Value = &'static str> {
    select(&STEPS[..])
}

fn failure_kind() -> impl Strategy<Value = FailureKind> {
    prop_oneof![3 => Just(FailureKind::Retryable), 1 => Just(FailureKind::Permanent)]
}

fn policy() -> impl Strategy<Value = RetryPolicy> {
    (1..=4_u32, 0..=60_u64, 0..=300_u64, 1..=3_u16).prop_map(
        |(max_attempts, initial_delay, max_delay, multiplier)| RetryPolicy {
            max_attempts: NonZero::new(max_attempts).expect("the range should exclude zero"),
            initial_delay: Duration::from_secs(initial_delay),
            max_delay: Duration::from_secs(max_delay),
            multiplier: NonZero::new(multiplier).expect("the range should exclude zero"),
        },
    )
}

fn name(step: &str) -> StepName {
    step.parse().expect("should be a valid step name")
}

fn code() -> FailureCode {
    "graph-unavailable"
        .parse()
        .expect("should be a valid failure code")
}

fn output(index: StepIndex) -> Payload {
    Payload::encode(&index.get()).expect("should encode an integer")
}

/// The answer to a step request, comparable across [`RunState`] and [`Model`].
#[derive(Debug, PartialEq)]
enum Decision {
    Replay(Payload),
    Execute(u32, Option<UtcDateTime>),
    Cancel,
    Fail(RunFailure),
    Rejected(InvalidTransition),
}

impl Decision {
    fn of(state: &RunState, index: StepIndex, name: &StepName) -> Self {
        match state.decide(index, name) {
            Ok(StepDecision::Replay(output)) => Self::Replay(output.clone()),
            Ok(StepDecision::Execute {
                attempt,
                not_before,
            }) => Self::Execute(attempt.get(), not_before),
            Ok(StepDecision::Cancel) => Self::Cancel,
            Ok(StepDecision::Fail(failure)) => Self::Fail(failure),
            Err(report) => Self::Rejected(report.current_context().clone()),
        }
    }
}

struct Retry {
    name: StepName,
    failures: u32,
    not_before: UtcDateTime,
}

/// Recomputes a run from the full list of its accepted events.
struct Model {
    policy: RetryPolicy,
    events: Vec<RunEvent>,
}

impl Model {
    fn recorded(&self) -> Vec<(&StepName, &Payload)> {
        self.events
            .iter()
            .filter_map(|event| match event {
                RunEvent::StepCompleted { name, output, .. } => Some((name, output)),
                RunEvent::StepFailed { .. }
                | RunEvent::CancelRequested
                | RunEvent::Completed
                | RunEvent::Failed(_)
                | RunEvent::Cancelled => None,
            })
            .collect()
    }

    fn next_index(&self) -> StepIndex {
        StepIndex::new(u32::try_from(self.recorded().len()).expect("the count should fit"))
    }

    /// The failures of the next step, recorded after the last completed step.
    fn failures(&self) -> Vec<(&StepName, &StepFailure, UtcDateTime)> {
        let last_completion = self
            .events
            .iter()
            .rposition(|event| matches!(event, RunEvent::StepCompleted { .. }))
            .map_or(0, |position| position + 1);
        self.events
            .iter()
            .skip(last_completion)
            .filter_map(|event| match event {
                RunEvent::StepFailed {
                    name, failure, at, ..
                } => Some((name, failure, *at)),
                RunEvent::StepCompleted { .. }
                | RunEvent::CancelRequested
                | RunEvent::Completed
                | RunEvent::Failed(_)
                | RunEvent::Cancelled => None,
            })
            .collect()
    }

    fn step_failure(&self) -> Option<RunFailure> {
        let failures = self.failures();
        let (name, failure, _) = failures.last()?;
        let attempts = u32::try_from(failures.len()).expect("the count should fit");
        (failure.kind == FailureKind::Permanent || attempts >= self.policy.max_attempts.get()).then(
            || RunFailure::Step {
                index: self.next_index(),
                name: (*name).clone(),
                attempts: NonZero::new(attempts).expect("a failure should be recorded"),
                code: failure.code.clone(),
            },
        )
    }

    fn retry(&self) -> Option<Retry> {
        if self.step_failure().is_some() {
            return None;
        }
        let failures = self.failures();
        let (name, _, at) = failures.last()?;
        let count = NonZero::new(u32::try_from(failures.len()).expect("the count should fit"))
            .expect("a failure should be recorded");
        Some(Retry {
            name: (*name).clone(),
            failures: count.get(),
            not_before: *at + self.policy.delay(count),
        })
    }

    fn cancel_requested(&self) -> bool {
        self.events
            .iter()
            .any(|event| matches!(event, RunEvent::CancelRequested))
    }

    fn phase(&self) -> RunPhase {
        for event in &self.events {
            match event {
                RunEvent::Completed => return RunPhase::Completed,
                RunEvent::Failed(failure) => return RunPhase::Failed(failure.clone()),
                RunEvent::Cancelled => return RunPhase::Cancelled,
                RunEvent::StepCompleted { .. }
                | RunEvent::StepFailed { .. }
                | RunEvent::CancelRequested => {}
            }
        }
        if let Some(failure) = self.step_failure() {
            return RunPhase::Failed(failure);
        }
        let attempted = self.events.iter().any(|event| {
            matches!(
                event,
                RunEvent::StepCompleted { .. } | RunEvent::StepFailed { .. }
            )
        });
        if attempted {
            RunPhase::Running
        } else {
            RunPhase::Pending
        }
    }

    fn is_finished(&self) -> bool {
        matches!(
            self.phase(),
            RunPhase::Completed | RunPhase::Failed(_) | RunPhase::Cancelled
        )
    }

    fn check_step(&self, index: StepIndex, name: &StepName) -> Result<(), InvalidTransition> {
        let expected = self.next_index();
        if index != expected {
            return Err(InvalidTransition::UnexpectedIndex {
                expected,
                actual: index,
            });
        }
        match self.retry() {
            Some(retry) if retry.name != *name => Err(InvalidTransition::UnexpectedName {
                index,
                expected: retry.name,
                actual: name.clone(),
            }),
            _ => Ok(()),
        }
    }

    fn apply(&self, event: &RunEvent) -> Result<(), InvalidTransition> {
        if self.is_finished() {
            return Err(InvalidTransition::Finished);
        }
        match event {
            RunEvent::StepCompleted { index, name, .. }
            | RunEvent::StepFailed { index, name, .. } => self.check_step(*index, name),
            RunEvent::Completed => match self.retry() {
                Some(retry) => Err(InvalidTransition::StepRetrying { name: retry.name }),
                None => Ok(()),
            },
            RunEvent::Cancelled if !self.cancel_requested() => {
                Err(InvalidTransition::CancelNotRequested)
            }
            RunEvent::CancelRequested | RunEvent::Failed(_) | RunEvent::Cancelled => Ok(()),
        }
    }

    fn decide(&self, index: StepIndex, name: &StepName) -> Decision {
        if self.is_finished() {
            return Decision::Rejected(InvalidTransition::Finished);
        }
        let expected = self.next_index();
        if index > expected {
            return Decision::Rejected(InvalidTransition::UnexpectedIndex {
                expected,
                actual: index,
            });
        }

        let non_deterministic = |recorded: &StepName| {
            Decision::Fail(RunFailure::NonDeterministic {
                index,
                recorded: recorded.clone(),
                requested: name.clone(),
            })
        };
        if let Some((recorded, output)) = self.recorded().get(index.get() as usize) {
            return if *recorded == name {
                Decision::Replay((*output).clone())
            } else {
                non_deterministic(recorded)
            };
        }
        if self.cancel_requested() {
            return Decision::Cancel;
        }
        match self.retry() {
            None => Decision::Execute(1, None),
            Some(retry) if retry.name != *name => non_deterministic(&retry.name),
            Some(retry) => Decision::Execute(retry.failures + 1, Some(retry.not_before)),
        }
    }
}

#[property_test]
fn run_state_matches_model(
    #[strategy = policy()] policy: RetryPolicy,
    #[strategy = collection::vec(any::<Action>(), 0..64)] actions: Vec<Action>,
) -> Result<(), TestCaseError> {
    let mut state = RunState::new(RunStart {
        admission: "web/linear"
            .parse()
            .expect("should be a valid admission key"),
        version: FunctionVersion::new(1),
        policy,
        input: Payload::encode(&()).expect("should encode the input"),
    });
    let mut model = Model {
        policy,
        events: Vec::new(),
    };
    let mut now = T0;

    for action in actions {
        // An index up to one past the next step covers replays, the next step and a skipped step.
        let pick = |index: Index| {
            StepIndex::new(
                u32::try_from(index.index(model.recorded().len() + 2))
                    .expect("the index should fit"),
            )
        };

        let event = match action {
            Action::Request { index, step } => {
                let index = pick(index);
                let decision = Decision::of(&state, index, &name(step));

                if let Decision::Execute(attempt, _) = decision {
                    prop_assert!(
                        attempt <= policy.max_attempts.get(),
                        "attempt {attempt} should not exceed the maximum"
                    );
                    prop_assert!(
                        !state.cancel_requested(),
                        "no step should execute after a cancel request"
                    );
                }
                prop_assert_eq!(decision, model.decide(index, &name(step)));
                continue;
            }
            Action::Advance { seconds } => {
                now += Duration::from_secs(seconds.into());
                continue;
            }
            Action::Complete { index, step } => {
                let index = pick(index);
                RunEvent::StepCompleted {
                    index,
                    name: name(step),
                    output: output(index),
                }
            }
            Action::Fail { index, step, kind } => RunEvent::StepFailed {
                index: pick(index),
                name: name(step),
                failure: StepFailure { kind, code: code() },
                at: now,
            },
            Action::CancelRequested => RunEvent::CancelRequested,
            Action::Completed => RunEvent::Completed,
            Action::Failed => RunEvent::Failed(RunFailure::Function { code: code() }),
            Action::Cancelled => RunEvent::Cancelled,
        };

        let before = format!("{state:?}");
        let result = state
            .apply(event.clone())
            .map_err(|report| report.current_context().clone());
        prop_assert_eq!(&result, &model.apply(&event), "{:?}", event);
        if result.is_ok() {
            model.events.push(event);
        } else {
            prop_assert_eq!(
                format!("{state:?}"),
                before,
                "a rejected event should leave the state unchanged"
            );
        }

        prop_assert_eq!(state.phase(), &model.phase());
        prop_assert_eq!(state.next_index(), model.next_index());
        prop_assert_eq!(state.cancel_requested(), model.cancel_requested());
        prop_assert_eq!(
            state.retrying_step().cloned(),
            model.retry().map(|retry| retry.name)
        );
        if *state.phase() == RunPhase::Completed {
            prop_assert!(
                state.retrying_step().is_none(),
                "a completed run should have no step waiting for a retry"
            );
        }
    }
    Ok(())
}
