use async_trait::async_trait;
use stateful::field::PackageId;
use tracing::Instrument;

use crate::{
    package::{PackageTask, PackageType},
    task::{ActiveTask, SharedStore, Task},
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

pub struct PackageComms<C> {
    comms: C,
    package_id: PackageId,
    _package_type: PackageType, // TODO: unused, remove?
}

impl<C> PackageComms<C> {
    pub fn new(comms: C, package_id: PackageId, package_type: PackageType) -> Self {
        Self {
            comms,
            package_id,
            _package_type: package_type,
        }
    }
}

impl<C: Comms> PackageComms<C> {
    pub async fn new_task(
        &self,
        task: PackageTask,
        shared_store: SharedStore,
    ) -> Result<C::ActiveTask> {
        let task_name = task.name();

        self.comms
            .new_task(self.package_id, task, shared_store)
            .instrument(tracing::debug_span!("Task", name = task_name))
            .await
    }

    //     // TODO: UNUSED: Needs triage
    //     pub fn add_create_agent_command(&mut self, agent: Agent) -> Result<()> {
    //         self.comms.add_create_agent_command(agent)
    //     }
    //
    //     // TODO: UNUSED: Needs triage
    //     pub fn add_remove_agent_command(&mut self, uuid: Uuid) -> Result<()> {
    //         self.comms.add_remove_agent_command(uuid)
    //     }
}
