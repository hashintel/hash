use async_trait::async_trait;
use stateful::{agent::Agent, field::PackageId};
use tracing::Instrument;
use uuid::Uuid;

use crate::{
    package::{PackageTask, PackageType},
    task::{ActiveTask, Task, TaskSharedStore},
    Result,
};

/// Temporary trait to proceed with moving the package system into this crate
#[async_trait]
pub trait Comms: Send + Sync + 'static {
    type ActiveTask: ActiveTask;

    /// Takes a given [`Task`] object, and starts its execution on the [`worker_pool`], returning an
    /// [`ActiveTask`] to track its progress.
    ///
    /// [`worker_pool`]: crate::worker_pool
    async fn new_task(
        &self,
        package_id: PackageId,
        task: PackageTask,
        shared_store: TaskSharedStore,
    ) -> Result<Self::ActiveTask>;

    /// Adds a command to create the specified [`Agent`].
    ///
    /// # Errors
    ///
    /// This function can fail if it's unable to acquire a write lock.
    fn add_create_agent_command(&mut self, agent: Agent) -> Result<()>;

    /// Adds a command to removed the [`Agent`] specified by it's `agent_id`.
    ///
    /// # Errors
    ///
    /// This function can fail if it's unable to acquire a write lock.
    fn add_remove_agent_command(&mut self, agent_id: Uuid) -> Result<()>;
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
        shared_store: TaskSharedStore,
    ) -> Result<C::ActiveTask> {
        let task_name = task.name();

        self.comms
            .new_task(self.package_id, task, shared_store)
            .instrument(tracing::debug_span!("Task", name = task_name))
            .await
    }

    /// Adds a command to create the specified [`Agent`].
    ///
    /// # Errors
    ///
    /// This function can fail if it's unable to acquire a write lock.
    // TODO: This is currently unused as messages are used to add agents, however, other packages
    //   may should be able to add agents as well
    pub fn add_create_agent_command(&mut self, agent: Agent) -> Result<()> {
        self.comms.add_create_agent_command(agent)
    }

    /// Adds a command to removed the [`Agent`] specified by it's `agent_id`.
    ///
    /// # Errors
    ///
    /// This function can fail if it's unable to acquire a write lock.
    // TODO: This is currently unused as messages are used to remove agents, however, other packages
    //   may should be able to remove agents as well
    pub fn add_remove_agent_command(&mut self, uuid: Uuid) -> Result<()> {
        self.comms.add_remove_agent_command(uuid)
    }
}
