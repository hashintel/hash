use core::panic::AssertUnwindSafe;

use proptest::{
    arbitrary::any,
    prop_oneof, proptest,
    strategy::{Just, Strategy},
};

use super::{PlannedAction, ScheduleCoverage, SchedulePlan, ScheduleReport, derive_plan, run_plan};
use crate::sim::{AppendOutcomeWeights, SimAppendOutcome};

const SCHEDULE_SEED_BASE: u64 = 0x5EED_0000_0000_0000;
const DEFAULT_SCHEDULES: u64 = 256;

fn run_one(
    plan: &SchedulePlan,
    coverage: &mut ScheduleCoverage,
) -> (Vec<String>, std::thread::Result<ScheduleReport>) {
    let mut trace = Vec::new();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("current-thread runtime should build");
    let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
        runtime.block_on(run_plan(plan, coverage, &mut trace))
    }));
    (trace, result)
}

fn action_strategy() -> impl Strategy<Value = PlannedAction> {
    prop_oneof![
        5 => (0_u8..3, 1_u64..=9).prop_map(|(counter, amount)| {
            PlannedAction::SubmitFresh { counter, amount }
        }),
        2 => any::<u8>().prop_map(|index| PlannedAction::SubmitDuplicate { index }),
        1 => Just(PlannedAction::SubmitInvalid),
        2 => Just(PlannedAction::EffectTurn),
        1 => Just(PlannedAction::SnapshotCommit),
        1 => Just(PlannedAction::CorruptLatestSnapshot),
        1 => Just(PlannedAction::CrashAndRecover),
        1 => (0_u8..3, 1_u64..=9).prop_map(|(counter, amount)| {
            PlannedAction::CrashBeforeAppendReply { counter, amount }
        }),
        2 => Just(PlannedAction::FinishEffectsAndCheck),
    ]
}

fn outcome_strategy() -> impl Strategy<Value = SimAppendOutcome> {
    prop_oneof![
        15 => Just(SimAppendOutcome::AckDurable),
        2 => Just(SimAppendOutcome::DefinitelyNotCommitted),
        1 => Just(SimAppendOutcome::CommitUnknownDurable),
        1 => Just(SimAppendOutcome::CommitUnknownLost),
        1 => Just(SimAppendOutcome::Fenced),
    ]
}

fn plan_strategy() -> impl Strategy<Value = SchedulePlan> {
    (
        proptest::collection::vec(action_strategy(), 1..48),
        proptest::collection::vec(outcome_strategy(), 0..256),
        any::<u64>(),
    )
        .prop_map(|(actions, outcomes, gap_seed)| SchedulePlan {
            actions,
            outcomes,
            gap_seed,
        })
}

proptest! {
    #[test]
    fn safety_properties_hold_on_generated_schedules(plan in plan_strategy()) {
        let mut coverage = ScheduleCoverage::new();
        let mut trace = Vec::new();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("current-thread runtime should build");
        runtime.block_on(run_plan(&plan, &mut coverage, &mut trace));
    }
}

/// Checks safety on each schedule and coverage across all schedules.
///
/// Set `INTEGRATIONS_DST_SEED` to replay one schedule with a trace.
/// `INTEGRATIONS_DST_SCHEDULES` sets the number of schedules to run.
#[test]
fn seeded_schedules_cover_every_failure_window() {
    if let Ok(replay) = std::env::var("INTEGRATIONS_DST_SEED") {
        let seed = replay
            .parse::<u64>()
            .expect("INTEGRATIONS_DST_SEED should be a u64");
        let plan = derive_plan(seed, AppendOutcomeWeights::DEFAULT);
        let mut coverage = ScheduleCoverage::new();
        let (trace, result) = run_one(&plan, &mut coverage);
        for line in &trace {
            eprintln!("{line}");
        }
        match result {
            Ok(report) => eprintln!("{report:?}"),
            Err(panic) => std::panic::resume_unwind(panic),
        }
        return;
    }

    let schedules = std::env::var("INTEGRATIONS_DST_SCHEDULES")
        .ok()
        .and_then(|count| count.parse::<u64>().ok())
        .unwrap_or(DEFAULT_SCHEDULES);
    let mut coverage = ScheduleCoverage::new();
    for index in 0..schedules {
        let seed = SCHEDULE_SEED_BASE + index;
        let plan = derive_plan(seed, AppendOutcomeWeights::DEFAULT);
        let (trace, result) = run_one(&plan, &mut coverage);
        if let Err(panic) = result {
            eprintln!("schedule violated a property; replay with INTEGRATIONS_DST_SEED={seed}");
            for line in &trace {
                eprintln!("{line}");
            }
            std::panic::resume_unwind(panic);
        }
    }
    let missing = coverage
        .missing()
        .into_iter()
        .map(|property| property.id)
        .collect::<Vec<_>>();
    assert!(
        missing.is_empty(),
        "coverage properties should occur across {schedules} schedules; missing: {missing:?}"
    );
}

#[test]
fn identical_plans_replay_identical_schedules() {
    let plan = derive_plan(42, AppendOutcomeWeights::DEFAULT);
    let mut first_coverage = ScheduleCoverage::new();
    let mut second_coverage = ScheduleCoverage::new();
    let (first_trace, first) = run_one(&plan, &mut first_coverage);
    let (second_trace, second) = run_one(&plan, &mut second_coverage);
    let first = first.expect("plan 42 should complete");
    let second = second.expect("plan 42 should complete");
    assert_eq!(first_trace, second_trace);
    assert_eq!(first.acknowledged_events, second.acknowledged_events);
    assert_eq!(first.durable_events, second.durable_events);
    assert_eq!(first.effect_executions, second.effect_executions);
}
