mod distribution;
mod shared_store;

pub use self::{
    distribution::{StateBatchDistribution, TaskDistributionConfig},
    shared_store::{
        PartialSharedState, PartialStateReadProxy, PartialStateWriteProxy, SharedContext,
        SharedState, SharedStore, TaskSharedStoreBuilder,
    },
};
use crate::Result;

pub trait Task {
    /// Provides a human-readable name of the [`Task`], e.g. `"BehaviorExecution"`.
    fn name(&self) -> &'static str;

    /// Defines if a [`Task`] has a distributed (split across [`worker`]s) execution.
    ///
    /// [`Task`]: crate::simulation::task::Task
    /// [`worker`]: crate::worker
    fn distribution(&self) -> TaskDistributionConfig {
        TaskDistributionConfig::None
    }

    /// Ensures that the [`Task`] variant has the correct permissions on the [`SharedState`] and
    /// [`SharedContext`] objects that make up the [`TaskSharedStore`].
    ///
    /// The intended implementation, is that this trait is implemented for each package-group, e.g.
    /// rather than being implemented on `JsPyInitTask`, it's implemented on the [`InitTask`]
    /// variant, as all Initialization packages should have the same access expectations.
    ///
    /// # Errors
    ///
    /// The implementation should error with [`AccessNotAllowed`] if the permissions don't match up.
    ///
    /// [`Task`]: crate::simulation::task::Task
    /// [`SharedState`]: crate::datastore::table::task_shared_store::SharedState
    /// [`SharedContext`]: crate::datastore::table::task_shared_store::SharedContext
    /// [`AccessNotAllowed`]: crate::simulation::error::Error::AccessNotAllowed
    fn verify_store_access(&self, access: &SharedStore) -> Result<()>;
}
