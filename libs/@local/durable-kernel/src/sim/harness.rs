//! Runs generated schedules against the command loop.
//!
//! A [`SchedulePlan`] specifies actions, append outcomes, and a seed for journal sequence gaps.
//! Actions submit events, execute effects, save or corrupt snapshots, and crash or recover the
//! shard. Each run finishes by executing pending effects until none remain.
//!
//! Expected state is rebuilt directly from journal bytes. A separate ledger records external
//! executions, including repeats. Checks in [`crate::properties`] compare these with the
//! command loop’s state. Property-based tests shrink failing schedules; seeded tests also check
//! that the schedules exercise each failure case.

use alloc::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};

use serde::{Deserialize, Serialize};

use super::{DispositionWeights, SimAppendOutcome, SimKey, SimLogHandle, SplitMix64};
use crate::{
    domain::{
        self, DomainEvent, EventRecord, EventRecordV1, Fold, Hosted, PartitionKey, SimpleDomain,
        effect_id,
    },
    ids::EventId,
    properties::{self, CoverageSink, Property, PropertyClass},
    registry::{DurableRecord as _, VersionedRecord as _},
    shard_log::{
        OpenedShard, ShardCommandConfig, ShardCommandErrorKind, ShardCommandHandle,
        ShardCommandOutcome, ShardLogLocation, StartedShard,
    },
};

const ARCHIVE_THRESHOLD: u64 = 10;

/// Limits the executor iterations used to check that pending effects eventually finish.
const FIXPOINT_TURN_BOUND: u32 = 8;

/// Counter events used by the simulation.
///
/// Each increment has a request number so equal increments can be distinct events. Zero
/// increments are rejected. Archive events include the cycle number to distinguish repeated
/// archives of the same total.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum DstEvent {
    Increment {
        counter: String,
        amount: u64,
        request: u64,
    },
    Archive {
        counter: String,
        upto: u64,
        cycle: u64,
    },
}

impl DstEvent {
    fn counter(&self) -> &str {
        match self {
            Self::Increment { counter, .. } | Self::Archive { counter, .. } => counter,
        }
    }
}

impl DomainEvent for DstEvent {
    fn name() -> &'static str {
        "dst_counter_event"
    }

    fn partition(&self) -> PartitionKey {
        PartitionKey::parse(self.counter())
            .expect("simulation counters should be valid partition keys")
    }
}

/// Tracks totals and completed archive cycles. Archiving resets a counter’s total and advances
/// its cycle number.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct DstCounters {
    pub totals: BTreeMap<String, u64>,
    pub archives: BTreeMap<String, u64>,
}

impl DstCounters {
    fn total(&self, counter: &str) -> u64 {
        self.totals.get(counter).copied().unwrap_or(0)
    }

    fn cycle(&self, counter: &str) -> u64 {
        self.archives.get(counter).copied().unwrap_or(0)
    }
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum CounterRejection {
    #[display("amount must be positive")]
    ZeroIncrement,
    #[display("archive completion for {counter} is stale")]
    StaleArchive { counter: String },
}

impl Fold<DstEvent> for DstCounters {
    type Rejection = CounterRejection;

    fn validate(&self, event: &DstEvent) -> Result<(), error_stack::Report<Self::Rejection>> {
        match event {
            DstEvent::Increment { amount, .. } => {
                if *amount == 0 {
                    return Err(error_stack::Report::new(CounterRejection::ZeroIncrement));
                }
                Ok(())
            }
            DstEvent::Archive {
                counter,
                upto,
                cycle,
            } => {
                if *upto != self.total(counter) || *cycle != self.cycle(counter) {
                    return Err(error_stack::Report::new(CounterRejection::StaleArchive {
                        counter: counter.clone(),
                    }));
                }
                Ok(())
            }
        }
    }

    fn apply(&mut self, event: &DstEvent) {
        match event {
            DstEvent::Increment {
                counter, amount, ..
            } => {
                *self.totals.entry(counter.clone()).or_insert(0) += amount;
            }
            DstEvent::Archive { counter, .. } => {
                self.totals.insert(counter.clone(), 0);
                *self.archives.entry(counter.clone()).or_insert(0) += 1;
            }
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct DstDomain;

impl SimpleDomain for DstDomain {
    type Event = DstEvent;
    type Projection = DstCounters;
}

/// Archives a counter at a specific total and cycle. Its serialized contents determine its
/// effect ID.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DstEffect {
    pub counter: String,
    pub upto: u64,
    pub cycle: u64,
}

/// Plans an archive for each counter at or above the threshold. Applying the completion resets
/// the total, which removes the effect from the next plan.
fn plan_effects(projection: &DstCounters) -> Vec<DstEffect> {
    projection
        .totals
        .iter()
        .filter(|(_counter, total)| **total >= ARCHIVE_THRESHOLD)
        .map(|(counter, total)| DstEffect {
            counter: counter.clone(),
            upto: *total,
            cycle: projection.cycle(counter),
        })
        .collect()
}

type DstHandle = ShardCommandHandle<Hosted<DstDomain>>;
type DstStarted = StartedShard<Hosted<DstDomain>>;

/// Records which failure cases occurred across a set of schedules.
#[derive(Debug, Default)]
pub struct CoverageLedger {
    observed: BTreeSet<&'static str>,
}

impl CoverageLedger {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns coverage properties that have not occurred.
    #[must_use]
    pub fn missing(&self) -> Vec<&'static Property> {
        properties::CATALOG
            .iter()
            .filter(|property| {
                property.class == PropertyClass::Coverage && !self.observed.contains(property.id)
            })
            .collect()
    }
}

impl CoverageSink for CoverageLedger {
    fn observe(&mut self, property: &Property) {
        self.observed.insert(property.id);
    }
}

/// An action in a schedule. Indices are reduced modulo the available items at execution time,
/// so removing earlier actions during shrinking keeps later indices valid.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlannedAction {
    SubmitFresh { counter: u8, amount: u64 },
    SubmitDuplicate { index: u8 },
    SubmitInvalid,
    EffectTurn,
    SnapshotCommit,
    CorruptLatestSnapshot,
    CrashAndRecover,
    CrashMidAmbiguity { counter: u8, amount: u64 },
    QuiesceAndCheck,
}

/// The actions, journal outcomes, and sequence seed needed to reproduce a test run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SchedulePlan {
    pub actions: Vec<PlannedAction>,
    pub dispositions: Vec<SimAppendOutcome>,
    pub gap_seed: u64,
}

/// Builds a schedule from a seed. Set `INTEGRATIONS_DST_SEED` to replay it.
///
/// # Panics
///
/// Panics if a generated action count or index cannot fit its destination type.
#[must_use]
/// # Panics
///
/// Panics if a generated action count or index cannot fit its destination type.
pub fn derive_plan(seed: u64, weights: DispositionWeights) -> SchedulePlan {
    let mut rng = SplitMix64::new(seed);
    let step_count = rng.between(24, 64);
    let mut actions =
        Vec::with_capacity(usize::try_from(step_count).expect("step count should fit in usize"));
    for _step in 0..step_count {
        actions.push(match rng.below(100) {
            0..=34 => PlannedAction::SubmitFresh {
                counter: u8::try_from(rng.below(3)).expect("counter index should fit in u8"),
                amount: rng.between(1, 9),
            },
            35..=46 => PlannedAction::SubmitDuplicate {
                index: u8::try_from(rng.below(u64::from(u8::MAX)))
                    .expect("duplicate index should fit in u8"),
            },
            47..=53 => PlannedAction::SubmitInvalid,
            54..=68 => PlannedAction::EffectTurn,
            69..=76 => PlannedAction::SnapshotCommit,
            77..=80 => PlannedAction::CorruptLatestSnapshot,
            81..=88 => PlannedAction::CrashAndRecover,
            89..=92 => PlannedAction::CrashMidAmbiguity {
                counter: u8::try_from(rng.below(3)).expect("counter index should fit in u8"),
                amount: rng.between(1, 9),
            },
            _ => PlannedAction::QuiesceAndCheck,
        });
    }
    // One action can append several times during retries or recovery. After the supplied
    // outcomes run out, further appends succeed.
    let dispositions = core::iter::repeat_with(|| weights.draw(&mut rng))
        .take(actions.len() * 8)
        .collect();
    SchedulePlan {
        actions,
        dispositions,
        gap_seed: rng.next_u64(),
    }
}

/// Chooses three counter names that route to the same shard. The anchor name fixes the shard;
/// candidates are checked in order.
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

/// Distinguishes new events, duplicates, and effect completions.
///
/// New events and duplicates should be accepted. A completion may be rejected if state changed
/// after the effect was planned.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SubmitKind {
    Fresh,
    Duplicate,
    Completion,
}

/// Expected state rebuilt from journal bytes. Events are decoded, deduplicated, and applied to
/// maps using a separate implementation from the application’s [`Fold`].
#[derive(Debug, Default)]
struct ReferenceState {
    totals: BTreeMap<String, u64>,
    archives: BTreeMap<String, u64>,
    event_ids: BTreeSet<EventId>,
    /// Durable archive completions, for the completion-implies-executed
    /// check against the external ledger.
    archive_events: Vec<DstEffect>,
}

struct Driver<'a> {
    journal: SimLogHandle,
    shard: crate::routing::Shard,
    /// Counter names that all route to `shard`. One journal represents one
    /// shard, so every simulated partition must live there.
    counters: Vec<String>,
    started: DstStarted,
    /// Every record acknowledged as Applied or `AlreadyDurable`. This history
    /// supports duplicate replay and the acknowledged-implies-durable check.
    acknowledged: Vec<EventRecordV1<DstEvent>>,
    /// Event identities acknowledged `Applied`, to prove at-most-once.
    applied: BTreeSet<EventId>,
    /// Event identities the fold rejected. They must never become durable.
    rejected: BTreeSet<EventId>,
    /// Records every external execution under its effect ID, including repeats.
    executions: BTreeMap<String, Vec<Vec<u8>>>,
    /// Every event identity ever proposed to the loop, for the
    /// durable-events-have-provenance check.
    proposed: BTreeSet<EventId>,
    /// Allows one executor iteration per scheduled append outcome, plus the iterations needed
    /// to finish successful effects.
    fixpoint_turn_bound: u32,
    last_durable_end: u64,
    next_request: u64,
    /// Caller-owned so a mid-schedule panic still leaves the full trace.
    trace: &'a mut Vec<String>,
}

impl Driver<'_> {
    async fn open_loop(journal: &SimLogHandle, shard: crate::routing::Shard) -> DstStarted {
        Self::open_loop_with_harness(journal, shard, crate::shard_log::TestHarness::default()).await
    }

    async fn open_loop_with_harness(
        journal: &SimLogHandle,
        shard: crate::routing::Shard,
        harness: crate::shard_log::TestHarness,
    ) -> DstStarted {
        let location = ShardLogLocation::simulated(shard, journal.clone());
        let opened = OpenedShard::open(location)
            .await
            .expect("simulated shard should open");
        let recovered = opened
            .recover_with_snapshots::<Hosted<DstDomain>>(&())
            .await
            .expect("simulated shard should recover");
        recovered.enable_with_harness(ShardCommandConfig::default().allow_local_reopen(), harness)
    }

    fn handle(&self) -> DstHandle {
        self.started.handle.clone()
    }

    /// Records whether recovery used a snapshot or skipped a corrupt snapshot.
    fn observe_recovery(&self, coverage: &mut CoverageLedger) {
        properties::covered(
            coverage,
            &properties::RECOVERY_BOUNDED_BY_SNAPSHOT,
            self.started
                .recovery
                .snapshot_through_log_sequence
                .is_some(),
        );
        properties::covered(
            coverage,
            &properties::CORRUPT_SNAPSHOT_FELL_BACK,
            self.journal.latest_snapshot_is_corrupt(),
        );
    }

    fn fresh_event(&mut self, counter: u8, amount: u64) -> DstEvent {
        let index = usize::from(counter)
            .checked_rem(self.counters.len())
            .expect("simulation counters should be nonempty");
        self.next_request += 1;
        DstEvent::Increment {
            counter: self
                .counters
                .get(index)
                .expect("counter index should be in bounds")
                .clone(),
            amount: amount.clamp(1, 9),
            request: self.next_request,
        }
    }

    /// Submits a record and checks the acknowledgement. Terminal errors trigger a restart so
    /// the remaining schedule can run.
    async fn submit(
        &mut self,
        record: EventRecordV1<DstEvent>,
        kind: SubmitKind,
        coverage: &mut CoverageLedger,
    ) {
        self.proposed.insert(record.event_id.clone());
        let outcome_index = self.journal.outcomes_drawn();
        let result = self.handle().propose(record.clone()).await;
        let window = self.journal.outcomes_since(outcome_index);
        match result {
            Ok(ShardCommandOutcome::Applied { event_id, .. }) => {
                properties::check(
                    &properties::EVENT_ACKED_APPLIED_ONCE,
                    !self.applied.contains(&event_id),
                    format_args!("event {event_id} acknowledged Applied twice"),
                );
                properties::check(
                    &properties::EVENT_ACKED_APPLIED_ONCE,
                    kind != SubmitKind::Duplicate,
                    format_args!("duplicate submission of {event_id} acknowledged Applied"),
                );
                self.applied.insert(event_id);
                self.acknowledged.push(record);
                properties::covered(
                    coverage,
                    &properties::RETRIED_AMBIGUOUS_LOST_APPEND,
                    window.contains(&SimAppendOutcome::CommitUnknownLost),
                );
            }
            Ok(ShardCommandOutcome::AlreadyDurable { .. }) => {
                self.acknowledged.push(record);
                properties::covered(
                    coverage,
                    &properties::DUPLICATE_SUBMISSION_ABSORBED,
                    kind == SubmitKind::Duplicate,
                );
                properties::covered(
                    coverage,
                    &properties::ADOPTED_AMBIGUOUS_DURABLE_APPEND,
                    kind != SubmitKind::Duplicate
                        && window.contains(&SimAppendOutcome::CommitUnknownDurable),
                );
            }
            Ok(ShardCommandOutcome::Rejected { rejection }) => {
                assert!(
                    kind == SubmitKind::Completion,
                    "only an effect completion should be rejected: {kind:?}: {rejection}"
                );
                self.rejected.insert(record.event_id);
            }
            Err(error) => match error.kind {
                ShardCommandErrorKind::InvalidCandidate => {
                    panic!("proposal validation should return a typed rejection: {error}")
                }
                ShardCommandErrorKind::DefinitelyNotCommitted => {}
                ShardCommandErrorKind::Fenced
                | ShardCommandErrorKind::CommitUnknown
                | ShardCommandErrorKind::Recovery
                | ShardCommandErrorKind::Closed => {
                    properties::covered(
                        coverage,
                        &properties::WRITER_FENCED,
                        error.kind == ShardCommandErrorKind::Fenced,
                    );
                    self.trace
                        .push(format!("loop terminal ({:?}); reopening", error.kind));
                    self.crash_and_recover(coverage).await;
                }
            },
        }
    }

    async fn submit_invalid(&mut self, coverage: &mut CoverageLedger) {
        self.next_request += 1;
        let event = DstEvent::Increment {
            counter: self
                .counters
                .first()
                .expect("simulation counters should be nonempty")
                .clone(),
            amount: 0,
            request: self.next_request,
        };
        let record = EventRecordV1::new(event).expect("invalid-amount event should encode");
        let event_id = record.event_id.clone();
        self.proposed.insert(event_id.clone());
        match self.handle().propose(record).await {
            Ok(ShardCommandOutcome::Rejected { .. }) => {
                self.rejected.insert(event_id);
            }
            Err(_terminal) => {
                self.trace.push("invalid submit hit terminal loop".into());
                self.crash_and_recover(coverage).await;
            }
            Ok(outcome) => panic!("fold should reject a zero amount, got {outcome:?}"),
        }
    }

    /// Reads the projection through the loop, reopening it first when a
    /// prior action left it terminal.
    async fn read_projection(&mut self, coverage: &mut CoverageLedger) -> DstCounters {
        if let Ok(projection) = self
            .handle()
            .read(|projection| projection.domain().clone())
            .await
        {
            return projection;
        }
        self.trace
            .push("read found terminal loop; reopening".into());
        self.crash_and_recover(coverage).await;
        self.handle()
            .read(|projection| projection.domain().clone())
            .await
            .expect("freshly recovered loop should serve reads")
    }

    /// Plans effects from the current state, records each execution, and submits completion
    /// events. Returns the number of effects planned.
    async fn effect_turn(&mut self, coverage: &mut CoverageLedger) -> usize {
        let projection = self.read_projection(coverage).await;
        let effects = plan_effects(&projection);
        for effect in &effects {
            let identity = effect_id(effect).expect("effect should serialize");
            let payload = serde_json::to_vec(effect).expect("effect should serialize");
            let executions = self.executions.entry(identity.clone()).or_default();
            if let Some(previous) = executions.first() {
                properties::check(
                    &properties::EFFECT_REPLAYS_ARE_IDENTICAL,
                    *previous == payload,
                    format_args!("effect {identity} replayed with different payload"),
                );
            }
            executions.push(payload);
            properties::covered(
                coverage,
                &properties::EFFECT_EXECUTED_MORE_THAN_ONCE,
                self.executions
                    .get(&identity)
                    .expect("effect execution should have been recorded")
                    .len()
                    > 1,
            );

            let completion = DstEvent::Archive {
                counter: effect.counter.clone(),
                upto: effect.upto,
                cycle: effect.cycle,
            };
            let record = EventRecordV1::new(completion).expect("completion event should encode");
            self.trace.push(format!(
                "execute archive {}@{}",
                effect.counter, effect.upto
            ));
            self.submit(record, SubmitKind::Completion, coverage).await;
        }
        effects.len()
    }

    /// Saves a snapshot through the command loop. Its append consumes a scheduled journal
    /// outcome.
    async fn snapshot_commit(&mut self, step: usize, coverage: &mut CoverageLedger) {
        let capture = match self.handle().capture_snapshot(1).await {
            Ok(capture) => capture,
            Err(_terminal) => {
                self.trace.push("capture hit terminal loop".into());
                self.crash_and_recover(coverage).await;
                return;
            }
        };
        let Some(payload) = capture else {
            self.trace.push("snapshot span not worth capturing".into());
            return;
        };
        let snapshot = payload.into_record(format!("sim-step-{step}"));
        match self.handle().commit_snapshot(snapshot).await {
            Ok(_sequence) => {}
            Err(error)
                if matches!(
                    error.kind,
                    ShardCommandErrorKind::Fenced
                        | ShardCommandErrorKind::CommitUnknown
                        | ShardCommandErrorKind::Recovery
                        | ShardCommandErrorKind::Closed
                ) =>
            {
                self.trace
                    .push(format!("snapshot commit terminal ({:?})", error.kind));
                self.crash_and_recover(coverage).await;
            }
            Err(_not_committed) => {
                // The journal can rebuild state even if this snapshot commit is lost.
            }
        }
    }

    /// Crashes after an event becomes durable but before the caller receives an
    /// acknowledgement.
    ///
    /// The test pauses recovery of the uncertain append, then kills the loop. On restart, the
    /// stored event must contribute to state exactly once.
    async fn crash_mid_ambiguity(
        &mut self,
        counter: u8,
        amount: u64,
        coverage: &mut CoverageLedger,
    ) {
        self.started.task.abort();
        let hold = crate::shard_log::TestHold::armed();
        let harness = crate::shard_log::TestHarness {
            before_recovery: Some(Arc::clone(&hold)),
            ..crate::shard_log::TestHarness::default()
        };
        self.started = Self::open_loop_with_harness(&self.journal, self.shard, harness).await;
        self.journal
            .force_outcomes([SimAppendOutcome::CommitUnknownDurable]);

        let event = self.fresh_event(counter, amount);
        let record = EventRecordV1::new(event).expect("ambiguous event should encode");
        self.proposed.insert(record.event_id.clone());
        let handle = self.handle();
        let gated_record = record.clone();
        let in_flight = tokio::spawn(async move { handle.propose(gated_record).await });
        hold.entered().notified().await;
        self.started.task.abort();
        let ack = in_flight.await;
        assert!(
            !matches!(ack, Ok(Ok(ShardCommandOutcome::Applied { .. }))),
            "a command killed before recovery cannot have been acknowledged Applied"
        );

        let durable_ids = self.reference_fold().event_ids;
        properties::covered(
            coverage,
            &properties::CRASH_WITH_UNACKNOWLEDGED_DURABLE_EVENT,
            durable_ids.contains(&record.event_id),
        );
        self.started = Self::open_loop(&self.journal, self.shard).await;
        self.observe_recovery(coverage);
    }

    async fn crash_and_recover(&mut self, coverage: &mut CoverageLedger) {
        self.started.task.abort();
        let durable_ids = self.reference_fold().event_ids;
        let unacknowledged_durable = durable_ids.iter().any(|id| {
            !self
                .acknowledged
                .iter()
                .any(|record| record.event_id == *id)
        });
        properties::covered(
            coverage,
            &properties::CRASH_WITH_UNACKNOWLEDGED_DURABLE_EVENT,
            unacknowledged_durable,
        );
        self.started = Self::open_loop(&self.journal, self.shard).await;
        self.observe_recovery(coverage);
        properties::covered(
            coverage,
            &properties::RECOVERY_REPLAYED_NONEMPTY_PREFIX,
            !durable_ids.is_empty(),
        );
    }

    fn reference_fold(&self) -> ReferenceState {
        let mut reference = ReferenceState::default();
        for (_sequence, bytes) in self.journal.durable_entries(SimKey::Events) {
            let record = EventRecord::<DstEvent>::decode(&bytes)
                .expect("durable simulation entries should decode")
                .normalize()
                .expect("durable simulation entries should normalize");
            if !reference.event_ids.insert(record.event_id.clone()) {
                continue;
            }
            match record.event {
                DstEvent::Increment {
                    counter, amount, ..
                } => {
                    *reference.totals.entry(counter).or_insert(0) += amount;
                }
                DstEvent::Archive {
                    counter,
                    upto,
                    cycle,
                } => {
                    reference.totals.insert(counter.clone(), 0);
                    *reference.archives.entry(counter.clone()).or_insert(0) += 1;
                    reference.archive_events.push(DstEffect {
                        counter,
                        upto,
                        cycle,
                    });
                }
            }
        }
        reference
    }

    /// Runs pending effects until the plan is empty, then compares state and executions with
    /// the expected results.
    async fn quiesce_and_check(&mut self, coverage: &mut CoverageLedger) {
        let mut turns = 0_u32;
        while self.effect_turn(coverage).await > 0 {
            turns += 1;
            properties::check(
                &properties::PLAN_REACHES_FIXPOINT,
                turns <= self.fixpoint_turn_bound,
                format_args!("plan still non-empty after {turns} effect turns"),
            );
        }

        let durable_end = self.journal.durable_end_exclusive();
        properties::check(
            &properties::DURABLE_END_MONOTONIC,
            durable_end >= self.last_durable_end,
            format_args!(
                "durable end went from {} to {durable_end}",
                self.last_durable_end
            ),
        );
        self.last_durable_end = durable_end;

        let reference = self.reference_fold();
        let projection = self.read_projection(coverage).await;
        properties::check(
            &properties::PROJECTION_IS_FOLD_OF_DURABLE_PREFIX,
            projection.totals == reference.totals && projection.archives == reference.archives,
            format_args!("projection {projection:?} != reference fold of the durable prefix"),
        );
        for record in &self.acknowledged {
            properties::check(
                &properties::ACK_IMPLIES_DURABLE,
                reference.event_ids.contains(&record.event_id),
                format_args!("acknowledged event {} is not durable", record.event_id),
            );
            properties::check(
                &properties::ACKED_EVENT_SURVIVES_RECOVERY,
                reference.event_ids.contains(&record.event_id),
                format_args!("acknowledged event {} vanished", record.event_id),
            );
        }
        for rejected in &self.rejected {
            properties::check(
                &properties::REJECTED_NEVER_DURABLE,
                !reference.event_ids.contains(rejected),
                format_args!("rejected event {rejected} became durable"),
            );
        }
        for archive in &reference.archive_events {
            let identity = effect_id(archive).expect("effect should serialize");
            properties::check(
                &properties::DURABLE_COMPLETION_IMPLIES_EXECUTED,
                self.executions.contains_key(&identity),
                format_args!(
                    "durable completion for {}@{} has no recorded execution",
                    archive.counter, archive.upto
                ),
            );
        }
        for durable in &reference.event_ids {
            properties::check(
                &properties::DURABLE_EVENTS_HAVE_PROVENANCE,
                self.proposed.contains(durable),
                format_args!("durable event {durable} was never proposed"),
            );
        }
    }
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
    coverage: &mut CoverageLedger,
    trace: &mut Vec<String>,
) -> ScheduleReport {
    domain::register::<DstDomain>().expect("simulation domain should register");
    let journal = SimLogHandle::new(plan.gap_seed, plan.dispositions.clone());
    let (shard, counters) = shared_shard_counters();

    let mut driver = Driver {
        started: Driver::open_loop(&journal, shard).await,
        journal,
        shard,
        counters,
        acknowledged: Vec::new(),
        applied: BTreeSet::new(),
        rejected: BTreeSet::new(),
        executions: BTreeMap::new(),
        proposed: BTreeSet::new(),
        fixpoint_turn_bound: FIXPOINT_TURN_BOUND
            + u32::try_from(plan.dispositions.len()).unwrap_or(u32::MAX),
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
                    .push(format!("{step}: duplicate {}", record.event_id));
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
            PlannedAction::CrashMidAmbiguity { counter, amount } => {
                driver.trace.push(format!("{step}: crash mid-ambiguity"));
                driver
                    .crash_mid_ambiguity(*counter, *amount, coverage)
                    .await;
            }
            PlannedAction::QuiesceAndCheck => {
                driver.trace.push(format!("{step}: quiesce"));
                driver.quiesce_and_check(coverage).await;
            }
        }
    }
    driver.trace.push("final quiesce".into());
    driver.quiesce_and_check(coverage).await;
    driver.started.task.abort();

    ScheduleReport {
        steps: plan.actions.len(),
        acknowledged_events: driver.acknowledged.len(),
        durable_events: driver.reference_fold().event_ids.len(),
        effect_executions: driver.executions.values().map(Vec::len).sum(),
    }
}

#[cfg(test)]
mod tests {
    use core::panic::AssertUnwindSafe;

    use proptest::prelude::*;

    use super::*;

    const SCHEDULE_SEED_BASE: u64 = 0x5EED_0000_0000_0000;
    const DEFAULT_SCHEDULES: u64 = 256;

    fn run_one(
        plan: &SchedulePlan,
        coverage: &mut CoverageLedger,
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
                PlannedAction::CrashMidAmbiguity { counter, amount }
            }),
            2 => Just(PlannedAction::QuiesceAndCheck),
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
            .prop_map(|(actions, dispositions, gap_seed)| SchedulePlan {
                actions,
                dispositions,
                gap_seed,
            })
    }

    proptest! {
        /// Every safety property in the catalog holds on every generated
        /// schedule. A failure shrinks to a minimal plan and is persisted
        /// by proptest for regression replay.
        #[test]
        fn safety_properties_hold_on_generated_schedules(plan in plan_strategy()) {
            let mut coverage = CoverageLedger::new();
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
            let plan = derive_plan(seed, DispositionWeights::DEFAULT);
            let mut coverage = CoverageLedger::new();
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
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(DEFAULT_SCHEDULES);
        let mut coverage = CoverageLedger::new();
        for index in 0..schedules {
            let seed = SCHEDULE_SEED_BASE + index;
            let plan = derive_plan(seed, DispositionWeights::DEFAULT);
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
        let plan = derive_plan(42, DispositionWeights::DEFAULT);
        let mut first_coverage = CoverageLedger::new();
        let mut second_coverage = CoverageLedger::new();
        let (first_trace, first) = run_one(&plan, &mut first_coverage);
        let (second_trace, second) = run_one(&plan, &mut second_coverage);
        let first = first.expect("plan 42 should complete");
        let second = second.expect("plan 42 should complete");
        assert_eq!(first_trace, second_trace);
        assert_eq!(first.steps, second.steps);
        assert_eq!(first.acknowledged_events, second.acknowledged_events);
        assert_eq!(first.durable_events, second.durable_events);
        assert_eq!(first.effect_executions, second.effect_executions);
    }
}
