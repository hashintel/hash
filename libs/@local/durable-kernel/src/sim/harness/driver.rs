use alloc::sync::Arc;

use super::{
    Driver, DstCounters, DstDomain, DstEvent, DstHandle, DstStarted, ScheduleCoverage, SubmitKind,
    model::plan_effects,
};
use crate::{
    domain::{EventRecordV1, Hosted, effect_id},
    properties::{self},
    registry::RecordRegistry,
    shard_log::{
        OpenedShard, ShardCommandConfig, ShardCommandErrorKind, ShardCommandOutcome,
        ShardLogLocation,
    },
    sim::{SimAppendOutcome, SimLogHandle},
};

impl Driver<'_> {
    pub(super) async fn open_loop(
        journal: &SimLogHandle,
        shard: crate::routing::Shard,
        registry: Arc<RecordRegistry>,
    ) -> DstStarted {
        let location = ShardLogLocation::simulated(shard, journal.clone(), registry);
        let opened = OpenedShard::open(location)
            .await
            .expect("simulated shard should open");
        let recovered = opened
            .recover_with_snapshots::<Hosted<DstDomain>>(&())
            .await
            .expect("simulated shard should recover");
        recovered.enable(ShardCommandConfig::default().allow_local_reopen())
    }

    pub(super) fn handle(&self) -> DstHandle {
        self.started.handle.clone()
    }

    pub(super) fn observe_recovery(&self, coverage: &mut ScheduleCoverage) {
        properties::covered(
            coverage,
            &properties::RECOVERY_BOUNDED_BY_SNAPSHOT,
            self.started.recovery.snapshot_through_sequence.is_some(),
        );
        properties::covered(
            coverage,
            &properties::CORRUPT_SNAPSHOT_FELL_BACK,
            self.journal.latest_snapshot_is_corrupt(),
        );
    }

    pub(super) fn fresh_event(&mut self, counter: u8, amount: u64) -> DstEvent {
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

    /// Proposes `record` and checks the outcome. Reopens the command loop after a terminal error
    /// so the rest of the schedule can run.
    pub(super) async fn submit(
        &mut self,
        record: EventRecordV1<DstEvent>,
        kind: SubmitKind,
        coverage: &mut ScheduleCoverage,
    ) {
        self.proposed.insert(record.event_id());
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
                    &properties::RECOVERY_RETRIES_MISSING_APPEND,
                    window.contains(&SimAppendOutcome::CommitUnknownLost),
                );
            }
            Ok(ShardCommandOutcome::AlreadyDurable { .. }) => {
                self.acknowledged.push(record);
                properties::covered(
                    coverage,
                    &properties::DUPLICATE_SUBMISSION_DETECTED,
                    kind == SubmitKind::Duplicate,
                );
                properties::covered(
                    coverage,
                    &properties::RECOVERY_FINDS_UNACKNOWLEDGED_APPEND,
                    kind != SubmitKind::Duplicate
                        && window.contains(&SimAppendOutcome::CommitUnknownDurable),
                );
            }
            Ok(ShardCommandOutcome::Rejected { rejection }) => {
                assert!(
                    kind == SubmitKind::Completion,
                    "only an effect completion should be rejected: {kind:?}: {rejection}"
                );
                self.rejected.insert(record.event_id());
            }
            Err(error) => match error.current_context().kind() {
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
                        error.current_context().kind() == ShardCommandErrorKind::Fenced,
                    );
                    self.trace.push(format!(
                        "command loop failed ({:?}); reopening",
                        error.current_context().kind()
                    ));
                    self.crash_and_recover(coverage).await;
                }
            },
        }
    }

    pub(super) async fn submit_invalid(&mut self, coverage: &mut ScheduleCoverage) {
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
        let event_id = record.event_id();
        self.proposed.insert(event_id);
        match self.handle().propose(record).await {
            Ok(ShardCommandOutcome::Rejected { .. }) => {
                self.rejected.insert(event_id);
            }
            Err(_terminal) => {
                self.trace
                    .push("invalid submission found a stopped command loop".into());
                self.crash_and_recover(coverage).await;
            }
            Ok(outcome) => panic!("validation should reject a zero amount, got {outcome:?}"),
        }
    }

    /// Reads the projection through the command loop. Reopens the loop and retries if the read
    /// fails.
    pub(super) async fn read_projection(&mut self, coverage: &mut ScheduleCoverage) -> DstCounters {
        if let Ok(projection) = self
            .handle()
            .read(|projection| projection.domain().clone())
            .await
        {
            return projection;
        }
        self.trace
            .push("read found a stopped command loop; reopening".into());
        self.crash_and_recover(coverage).await;
        self.handle()
            .read(|projection| projection.domain().clone())
            .await
            .expect("recovered loop should serve reads")
    }

    pub(super) async fn effect_turn(&mut self, coverage: &mut ScheduleCoverage) -> usize {
        let projection = self.read_projection(coverage).await;
        let effects = plan_effects(&projection);
        for effect in &effects {
            let identity = effect_id(effect).expect("effect should serialize");
            let payload = serde_json::to_vec(effect).expect("effect should serialize");
            let executions = self.executions.entry(identity).or_default();
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
}
