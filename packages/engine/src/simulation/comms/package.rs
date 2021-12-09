use uuid::Uuid;

use super::{Comms, Result};
use crate::{
    datastore::table::task_shared_store::TaskSharedStore,
    hash_types::Agent,
    simulation::{
        package::{id::PackageId, PackageType},
        task::{active::ActiveTask, Task},
    },
};

#[derive(new)]
pub struct PackageComms {
    inner: Comms,
    package_id: PackageId,
    _package_type: PackageType, // TODO: unused, remove?
}

impl PackageComms {
    pub fn add_create_agent_command(&mut self, agent: Agent) -> Result<()> {
        self.inner.add_create_agent_command(agent)
    }

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
        self.inner
            .new_task(self.package_id.clone(), task, shared_store)
            .await
    }
}
