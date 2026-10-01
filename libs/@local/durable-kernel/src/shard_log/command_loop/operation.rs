use bytes::Bytes;
use error_stack::Report;
use futures_util::future::BoxFuture;

use super::{ShardCommandError, ShardCommandKind, ShardCommandOutcome, run::CommandFailure};
use crate::{
    port::EventDomain, registry::RecordRegistry, routing::Shard, sequence::JournalSequence,
};

/// Gives a queued operation access to the command loop's state.
pub(super) trait LoopAccess<D: EventDomain>: Send {
    fn shard(&self) -> Shard;

    fn projection(&self) -> &D::Projection;

    fn registry(&self) -> &RecordRegistry;

    fn last_snapshot_attempt(&self) -> Option<JournalSequence>;

    fn set_last_snapshot_attempt(&mut self, through: JournalSequence);

    fn propose(
        &mut self,
        record: D::RecordCurrent,
    ) -> BoxFuture<'_, Result<ShardCommandOutcome<D::FoldError>, Report<ShardCommandError>>>;

    fn store_snapshot(
        &mut self,
        bytes: Bytes,
        through: JournalSequence,
    ) -> BoxFuture<'_, Result<JournalSequence, Report<ShardCommandError>>>;
}

/// A queued command whose types come from [`crate::port::QueryDomain`],
/// [`crate::port::ControlDomain`], or [`crate::port::SnapshotDomain`].
pub(super) trait Operation<D: EventDomain>: Send {
    fn kind(&self) -> ShardCommandKind;

    fn run(
        self: Box<Self>,
        access: &mut dyn LoopAccess<D>,
    ) -> BoxFuture<'_, Result<(), CommandFailure>>;

    /// Replies with `error` without running the operation.
    fn reject(self: Box<Self>, error: Report<ShardCommandError>);
}
