use alloc::{vec, vec::Vec};
use core::{num::NonZero, time::Duration};

use pretty_assertions::assert_eq;
use rstest::rstest;
use time::macros::utc_datetime;

use crate::{
    FailureCode, FailureKind, FunctionVersion, InvalidTransition, Payload, RetryPolicy, RunEvent,
    RunFailure, RunPhase, RunStart, RunState, StepDecision, StepFailure, StepIndex, StepName,
    Timestamp,
};

const T0: Timestamp = Timestamp::new(utc_datetime!(2026-11-09 12:00));

fn name(value: &str) -> StepName {
    value.parse().expect("should be a valid step name")
}

fn code() -> FailureCode {
    "graph-unavailable"
        .parse()
        .expect("should be a valid failure code")
}

fn payload(value: u32) -> Payload {
    Payload::encode(&value).expect("should encode an integer")
}

fn run() -> RunState {
    RunState::new(RunStart {
        admission: "web/connector"
            .parse()
            .expect("should be a valid admission key"),
        version: FunctionVersion::new(1),
        policy: RetryPolicy {
            max_attempts: NonZero::new(3).expect("three should be nonzero"),
            initial_delay: Duration::from_secs(30),
            max_delay: Duration::from_mins(10),
            multiplier: NonZero::new(2).expect("two should be nonzero"),
        },
        input: payload(0),
    })
}

fn completed(index: u32, step: &str) -> RunEvent {
    RunEvent::StepCompleted {
        index: StepIndex::new(index),
        name: name(step),
        output: payload(index),
    }
}

fn failed(index: u32, step: &str, kind: FailureKind, at: Timestamp) -> RunEvent {
    RunEvent::StepFailed {
        index: StepIndex::new(index),
        name: name(step),
        failure: StepFailure { kind, code: code() },
        at,
    }
}

fn decide<'state>(state: &'state RunState, index: u32, step: &str) -> StepDecision<'state> {
    state
        .decide(StepIndex::new(index), &name(step))
        .expect("the step request should follow the recorded events")
}

fn apply(state: &mut RunState, events: impl IntoIterator<Item = RunEvent>) {
    for event in events {
        state
            .apply(event)
            .expect("event should follow the recorded events");
    }
}

#[test]
fn decide_replays_recorded_step() {
    let mut state = run();
    apply(&mut state, [completed(0, "capture")]);

    let StepDecision::Replay(output) = decide(&state, 0, "capture") else {
        panic!("a recorded step should be replayed");
    };
    assert_eq!(output.decode::<u32>().expect("should decode the output"), 0);
}

#[rstest]
#[case::recorded(completed(0, "capture"))]
#[case::retrying(failed(0, "capture", FailureKind::Retryable, T0))]
fn decide_renamed_step(#[case] event: RunEvent) {
    let mut state = run();
    apply(&mut state, [event]);

    let StepDecision::Fail(failure) = decide(&state, 0, "plan") else {
        panic!("a renamed step should fail the run");
    };
    assert_eq!(
        failure,
        RunFailure::NonDeterministic {
            index: StepIndex::new(0),
            recorded: name("capture"),
            requested: name("plan"),
        }
    );
}

#[test]
fn step_failure_retries_until_max_attempts() {
    let mut state = run();
    let retry_at = T0.saturating_add(Duration::from_secs(30));
    apply(
        &mut state,
        [failed(0, "capture", FailureKind::Retryable, T0)],
    );

    assert!(matches!(
        decide(&state, 0, "capture"),
        StepDecision::Execute { attempt, not_before: Some(not_before) }
            if attempt.get() == 2 && not_before == retry_at
    ));

    apply(
        &mut state,
        [
            failed(0, "capture", FailureKind::Retryable, retry_at),
            failed(0, "capture", FailureKind::Retryable, retry_at),
        ],
    );
    assert_eq!(
        state.phase(),
        &RunPhase::Failed(RunFailure::Step {
            index: StepIndex::new(0),
            name: name("capture"),
            attempts: NonZero::new(3).expect("three should be nonzero"),
            code: code(),
        })
    );
}

#[test]
fn step_completed_after_retry() {
    let mut state = run();
    apply(
        &mut state,
        [
            failed(0, "capture", FailureKind::Retryable, T0),
            completed(0, "capture"),
        ],
    );

    assert_eq!(state.retrying_step(), None);
    assert!(
        matches!(
            decide(&state, 1, "plan"),
            StepDecision::Execute { attempt, not_before: None } if attempt.get() == 1
        ),
        "the next step should start counting attempts from one"
    );
}

#[test]
fn step_failure_permanent() {
    let mut state = run();
    apply(
        &mut state,
        [failed(0, "capture", FailureKind::Permanent, T0)],
    );

    assert!(
        matches!(
            state.phase(),
            RunPhase::Failed(RunFailure::Step { attempts, .. }) if attempts.get() == 1
        ),
        "a permanent failure should fail the run without another attempt"
    );
}

#[test]
fn cancel_pending_run() {
    let mut state = run();
    apply(&mut state, [RunEvent::CancelRequested]);

    assert_eq!(
        state.phase(),
        &RunPhase::Pending,
        "a worker may be executing the first step, so the run should stay active"
    );
    assert!(
        matches!(decide(&state, 0, "capture"), StepDecision::Cancel),
        "the first step request should cancel the run"
    );
}

#[test]
fn cancel_running_run() {
    let mut state = run();
    apply(
        &mut state,
        [completed(0, "capture"), RunEvent::CancelRequested],
    );

    assert!(
        matches!(decide(&state, 0, "capture"), StepDecision::Replay(_)),
        "recorded steps should still replay"
    );
    assert!(
        matches!(decide(&state, 1, "plan"), StepDecision::Cancel),
        "no new step should start after a cancel request"
    );

    apply(&mut state, [RunEvent::Cancelled]);
    assert_eq!(state.phase(), &RunPhase::Cancelled);
}

#[rstest]
#[case::finished(
    vec![completed(0, "capture"), RunEvent::Completed],
    completed(1, "plan"),
    InvalidTransition::Finished,
)]
#[case::skipped_step(
    vec![completed(0, "capture")],
    completed(2, "plan"),
    InvalidTransition::UnexpectedIndex { expected: StepIndex::new(1), actual: StepIndex::new(2) },
)]
#[case::renamed_retry(
    vec![failed(0, "capture", FailureKind::Retryable, T0)],
    completed(0, "plan"),
    InvalidTransition::UnexpectedName {
        index: StepIndex::new(0),
        expected: name("capture"),
        actual: name("plan"),
    },
)]
#[case::cancelled_without_request(
    vec![completed(0, "capture")],
    RunEvent::Cancelled,
    InvalidTransition::CancelNotRequested,
)]
#[case::completed_while_retrying(
    vec![failed(0, "capture", FailureKind::Retryable, T0)],
    RunEvent::Completed,
    InvalidTransition::StepRetrying { name: name("capture") },
)]
fn apply_invalid_event(
    #[case] recorded: Vec<RunEvent>,
    #[case] event: RunEvent,
    #[case] expected: InvalidTransition,
) {
    let mut state = run();
    apply(&mut state, recorded);

    let report = state
        .apply(event)
        .expect_err("the event should be rejected");
    assert_eq!(*report.current_context(), expected);
}

#[rstest]
#[case::finished(
    vec![completed(0, "capture"), RunEvent::Completed],
    1,
    InvalidTransition::Finished,
)]
#[case::skipped_step(
    vec![completed(0, "capture")],
    2,
    InvalidTransition::UnexpectedIndex { expected: StepIndex::new(1), actual: StepIndex::new(2) },
)]
fn decide_invalid_request(
    #[case] recorded: Vec<RunEvent>,
    #[case] index: u32,
    #[case] expected: InvalidTransition,
) {
    let mut state = run();
    apply(&mut state, recorded);

    let report = state
        .decide(StepIndex::new(index), &name("plan"))
        .expect_err("the step request should be rejected");
    assert_eq!(*report.current_context(), expected);
}
