use error_stack::{Report, ResultExt as _};

use super::{
    CommandLoop, QueuedWhenStopped, RecoveredProjection, ShardCommandError, handle::Command,
};
use crate::{
    port::{Domain, EventDomain, SnapshotDomain},
    sequence::JournalSequence,
    shard_log::{JournalStorage, JournalWriter, ShardLogWriter, SnapshotCandidate},
};

impl<D: Domain, S: JournalStorage> CommandLoop<D, S> {
    pub(super) fn reject_queued(&mut self, error: &ShardCommandError) {
        let stopped = || Report::new(error.clone()).attach(QueuedWhenStopped);
        while let Ok(command) = self.receiver.try_recv() {
            match command {
                Command::Propose { reply, .. } => {
                    let _: Result<_, _> = reply.send(Err(stopped()));
                }
                Command::InspectControl { reply, .. } => {
                    let _: Result<_, _> = reply.send(Err(stopped()));
                }
                Command::ResolveControl { reply, .. } => {
                    let _: Result<_, _> = reply.send(Err(stopped()));
                }
                Command::CaptureSnapshot { reply, .. } => {
                    let _: Result<_, _> = reply.send(Err(stopped()));
                }
                Command::CommitSnapshot { reply, .. } => {
                    let _: Result<_, _> = reply.send(Err(stopped()));
                }
                Command::Query { reply, .. } => {
                    let _: Result<_, _> = reply.send(Err(stopped()));
                }
                Command::Shutdown { reply } => {
                    let _: Result<_, _> = reply.send(Err(stopped()));
                }
            }
        }
    }

    pub(super) async fn close_writer(&mut self) -> Result<(), Report<ShardCommandError>> {
        if let Some(writer) = self.writer.take() {
            writer
                .close()
                .await
                .change_context(ShardCommandError::CloseWriter)?;
        }
        Ok(())
    }
}

pub(super) async fn replay_with_snapshots<D: SnapshotDomain>(
    writer: &ShardLogWriter<impl JournalWriter>,
    shard: crate::routing::Shard,
    durable_end_exclusive: JournalSequence,
    context: Option<&D::SnapshotContext>,
) -> Result<RecoveredProjection<D>, Report<ShardCommandError>> {
    let mut corruption_fallbacks = 0_u64;
    if let Some(context) = context {
        match writer
            .scan_projection_snapshots(durable_end_exclusive)
            .await
        {
            Ok(candidates) => {
                if let Some(recovered) = replay_from_snapshots::<D>(
                    writer,
                    shard,
                    durable_end_exclusive,
                    context,
                    candidates,
                    &mut corruption_fallbacks,
                )
                .await
                {
                    return Ok(recovered);
                }
            }
            Err(error) => {
                corruption_fallbacks = corruption_fallbacks.saturating_add(1);
                tracing::warn!(
                    shard = %shard.path_segment(),
                    error = ?error,
                    "projection-snapshot discovery failed; replaying the complete journal"
                );
            }
        }
    }
    replay_durable_prefix::<D>(writer, shard, durable_end_exclusive)
        .await
        .map(|(projection, replayed_events)| RecoveredProjection {
            projection,
            snapshot_through_sequence: None,
            snapshot_created_at: None,
            replayed_events,
            corruption_fallbacks,
        })
}

/// Restores the newest usable snapshot and replays the events after it.
///
/// Returns `None` when no candidate can be restored. Each skipped candidate increments
/// `corruption_fallbacks`.
async fn replay_from_snapshots<D: SnapshotDomain>(
    writer: &ShardLogWriter<impl JournalWriter>,
    shard: crate::routing::Shard,
    durable_end_exclusive: JournalSequence,
    context: &D::SnapshotContext,
    candidates: Vec<SnapshotCandidate<D::Snapshot>>,
    corruption_fallbacks: &mut u64,
) -> Option<RecoveredProjection<D>> {
    for (reference_sequence, candidate) in candidates.into_iter().rev() {
        let snapshot = match candidate {
            Ok(snapshot) => snapshot,
            Err(error) => {
                *corruption_fallbacks = corruption_fallbacks.saturating_add(1);
                tracing::warn!(
                    shard = %shard.path_segment(),
                    %reference_sequence,
                    error = ?error,
                    "ignored malformed projection-snapshot reference"
                );
                continue;
            }
        };
        let through = match D::snapshot_bounds(&snapshot) {
            Ok((_shard, through)) => through,
            Err(error) => {
                *corruption_fallbacks = corruption_fallbacks.saturating_add(1);
                tracing::warn!(
                    shard = %shard.path_segment(),
                    %reference_sequence,
                    error = ?error,
                    "ignored projection snapshot with invalid addressing"
                );
                continue;
            }
        };
        if through >= reference_sequence || through >= durable_end_exclusive {
            *corruption_fallbacks = corruption_fallbacks.saturating_add(1);
            tracing::warn!(
                shard = %shard.path_segment(),
                %reference_sequence,
                through_sequence = %through,
                %durable_end_exclusive,
                "ignored projection snapshot with an impossible journal range"
            );
            continue;
        }
        let projection = match D::load_snapshot_projection(context, shard, &snapshot).await {
            Ok(projection) => projection,
            Err(error) => {
                *corruption_fallbacks = corruption_fallbacks.saturating_add(1);
                tracing::warn!(
                    shard = %shard.path_segment(),
                    %reference_sequence,
                    error = ?error,
                    "ignored unusable projection snapshot"
                );
                continue;
            }
        };
        match replay_durable_suffix::<D>(writer, shard, durable_end_exclusive, projection).await {
            Ok((projection, replayed_events)) => {
                return Some(RecoveredProjection {
                    projection,
                    snapshot_through_sequence: Some(through),
                    snapshot_created_at: Some(D::snapshot_created_at(&snapshot)),
                    replayed_events,
                    corruption_fallbacks: *corruption_fallbacks,
                });
            }
            Err(error) => {
                *corruption_fallbacks = corruption_fallbacks.saturating_add(1);
                tracing::warn!(
                    shard = %shard.path_segment(),
                    %reference_sequence,
                    error = ?error,
                    "replaying events after the snapshot failed; trying an older snapshot"
                );
            }
        }
    }
    None
}

async fn replay_durable_prefix<D: EventDomain>(
    writer: &ShardLogWriter<impl JournalWriter>,
    shard: crate::routing::Shard,
    durable_end_exclusive: JournalSequence,
) -> Result<(D::Projection, u64), Report<ShardCommandError>> {
    replay_durable_suffix::<D>(writer, shard, durable_end_exclusive, D::empty_projection()).await
}

async fn replay_durable_suffix<D: EventDomain>(
    writer: &ShardLogWriter<impl JournalWriter>,
    shard: crate::routing::Shard,
    durable_end_exclusive: JournalSequence,
    mut recovered: D::Projection,
) -> Result<(D::Projection, u64), Report<ShardCommandError>> {
    // The scan uses the writer that reported `durable_end_exclusive`, so the scan and its bounds
    // share one view of storage.
    let scan_started = std::time::Instant::now();
    let through_sequence = D::through_sequence(&recovered);
    let records = writer
        .scan_suffix(through_sequence, durable_end_exclusive)
        .await
        .change_context(ShardCommandError::ReadJournal);
    let records = records?;

    tracing::info!(
        shard = %shard.path_segment(),
        from_sequence = through_sequence.map_or(0, |sequence| sequence.saturating_next().get()),
        %durable_end_exclusive,
        records = records.len(),
        elapsed_ms = u64::try_from(scan_started.elapsed().as_millis()).unwrap_or(u64::MAX),
        "read journal events after the snapshot"
    );

    let replayed_events = u64::try_from(records.len()).unwrap_or(u64::MAX);
    for (sequence, record) in records {
        D::replay(&mut recovered, shard, sequence, record)
            .change_context(ShardCommandError::ReplayRecord { sequence })?;
    }
    Ok((recovered, replayed_events))
}
