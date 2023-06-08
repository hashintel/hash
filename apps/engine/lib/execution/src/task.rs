//! Definitions to run a simulation [`package`].
//!
//! A [`Task`] contains information to run a package. Each [`PackageType`] has different tasks
//! depending on the packages. Packages are able to execute logic on the runners through the use of
//! [`Task`] objects.
//!
//! # General Flow
//!
//! Tasks are created within the implementation of a Package, from there they are then sent to the
//! [`WorkerPool`], which in turn distributes it to [`Worker`]s as necessary, which then execute the
//! task across the Language Runners. The Language Runners call the Package's implementations in the
//! respective language (e.g. _package.py_) and after a [`Task`] has finished executing, its results
//! follow a similar path back up the chain to the main Package impl. This allows Packages to be
//! fully in control of their respective logic in any of the supported languages, the structure of
//! the [`Task`] objects, and the structure of all [`TaskMessage`]s sent between the various
//! components.
//!
//! For the initial message to a Language Runner, the [`WorkerHandler::start_message`] trait method
//! is called to create the first instance of the [`TargetedTaskMessage`] which has a
//! [`MessageTarget`] of `Python`, `JavaScript`, `Rust`, `Dynamic`, or `Main` (Refer to the docs on
//! the enum for further implementation details, especially around the `Dynamic` variant). This is
//! then sent to the package implementation in the respective target language. For example, a
//! [`TargetedTaskMessage`] with a target of [`MessageTarget::Python`] will be executed through the
//! `package.py` script found within the package folder. Once the task has been executed on the
//! target, a new [`TargetedTaskMessage`] is then returned with a new target. The execution
//! continues in a similar fashion, where [`TargetedTaskMessage`]s are sent to their appropriate
//! destination until one is received which is targeted at [`MessageTarget::Main`] which marks the
//! end of the execution.
//!
//! [`Worker`]: crate::worker::Worker
//! [`WorkerPool`]: crate::worker_pool::WorkerPool
//! [`WorkerHandler::start_message`]: crate::worker::WorkerHandler::start_message
//! [`PackageType`]: crate::package::simulation::PackageType
//! [`package`]: crate::package::simulation
//! [`MessageTarget`]: crate::runner::MessageTarget
//! [`MessageTarget::Python`]: crate::runner::MessageTarget::Python
//! [`MessageTarget::Main`]: crate::runner::MessageTarget::Main

mod active;
mod cancel;
mod distribution;
mod message;
mod shared_store;

use std::fmt;

use serde::{Deserialize, Serialize};
use stateful::field::UUID_V4_LEN;
use uuid::Uuid;

pub use self::{
    active::ActiveTask,
    cancel::CancelTask,
    message::{TargetedTaskMessage, TaskMessage, TaskResultOrCancelled},
    shared_store::{SharedContext, SharedState, TaskSharedStore},
};
pub(crate) use self::{
    distribution::{StateBatchDistribution, TaskDistributionConfig},
    shared_store::{PartialSharedState, TaskSharedStoreBuilder},
};
use crate::Result;

/// Information to run a [`Package`].
///
/// [`Package`]: crate::package::simulation::Package
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
    /// [`InitTask`]: crate::package::simulation::init::InitTask
    /// [`SharedState`]: crate::task::SharedState
    /// [`SharedContext`]: crate::task::SharedContext
    /// [`AccessNotAllowed`]: crate::error::Error::AccessNotAllowed
    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()>;
}

/// Unique identifier for a [`Task`].
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct TaskId {
    id: Uuid,
}

impl TaskId {
    pub fn generate() -> Self {
        Self { id: Uuid::new_v4() }
    }

    pub fn from_slice(b: &[u8]) -> Result<Self> {
        Ok(Self {
            id: Uuid::from_slice(b)?,
        })
    }

    pub fn from_bytes(b: [u8; UUID_V4_LEN]) -> Self {
        Self {
            id: Uuid::from_bytes(b),
        }
    }

    pub fn as_bytes(&self) -> &[u8; UUID_V4_LEN] {
        self.id.as_bytes()
    }
}

impl fmt::Display for TaskId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.serialize(fmt)
    }
}
