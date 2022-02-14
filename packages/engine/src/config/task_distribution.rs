/// Describes how a distributed [`Task`] has access to Agent [`State`].
#[derive(Default, Debug)]
pub struct StateBatchDistribution {
    /// - `true` - The [`Task`] is executed across multiple [`Worker`]s, and Agent [`State`] is
    /// partitioned across them. As such each `Group` is only available to a single
    /// [`Worker`]. That is, there's an surjection of `Group`s to [`Worker`]s.
    ///
    ///   Because of this, the [`Task`] is able to take write-access to the
    /// `Group`s
    ///
    /// - `false` - [Worker]s have access to all of Agent [`State`] and thus all `Group`s.
    ///
    ///   Because of this, there can only be read-access to the `Group`s
    pub partitioned_batches: bool,
}

/// Defines if and how a [`Task`] is executed across multiple [`Worker`]s).
pub enum Config {
    /// The [`Task`] is split up and executed on multiple [`Worker`]s, with access to
    /// [`AgentBatch`]s as defined in the [`StateBatchDistribution`] object.
    Distributed(StateBatchDistribution),
    /// The [`Task`] isn't distributed across [`Worker`]s/
    None,
}
