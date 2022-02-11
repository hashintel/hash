/// Describes how a distributed [`Task`] has access to Agent [`State`].
#[derive(Default, Debug)]
pub struct StateBatchDistribution {
    /// `true` - The task will only take a single read lock on each batch, in which case each
    /// batch will be available to only a single worker.
    /// `false` - all workers will have read access to all of agent state.
    pub single_read_access: bool, // TODO: rename this, it seems misleading
}

/// Defines if and how a [`Task`] is executed across multiple [`Worker`]s).
pub enum Config {
    /// The [`Task`] is split up and executed on multiple [`Worker`]s, with access to
    /// [`AgentBatch`]s as defined in the [`StateBatchDistribution`] object.
    Distributed(StateBatchDistribution),
    /// The [`Task`] isn't distributed across [`Worker`]s/
    None,
}
