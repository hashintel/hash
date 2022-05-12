//! Distribute tasks across workers.
//!
//! A [`Task`]'s execution can be split up across multiple [`Worker`]s if the [`Task`] is marked as
//! being distributed through the [`Task::distribution`] trait method. If this is the case,
//! then [`new_worker_subtasks`] breaks the [`Task`] up into new smaller [`Task`]s, by calling the
//! package-implemented [`WorkerPoolHandler::split_task`] method. It distributes [`AgentBatch`]es as
//! configured, and then executes those individual sub-tasks on multiple workers.
//!
//! As each sub-task finishes executing, it's handled by [`PendingWorkerPoolTask`] which calls the
//! package-implemented [`WorkerPoolHandler::combine_messages`] method once all of the sub-tasks
//! have returned. This method then creates one final [`TaskMessage`] which is returned to the
//! package implementation. Note: [`Task`]s are also automatically further split-up _within_
//! [`worker`]s according to the `Group`s of agents they're being executed on. More information can
//! be found on the [`Worker`] docs.
//!
//! [`new_worker_subtasks`]: crate::worker_pool::WorkerPool::new_worker_subtasks
//! [`Worker`]: crate::worker::Worker
//! [`Task`]: crate::task::Task
//! [`Task::distribution`]: crate::task::Task::distribution
//! [`TaskMessage`]: crate::task::TaskMessage
//! [`InitTask`]: crate::package::simulation::init::InitTask
//! [`PendingWorkerPoolTask`]: crate::worker_pool::--PendingWorkerPoolTask
//! [`WorkerPoolHandler`]: crate::worker_pool::WorkerPoolHandler
//! [`WorkerPoolHandler::combine_messages`]: crate::worker_pool::WorkerPoolHandler::combine_messages
//! [`WorkerPoolHandler::split_task`]: crate::worker_pool::WorkerPoolHandler::split_task
//! [`package`]: crate::package::simulation
//! [`PackageType`]: crate::package::simulation::PackageType
//! [`AgentBatch`]: stateful::agent::AgentBatch

/// Describes how a distributed [`Task`] has access to Agent [`State`].
///
/// [`Task`]: crate::task::Task
/// [`State`]: stateful::state::State
#[derive(Default, Debug)]
pub struct StateBatchDistribution {
    /// - `true` - The [`Task`] is executed across multiple [`worker`]s, and Agent [`State`] is
    ///   partitioned across them. As such each `Group` is only available to a single [`worker`].
    ///   That is, there's a surjection of `Group`s to [`worker`]s.
    ///
    ///   Because of this, the [`Task`] is able to take write-access to the `Group`s.
    ///
    /// - `false` - [`worker`]s have access to all of Agent [`State`] and thus all `Group`s.
    ///
    ///   Because of this, there can only be read-access to the `Group`s.
    ///
    /// [`Task`]: crate::task::Task
    /// [`State`]: stateful::state::State
    /// [`worker`]: crate::worker
    pub partitioned_batches: bool,
}

/// Defines if and how a [`Task`] is executed across multiple [`worker`]s).
///
/// [`Task`]: crate::task::Task
/// [`worker`]: crate::worker
pub enum TaskDistributionConfig {
    /// The [`Task`] is split up and executed on multiple [`worker`]s, with access to
    /// [`AgentBatch`]s as defined in the [`StateBatchDistribution`] object.
    ///
    /// [`Task`]: crate::task::Task
    /// [`worker`]: crate::worker
    /// [`AgentBatch`]: stateful::agent::AgentBatch
    Distributed(StateBatchDistribution),
    /// The [`Task`] isn't distributed across [`worker`]s.
    ///
    /// [`Task`]: crate::task::Task
    /// [`worker`]: crate::worker
    None,
}
