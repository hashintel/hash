use crate::simulation::package::{id::PackageId, PackageType};
use crate::simulation::task::{active::ActiveTask, Task};

use crate::datastore::table::task_shared_store::TaskSharedStore;
use crate::hash_types::Agent;
use uuid::Uuid;

use super::{Comms, Result};

#[derive(new)]
pub struct PackageComms {
    inner: Comms,
    package_id: PackageId,
    package_type: PackageType,
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
