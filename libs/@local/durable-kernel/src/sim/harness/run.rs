use alloc::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};

use super::{Driver, PlannedAction, ScheduleCoverage, SchedulePlan, SubmitKind};
use crate::{
    domain::{self, EventRecordV1, PartitionKey},
    registry::RecordRegistry,
    sim::SimLogHandle,
};

/// Limits the executor iterations used to check that pending effects eventually finish.
const EFFECT_ROUND_LIMIT: u32 = 8;

/// Chooses three counter names that route to the same shard. The anchor name fixes the shard.
/// Candidates are checked in order.
fn shared_shard_counters() -> (crate::routing::Shard, Vec<String>) {
    let anchor =
        PartitionKey::parse("alpha").expect("anchor counter should be a valid partition key");
    let shard = domain::shard_of(&anchor);
    let mut counters = vec!["alpha".to_owned()];
    for candidate in 0_u32.. {
        if counters.len() == 3 {
            break;
        }
        let name = format!("counter-{candidate}");
        let key =
            PartitionKey::parse(&name).expect("candidate counter should be a valid partition key");
        if domain::shard_of(&key) == shard {
            counters.push(name);
        }
    }
    (shard, counters)
}

#[derive(Debug)]
pub struct ScheduleReport {
    pub steps: usize,
    pub acknowledged_events: usize,
    pub durable_events: usize,
    pub effect_executions: usize,
}

/// Runs a schedule and checks state, durability, and external executions.
///
/// The caller retains the action trace if a check fails. Replay using the shrunk plan from a
/// property test or the seed from a seeded test.
///
/// # Panics
///
/// Panics if a safety check fails or the simulation cannot perform a scheduled action.
pub async fn run_plan(
    plan: &SchedulePlan,
    coverage: &mut ScheduleCoverage,
    trace: &mut Vec<String>,
) -> ScheduleReport {
    let registry = Arc::new(RecordRegistry::default());
    let journal = SimLogHandle::new(plan.gap_seed, plan.outcomes.clone());
    let (shard, counters) = shared_shard_counters();

    let mut driver = Driver {
        started: Driver::open_loop(&journal, shard, Arc::clone(&registry)).await,
        journal,
        registry,
        shard,
        counters,
        acknowledged: Vec::new(),
        applied: BTreeSet::new(),
        rejected: BTreeSet::new(),
        executions: BTreeMap::new(),
        proposed: BTreeSet::new(),
        effect_round_limit: EFFECT_ROUND_LIMIT
            + u32::try_from(plan.outcomes.len()).unwrap_or(u32::MAX),
        last_durable_end: 0,
        next_request: 0,
        trace,
    };

    for (step, action) in plan.actions.iter().enumerate() {
        match action {
            PlannedAction::SubmitFresh { counter, amount } => {
                let event = driver.fresh_event(*counter, *amount);
                driver.trace.push(format!("{step}: submit {event:?}"));
                let record = EventRecordV1::new(event).expect("fresh event should encode");
                driver.submit(record, SubmitKind::Fresh, coverage).await;
            }
            PlannedAction::SubmitDuplicate { index } => {
                if driver.acknowledged.is_empty() {
                    driver
                        .trace
                        .push(format!("{step}: duplicate skipped (none acknowledged)"));
                    continue;
                }
                let position = usize::from(*index)
                    .checked_rem(driver.acknowledged.len())
                    .expect("acknowledged events should be nonempty");
                let record = driver
                    .acknowledged
                    .get(position)
                    .expect("duplicate index should be in bounds")
                    .clone();
                driver
                    .trace
                    .push(format!("{step}: duplicate {}", record.event_id()));
                driver.submit(record, SubmitKind::Duplicate, coverage).await;
            }
            PlannedAction::SubmitInvalid => {
                driver.trace.push(format!("{step}: submit invalid"));
                driver.submit_invalid(coverage).await;
            }
            PlannedAction::EffectTurn => {
                driver.trace.push(format!("{step}: effect turn"));
                driver.effect_turn(coverage).await;
            }
            PlannedAction::SnapshotCommit => {
                driver.trace.push(format!("{step}: snapshot commit"));
                driver.snapshot_commit(step, coverage).await;
            }
            PlannedAction::CorruptLatestSnapshot => {
                let corrupted = driver.journal.corrupt_latest_snapshot();
                driver
                    .trace
                    .push(format!("{step}: corrupt latest snapshot ({corrupted})"));
            }
            PlannedAction::CrashAndRecover => {
                driver.trace.push(format!("{step}: crash and recover"));
                driver.crash_and_recover(coverage).await;
            }
            PlannedAction::CrashBeforeAppendReply { counter, amount } => {
                driver
                    .trace
                    .push(format!("{step}: crash before append reply"));
                driver
                    .crash_before_append_reply(*counter, *amount, coverage)
                    .await;
            }
            PlannedAction::FinishEffectsAndCheck => {
                driver
                    .trace
                    .push(format!("{step}: finish effects and check"));
                driver.finish_effects_and_check(coverage).await;
            }
        }
    }
    driver
        .trace
        .push("finish remaining effects and check".into());
    driver.finish_effects_and_check(coverage).await;
    driver.started.task.abort();

    ScheduleReport {
        steps: plan.actions.len(),
        acknowledged_events: driver.acknowledged.len(),
        durable_events: driver.reference_fold().event_ids.len(),
        effect_executions: driver.executions.values().map(Vec::len).sum(),
    }
}
