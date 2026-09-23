use alloc::sync::Arc;

use super::{Driver, ScheduleCoverage};
use crate::{
    domain::EventRecordV1,
    properties::{self},
    shard_log::{ShardCommandErrorKind, ShardCommandOutcome},
    sim::SimAppendOutcome,
};

impl Driver<'_> {
    /// Captures and commits a snapshot. Snapshot appends consume scheduled append outcomes.
    pub(super) async fn snapshot_commit(&mut self, step: usize, coverage: &mut ScheduleCoverage) {
        let capture = match self.handle().capture_snapshot(1).await {
            Ok(capture) => capture,
            Err(_terminal) => {
                self.trace
                    .push("snapshot capture found a stopped command loop".into());
                self.crash_and_recover(coverage).await;
                return;
            }
        };
        let Some(payload) = capture else {
            self.trace.push("snapshot not due".into());
            return;
        };
        let timestamp = chrono::DateTime::from_timestamp(
            i64::try_from(step).expect("simulation step should fit in i64"),
            0,
        )
        .expect("simulation step should be a valid timestamp");
        let snapshot = payload.into_record(timestamp);
        match self.handle().commit_snapshot(snapshot).await {
            Ok(_sequence) => {}
            Err(error)
                if matches!(
                    error.current_context().kind(),
                    ShardCommandErrorKind::Fenced
                        | ShardCommandErrorKind::CommitUnknown
                        | ShardCommandErrorKind::Recovery
                        | ShardCommandErrorKind::Closed
                ) =>
            {
                self.trace.push(format!(
                    "snapshot save failed ({:?})",
                    error.current_context().kind()
                ));
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
    /// Pauses the storage reply after the append, then aborts the command loop task. After the
    /// restart, the stored event must contribute to state exactly once.
    pub(super) async fn crash_before_append_reply(
        &mut self,
        counter: u8,
        amount: u64,
        coverage: &mut ScheduleCoverage,
    ) {
        self.started.task.abort();
        self.started = Self::open_loop(&self.journal, self.shard, Arc::clone(&self.registry)).await;
        let hold = self.journal.pause_after_append();
        self.journal
            .force_outcomes([SimAppendOutcome::CommitUnknownDurable]);

        let event = self.fresh_event(counter, amount);
        let record =
            EventRecordV1::new(event).expect("event should encode before the injected crash");
        self.proposed.insert(record.event_id());
        let handle = self.handle();
        let in_flight_record = record.clone();
        let in_flight = tokio::spawn(async move { handle.propose(in_flight_record).await });
        hold.entered().notified().await;
        self.started.task.abort();
        let ack = in_flight.await;
        assert!(
            !matches!(ack, Ok(Ok(ShardCommandOutcome::Applied { .. }))),
            "a command aborted before the storage reply should not be acknowledged Applied"
        );

        let durable_ids = self.reference_fold().event_ids;
        properties::covered(
            coverage,
            &properties::CRASH_WITH_UNACKNOWLEDGED_DURABLE_EVENT,
            durable_ids.contains(&record.event_id()),
        );
        self.started = Self::open_loop(&self.journal, self.shard, Arc::clone(&self.registry)).await;
        self.observe_recovery(coverage);
    }

    pub(super) async fn crash_and_recover(&mut self, coverage: &mut ScheduleCoverage) {
        self.started.task.abort();
        let durable_ids = self.reference_fold().event_ids;
        let unacknowledged_durable = durable_ids.iter().any(|id| {
            !self
                .acknowledged
                .iter()
                .any(|record| record.event_id() == *id)
        });
        properties::covered(
            coverage,
            &properties::CRASH_WITH_UNACKNOWLEDGED_DURABLE_EVENT,
            unacknowledged_durable,
        );
        self.started = Self::open_loop(&self.journal, self.shard, Arc::clone(&self.registry)).await;
        self.observe_recovery(coverage);
        properties::covered(
            coverage,
            &properties::RECOVERY_REPLAYED_NONEMPTY_PREFIX,
            !durable_ids.is_empty(),
        );
    }
}
