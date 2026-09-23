use alloc::collections::BTreeMap;

use error_stack::{Report, ResultExt as _};

use super::{KernelError, RunningKernel};
use crate::{
    domain::{self, EventRecordV1, Hosted, PartitionKey, SimpleDomain},
    sequence::JournalSequence,
    shard_log::{ShardCommandErrorKind, ShardCommandHandle, ShardCommandOutcome},
};

#[derive(Debug)]
/// Reports whether a submitted event was rejected, newly stored, or already in the journal.
pub enum Submitted<R> {
    /// Validation rejected the event. The journal is unchanged.
    Rejected(error_stack::Report<R>),
    Applied,
    AlreadyDurable,
}

impl<S: SimpleDomain> RunningKernel<S> {
    pub(super) fn handle_for(
        &self,
        key: &PartitionKey,
    ) -> Result<&ShardCommandHandle<Hosted<S>>, Report<KernelError>> {
        let shard = key.shard();
        self.shards
            .get(&shard.get())
            .ok_or_else(|| Report::new(KernelError::NotOwned { shard }))
    }

    /// Submits an event and waits for it to become durable.
    ///
    /// An identical event returns [`Submitted::AlreadyDurable`]. Validation failures return
    /// [`Submitted::Rejected`] with the original report from
    /// [`Fold::validate`](crate::domain::Fold::validate), including its context and attachments.
    ///
    /// # Errors
    ///
    /// Returns an error if encoding fails, the process does not own the event’s shard, or the
    /// command loop fails.
    pub async fn submit(
        &self,
        event: S::Event,
    ) -> Result<Submitted<<S::Projection as domain::Fold<S::Event>>::Error>, Report<KernelError>>
    {
        let record = EventRecordV1::new(event).change_context(KernelError::BuildEventRecord)?;
        let handle = self.handle_for(record.partition())?;
        match handle
            .propose(record)
            .await
            .change_context(KernelError::Command)?
        {
            ShardCommandOutcome::Applied { .. } => Ok(Submitted::Applied),
            ShardCommandOutcome::AlreadyDurable { .. } => Ok(Submitted::AlreadyDurable),
            ShardCommandOutcome::Rejected {
                rejection: domain::FoldError::Rejected { rejection, .. },
            } => Ok(Submitted::Rejected(rejection)),
            ShardCommandOutcome::Rejected { rejection } => Err(Report::from(rejection)),
        }
    }

    /// Reads the projection for the shard containing `key`.
    ///
    /// The projection includes every partition on that shard, so the closure selects the data it
    /// needs. The closure runs inside the command loop and must not block.
    ///
    /// # Errors
    ///
    /// Returns an error when the partition’s shard is not owned or the command loop fails.
    pub async fn read<R, F>(&self, key: &PartitionKey, read: F) -> Result<R, Report<KernelError>>
    where
        R: Send + 'static,
        F: FnOnce(&S::Projection) -> R + Send + 'static,
    {
        self.query(key, read).await
    }

    /// Runs `query` against the projection for the shard containing `key`.
    ///
    /// The query runs inside the command loop and must not block.
    ///
    /// # Errors
    ///
    /// Returns an error when the partition’s shard is not owned or the command loop fails.
    pub async fn query<Q>(
        &self,
        key: &PartitionKey,
        query: Q,
    ) -> Result<Q::Output, Report<KernelError>>
    where
        Q: domain::ProjectionQuery<S::Projection> + 'static,
        Q::Output: 'static,
    {
        let handle = self.handle_for(key)?;
        handle
            .read_query(
                move |projection: &domain::KernelProjection<S::Projection>| {
                    query.answer(projection.domain())
                },
            )
            .await
            .change_context(KernelError::Command)
    }

    /// Returns the journal sequence of the snapshot each shard restored during recovery, keyed by
    /// shard ID. `None` means the shard replayed its full journal.
    #[must_use]
    pub const fn recovery_snapshots(&self) -> &BTreeMap<u8, Option<JournalSequence>> {
        &self.recovered_snapshots
    }

    /// Waits for active effects to return, then closes each shard writer.
    /// Executors must set request timeouts so shutdown can finish.
    ///
    /// # Errors
    ///
    /// Returns an error when a driver or command loop failed while running or during shutdown.
    pub async fn shutdown(mut self) -> Result<(), Report<KernelError>> {
        self.shutdown.cancel();
        let mut first_error = None;

        for driver in &mut self.drivers {
            let result = driver
                .await
                .change_context(KernelError::JoinShardDriver)
                .flatten();

            if let Err(error) = result {
                first_error.get_or_insert(error);
            }
        }

        for owner in self.owners.drain(..) {
            if let Err(error) = owner.shutdown().await
                && error.current_context().kind() != ShardCommandErrorKind::Closed
            {
                first_error.get_or_insert_with(|| error.change_context(KernelError::Command));
            }
        }

        for task in &mut self.loops {
            let result = task
                .await
                .change_context(KernelError::JoinCommandLoop)
                .and_then(|result| result.change_context(KernelError::Command));

            if let Err(error) = result {
                first_error.get_or_insert(error);
            }
        }

        first_error.map_or(Ok(()), Err)
    }
}

impl<S: SimpleDomain> Drop for RunningKernel<S> {
    fn drop(&mut self) {
        self.shutdown.cancel();
        for driver in &self.drivers {
            driver.abort();
        }
    }
}
