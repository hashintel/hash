use hash_types::Agent;
use tracing::Instrument;
use uuid::Uuid;

use crate::{
    datastore::table::task_shared_store::TaskSharedStore,
    simulation::{
        comms::{Comms, Result},
        package::{id::PackageId, PackageType},
        task::{active::ActiveTask, GetTaskName, Task},
    },
};

#[derive(derive_new::new)]
pub struct PackageComms {
    inner: Comms,
    package_id: PackageId,
    _package_type: PackageType, // TODO: unused, remove?
}

impl PackageComms {
    // TODO: UNUSED: Needs triage
    pub fn add_create_agent_command(&mut self, agent: Agent) -> Result<()> {
        self.inner.add_create_agent_command(agent)
    }

    // TODO: UNUSED: Needs triage
    pub fn add_remove_agent_command(&mut self, uuid: Uuid) -> Result<()> {
        self.inner.add_remove_agent_command(uuid)
    }
}

impl PackageComms {
    pub async fn new_task<T: Into<Task>>(
        &self,
        task: T,
        shared_store: TaskSharedStore,
    ) -> Result<ActiveTask> {
        let task = task.into();
        let task_name = task.get_task_name();

        self.inner
            .new_task(self.package_id, task, shared_store)
            .instrument(tracing::debug_span!("Task", name = task_name))
            .await
    }
}
