//! Definitions to run a [`package`].
//!
//! A [`Task`] contains information to run a package. Each [`PackageType`] has different tasks
//! depending on the packages.
//!
//! [`package`]: crate::package
//! [`PackageType`]: crate::package::PackageType

mod cancel;
mod distribution;
mod message;
mod shared_store;

use async_trait::async_trait;

pub use self::{
    cancel::CancelTask,
    message::{TaskMessage, TaskResultOrCancelled},
    shared_store::TaskSharedStore,
};
pub(crate) use self::{
    distribution::{StateBatchDistribution, TaskDistributionConfig},
    message::TargetedTaskMessage,
    shared_store::{PartialSharedState, SharedContext, SharedState, TaskSharedStoreBuilder},
};
use crate::Result;

/// Information to run a [`Package`].
///
/// [`Package`]: crate::package::Package
pub trait Task {
    /// Provides a human-readable name of the [`Task`], e.g. `"BehaviorExecution"`.
    fn name(&self) -> &'static str;

    /// Defines if a [`Task`] has a distributed (split across [`worker`]s) execution.
    ///
    /// [`Task`]: crate::task::Task
    /// [`worker`]: crate::worker
    fn distribution(&self) -> TaskDistributionConfig {
        TaskDistributionConfig::None
    }
}

/// Validates if a [`Task`] is allowed to access a [`TaskSharedStore`].
pub trait StoreAccessValidator: Task {
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
    /// [`Task`]: crate::task::Task
    /// [`InitTask`]: crate::package::init::InitTask
    /// [`SharedState`]: crate::task::SharedState
    /// [`SharedContext`]: crate::task::SharedContext
    /// [`AccessNotAllowed`]: crate::error::Error::AccessNotAllowed
    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()>;
}

#[async_trait]
pub trait ActiveTask: Send {
    /// Waits for a [`TaskResultOrCancelled`] from the associated [`Task`] and returns the
    /// [`TaskMessage`].
    ///
    /// # Errors
    ///
    /// - If the execution of [`Task`] failed and it wasn't able to receive a
    /// [`TaskResultOrCancelled`].
    /// - If the [`Task`] was cancelled during execution.
    ///
    /// [`Task`]: crate::task::Task
    async fn drive_to_completion(mut self) -> Result<TaskMessage>;
}

/// Unique identified for a [`Task`].
pub type TaskId = u128;
