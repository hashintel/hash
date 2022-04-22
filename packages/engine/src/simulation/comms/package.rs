use execution::{
    package::{PackageTask, PackageType},
    task::{SharedStore, Task},
};
use stateful::field::PackageId;
use tracing::Instrument;

#[derive(derive_new::new)]
pub struct PackageComms<C> {
    comms: C,
    package_id: PackageId,
    _package_type: PackageType, // TODO: unused, remove?
}

// impl PackageComms {
//     // TODO: UNUSED: Needs triage
//     pub fn add_create_agent_command(&mut self, agent: Agent) -> Result<()> {
//         self.comms.add_create_agent_command(agent)
//     }
//
//     // TODO: UNUSED: Needs triage
//     pub fn add_remove_agent_command(&mut self, uuid: Uuid) -> Result<()> {
//         self.comms.add_remove_agent_command(uuid)
//     }
// }

impl<C: execution::package::Comms> PackageComms<C> {
    pub async fn new_task(
        &self,
        task: PackageTask,
        shared_store: SharedStore,
    ) -> execution::Result<C::ActiveTask> {
        let task_name = task.name();

        self.comms
            .new_task(self.package_id, task, shared_store)
            .instrument(tracing::debug_span!("Task", name = task_name))
            .await
    }
}
