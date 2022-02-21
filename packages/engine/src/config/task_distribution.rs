/// Describes how a distributed [`Task`] has access to Agent [`State`].
///
/// [`Task`]: crate::simulation::task::Task
/// [`State`]: crate::datastore::table::state::State
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
    /// [`Task`]: crate::simulation::task::Task
    /// [`State`]: crate::datastore::table::state::State
    /// [`worker`]: crate::worker
    pub partitioned_batches: bool,
}

/// Defines if and how a [`Task`] is executed across multiple [`worker`]s).
///
/// [`Task`]: crate::simulation::task::Task
/// [`worker`]: crate::worker
pub enum Config {
    /// The [`Task`] is split up and executed on multiple [`worker`]s, with access to
    /// [`AgentBatch`]s as defined in the [`StateBatchDistribution`] object.
    ///
    /// [`Task`]: crate::simulation::task::Task
    /// [`worker`]: crate::worker
    /// [`AgentBatch`]: crate::datastore::batch::agent::Batch
    Distributed(StateBatchDistribution),
    /// The [`Task`] isn't distributed across [`worker`]s.
    ///
    /// [`Task`]: crate::simulation::task::Task
    /// [`worker`]: crate::worker
    None,
}
