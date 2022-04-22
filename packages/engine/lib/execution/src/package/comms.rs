use async_trait::async_trait;
use stateful::field::PackageId;

use crate::{
    package::PackageTask,
    task::{ActiveTask, SharedStore},
    Result,
};

/// Temporary trait to proceed with moving the package system into this crate
#[async_trait]
pub trait Comms: Send + Sync + 'static {
    type ActiveTask: ActiveTask;

    /// Takes a given [`Task`] object, and starts its execution on the [`workerpool`], returning an
    /// [`ActiveTask`] to track its progress.
    ///
    /// [`workerpool`]: crate::workerpool
    async fn new_task(
        &self,
        package_id: PackageId,
        task: PackageTask,
        shared_store: SharedStore,
    ) -> Result<Self::ActiveTask>;
}
