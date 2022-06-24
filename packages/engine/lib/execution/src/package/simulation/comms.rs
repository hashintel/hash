use stateful::field::PackageId;

use crate::{
    package::simulation::{PackageTask, SimulationId},
    task::{ActiveTask, StoreAccessValidator, TaskId, TaskSharedStore},
    worker_pool,
    worker_pool::comms::{
        main::MainMsgSend,
        message::{EngineToWorkerPoolMsg, WrappedTask},
    },
    Error, Result,
};

pub struct PackageComms {
    /// The ID of the package that this Comms object is associated with.
    package_id: PackageId,
    /// The ID of the simulation that information pertains to.
    simulation_id: SimulationId,
    /// A sender to communicate with the [`WorkerPool`].
    ///
    /// [`WorkerPool`]: crate::worker_pool::WorkerPool
    worker_pool_sender: MainMsgSend,
}

impl PackageComms {
    pub fn new(
        package_id: PackageId,
        simulation_id: SimulationId,
        worker_pool_sender: MainMsgSend,
    ) -> Self {
        Self {
            package_id,
            simulation_id,
            worker_pool_sender,
        }
    }

    /// Takes a given [`Task`] object, and starts its execution on the [`WorkerPool`], returning an
    /// [`ActiveTask`] to track its progress.
    ///
    /// [`Task`]: crate::task::Task
    /// [`WorkerPool`]: crate::worker_pool::WorkerPool
    pub async fn new_task(
        &self,
        task: PackageTask,
        shared_store: TaskSharedStore,
    ) -> Result<ActiveTask> {
        let task_id = TaskId::generate();
        let (wrapped, active) = Self::wrap_task(task_id, self.package_id, task, shared_store)?;
        self.worker_pool_sender
            .send(EngineToWorkerPoolMsg::task(self.simulation_id, wrapped))
            .map_err(|e| Error::from(format!("Worker pool error: {:?}", e)))?;
        Ok(active)
    }

    /// Turns a given [`Task`] into a [`WrappedTask`] and [`ActiveTask`] pair.
    ///
    /// This includes setting up the appropriate communications to be sent to the [`WorkerPool`] and
    /// to be made accessible to the Package that created the task.
    ///
    /// # Errors
    ///
    /// If the [`Task`] needs more access than the provided [`TaskSharedStore`] has.
    ///
    /// [`Task`]: crate::task::Task
    /// [`WorkerPool`]: crate::worker_pool::WorkerPool
    fn wrap_task(
        task_id: TaskId,
        package_id: PackageId,
        task: PackageTask,
        shared_store: TaskSharedStore,
    ) -> Result<(WrappedTask, ActiveTask)> {
        task.verify_store_access(&shared_store)?;
        let (owner_channels, executor_channels) = worker_pool::comms::active::comms();
        let wrapped = WrappedTask {
            task_id,
            package_id,
            task,
            comms: executor_channels,
            shared_store,
        };
        let active = ActiveTask::new(owner_channels);
        Ok((wrapped, active))
    }
}
