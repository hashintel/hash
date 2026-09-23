use error_stack::{Report, ResultExt as _};

use super::{CommandLoop, ShardCommandError, ShardCommandOutcome};
use crate::{
    DurableError,
    port::{Domain, Prepared},
    registry::DurableRecord as _,
    shard_log::{
        AppendFailureKind, EVENTS_KEY, JournalStorage, PROJECTION_SNAPSHOTS_KEY, ShardAppendError,
    },
};

impl<D: Domain, S: JournalStorage> CommandLoop<D, S> {
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
        let integration_id = D::record_state_key(&record);
        let mut safe_failures = 0_u32;
        loop {
            let previous_state_sequence = self.checkpoint_state_sequence(&integration_id);
            let transition = match D::prepare(&self.projection, &record) {
                Ok(transition) => transition,
                Err(rejection) => return Ok(ShardCommandOutcome::Rejected { rejection }),
            };
            let Prepared::Mutation(delta) = transition else {
                self.notify_state_change_if_established(&integration_id);
                return Ok(ShardCommandOutcome::AlreadyDurable { event_id });
            };

            if self.ownership_lost.is_cancelled() {
                return Err(Report::new(ShardCommandError::OwnershipLostBeforeAppend));
            }
            let append_result = self.append(&record).await;
            match append_result {
                Ok(sequence) => {
                    if let Err(error) = D::finalize(&mut self.projection, delta, sequence)
                        .change_context(ShardCommandError::FinalizeRecord { event_id, sequence })
                    {
                        // The record is durable even though the state update failed. Recover
                        // and verify that it was applied before accepting another command.
                        self.recover_after_failure(event_id, error).await?;
                        return match D::prepare(&self.projection, &record) {
                            Ok(Prepared::Noop) => {
                                self.notify_state_change_if_established(&integration_id);
                                Ok(ShardCommandOutcome::AlreadyDurable { event_id })
                            }
                            Ok(Prepared::Mutation(_)) => {
                                Err(Report::new(ShardCommandError::MissingRecoveredEvent {
                                    event_id,
                                }))
                            }
                            Err(prepare_error) => Err(Report::new(prepare_error).change_context(
                                ShardCommandError::ConflictingRecoveredEvent { event_id },
                            )),
                        };
                    }
                    if self.checkpoint_state_sequence(&integration_id) != previous_state_sequence {
                        self.notify_state_change_if_established(&integration_id);
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
                            self.recover_after_failure(event_id, error.change_context(context))
                                .await?;
                            // After recovery, `prepare` detects the stored event or a conflicting
                            // ID. If the event is absent, the loop retries it before processing
                            // another command.
                            safe_failures = 0;
                        }
                        AppendFailureKind::Fenced => return Err(error.change_context(context)),
                    }
                }
            }
        }
    }

    pub(super) async fn process_snapshot(
        &mut self,
        snapshot: D::Snapshot,
    ) -> Result<u64, Report<ShardCommandError>> {
        let (snapshot_shard, snapshot_through) =
            D::snapshot_bounds(&snapshot).change_context(ShardCommandError::ReadSnapshotBounds)?;
        if snapshot_shard != self.location.shard {
            return Err(Report::new(ShardCommandError::SnapshotShardMismatch {
                expected: self.location.shard,
                actual: snapshot_shard,
            }));
        }
        let Some(current_sequence) = D::through_sequence(&self.projection) else {
            return Err(Report::new(ShardCommandError::SnapshotForEmptyProjection));
        };
        if snapshot_through > current_sequence {
            return Err(Report::new(ShardCommandError::SnapshotAheadOfProjection {
                snapshot_through,
                current_sequence,
            }));
        }

        self.location
            .registry
            .require::<D::Snapshot>()
            .change_context_lazy(|| ShardCommandError::ValidateSnapshotRegistration {
                name: D::Snapshot::declaration().name,
            })?;
        let mut bytes = Vec::new();
        snapshot
            .encode(&mut bytes)
            .change_context(ShardCommandError::EncodeSnapshot)?;
        let bytes = bytes::Bytes::from(bytes);
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
                    self.last_snapshot_attempt_through_log_sequence = self
                        .last_snapshot_attempt_through_log_sequence
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

    fn checkpoint_state_sequence(&self, integration_id: &D::StateKey) -> Option<u64> {
        D::state_sequence(&self.projection, integration_id)
    }

    fn notify_state_change_if_established(&self, integration_id: &D::StateKey) {
        if self.checkpoint_state_sequence(integration_id).is_some() {
            // A full channel drops the notification. Startup and later state changes send the
            // key again.
            let _: Result<_, _> = self.state_change_sender.try_send(integration_id.clone());
        }
    }

    fn append(
        &self,
        record: &D::RecordCurrent,
    ) -> impl core::future::Future<Output = Result<u64, Report<ShardAppendError>>> + Send {
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
