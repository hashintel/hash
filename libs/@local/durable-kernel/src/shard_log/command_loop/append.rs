use error_stack::{Report, ResultExt as _};

use super::{CommandLoop, ShardCommandError, ShardCommandOutcome};
use crate::{
    DurableError,
    port::{EventDomain, Prepared},
    sequence::JournalSequence,
    shard_log::{
        AppendFailureKind, EVENTS_KEY, JournalStorage, PROJECTION_SNAPSHOTS_KEY, ShardAppendError,
    },
};

impl<D: EventDomain, S: JournalStorage> CommandLoop<D, S> {
    pub(super) async fn process(
        &mut self,
        record: D::RecordCurrent,
    ) -> Result<ShardCommandOutcome<D::FoldError>, Report<ShardCommandError>> {
        if D::record_shard(&record) != self.location.shard {
            return Ok(ShardCommandOutcome::Rejected {
                rejection: D::reject_foreign_shard(&record),
            });
        }

        let event_id = D::record_event_id(&record);
        let state_key = D::record_state_key(&record);
        let mut safe_failures = 0_u32;
        loop {
            let previous_state_sequence = self.checkpoint_state_sequence(&state_key);
            let transition = match D::prepare(&self.projection, &record) {
                Ok(transition) => transition,
                Err(rejection) => return Ok(ShardCommandOutcome::Rejected { rejection }),
            };

            let Prepared::Mutation(delta) = transition else {
                self.notify_state_change_if_established(&state_key);
                return Ok(ShardCommandOutcome::AlreadyDurable { event_id });
            };

            if self.ownership_lost.is_cancelled() {
                return Err(Report::new(ShardCommandError::OwnershipLostBeforeAppend));
            }

            let append_result = self.append(&record).await;
            match append_result {
                Ok(sequence) => {
                    // The record is durable even if the state update fails, so the shard stops and
                    // startup recovery rebuilds the state.
                    D::finalize(&mut self.projection, delta, sequence)
                        .change_context(ShardCommandError::FinalizeRecord { event_id, sequence })
                        .change_context(ShardCommandError::LeaseRequired { event_id })?;
                    if self.checkpoint_state_sequence(&state_key) != previous_state_sequence {
                        self.notify_state_change_if_established(&state_key);
                    }
                    return Ok(ShardCommandOutcome::Applied {
                        event_id,
                        shard_sequence: sequence,
                    });
                }
                Err(error) => {
                    let kind = error.current_context().kind;
                    let context = ShardCommandError::AppendEvent { event_id, kind };
                    match kind {
                        AppendFailureKind::DefinitelyNotCommitted => {
                            if safe_failures >= self.safe_append_retries {
                                return Err(error.change_context(context));
                            }
                            safe_failures = safe_failures.saturating_add(1);
                        }
                        AppendFailureKind::CommitUnknown => {
                            return Err(error
                                .change_context(context)
                                .change_context(ShardCommandError::LeaseRequired { event_id }));
                        }
                        AppendFailureKind::Fenced => return Err(error.change_context(context)),
                    }
                }
            }
        }
    }

    pub(super) async fn append_snapshot(
        &mut self,
        bytes: bytes::Bytes,
        snapshot_through: JournalSequence,
    ) -> Result<JournalSequence, Report<ShardCommandError>> {
        let mut safe_failures = 0_u32;
        loop {
            if self.ownership_lost.is_cancelled() {
                return Err(Report::new(ShardCommandError::OwnershipLostBeforeSnapshot));
            }

            let writer = self
                .writer
                .as_ref()
                .ok_or(ShardCommandError::WriterUnavailable)?;

            match writer
                .append_encoded(PROJECTION_SNAPSHOTS_KEY, bytes.clone())
                .await
            {
                Ok(sequence) => {
                    self.last_snapshot_attempt_through_sequence = self
                        .last_snapshot_attempt_through_sequence
                        .max(Some(snapshot_through));
                    return Ok(sequence);
                }
                Err(error) => {
                    let kind = error.current_context().kind;
                    if kind != AppendFailureKind::DefinitelyNotCommitted
                        || safe_failures >= self.safe_append_retries
                    {
                        return Err(error.change_context(ShardCommandError::AppendSnapshot {
                            through_sequence: snapshot_through,
                            kind,
                        }));
                    }
                    safe_failures = safe_failures.saturating_add(1);
                }
            }
        }
    }

    fn checkpoint_state_sequence(&self, state_key: &D::StateKey) -> Option<JournalSequence> {
        D::state_sequence(&self.projection, state_key)
    }

    fn notify_state_change_if_established(&self, state_key: &D::StateKey) {
        if self.checkpoint_state_sequence(state_key).is_some() {
            // A full channel already holds a wake-up. The driver plans from the whole projection
            // when it wakes, so dropping this notification loses no work.
            let _: Result<_, _> = self.state_change_sender.try_send(state_key.clone());
        }
    }

    fn append(
        &self,
        record: &D::RecordCurrent,
    ) -> impl core::future::Future<Output = Result<JournalSequence, Report<ShardAppendError>>> + Send
    {
        let encoded = self
            .writer
            .as_ref()
            .ok_or_else(|| {
                Report::new(DurableError::WriterUnavailable).change_context(ShardAppendError {
                    kind: AppendFailureKind::CommitUnknown,
                })
            })
            .and_then(|writer| {
                let bytes = writer
                    .encode_registered::<D::Record>(|output| D::encode_record(record, output))?;
                Ok((writer, bytes))
            });
        async move {
            let (writer, bytes) = encoded?;
            writer.append_encoded(EVENTS_KEY, bytes).await
        }
    }
}
