//! Runs generated schedules against the command loop.
//!
//! A [`SchedulePlan`] specifies actions, append outcomes, and a seed for journal sequence gaps.
//! Actions submit events, execute effects, save or corrupt snapshots, and crash or recover the
//! shard. Each run finishes by executing pending effects until none remain.
//!
//! Expected state is rebuilt directly from journal bytes. A separate ledger records external
//! executions, including repeats. Checks in [`crate::properties`] compare these with the
//! command loop’s state. Property-based tests shrink failing schedules. Seeded tests also check
//! that the schedules exercise each failure case.

mod check;
mod driver;
mod faults;
mod model;
mod plan;
mod run;
#[cfg(test)]
mod tests;

use alloc::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};

pub use self::{
    model::{DstCounters, DstDomain, DstEffect, DstEvent},
    plan::{PlannedAction, ScheduleCoverage, SchedulePlan, derive_plan},
    run::{ScheduleReport, run_plan},
};
use super::SimLogHandle;
use crate::{
    domain::{EventRecordV1, Hosted},
    ids::{EffectId, EventId},
    registry::RecordRegistry,
    shard_log::{ShardCommandHandle, StartedShard},
};

type DstHandle = ShardCommandHandle<Hosted<DstDomain>>;
type DstStarted = StartedShard<Hosted<DstDomain>>;

/// Identifies the source of a submission. Only a `Completion` can be rejected, because state can
/// change after its effect is planned.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SubmitKind {
    Fresh,
    Duplicate,
    Completion,
}

/// Holds the expected state, rebuilt from journal bytes. Events are decoded, deduplicated, and
/// applied to maps by code separate from the application’s [`Fold`] implementation.
#[derive(Debug, Default)]
struct ReferenceState {
    totals: BTreeMap<String, u64>,
    archives: BTreeMap<String, u64>,
    event_ids: BTreeSet<EventId>,
    /// The durable completions to match against external executions.
    archive_events: Vec<DstEffect>,
}

struct Driver<'a> {
    journal: SimLogHandle,
    registry: Arc<RecordRegistry>,
    shard: crate::routing::Shard,
    /// All counters must route to `shard`.
    counters: Vec<String>,
    started: DstStarted,
    /// Includes both `Applied` and `AlreadyDurable` outcomes.
    acknowledged: Vec<EventRecordV1<DstEvent>>,
    /// Includes only `Applied` outcomes.
    applied: BTreeSet<EventId>,
    rejected: BTreeSet<EventId>,
    /// Records every external execution under its effect ID, including repeats.
    executions: BTreeMap<EffectId, Vec<Vec<u8>>>,
    proposed: BTreeSet<EventId>,
    /// Allows one executor iteration per scheduled append outcome, plus the iterations needed
    /// to finish successful effects.
    effect_round_limit: u32,
    last_durable_end: u64,
    next_request: u64,
    /// The caller owns the trace, so it survives a panic during the schedule.
    trace: &'a mut Vec<String>,
}
