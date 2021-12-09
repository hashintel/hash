use super::active::ActiveTaskExecutorComms;
use crate::{
    datastore::table::{sync::SyncPayload, task_shared_store::TaskSharedStore},
    proto::SimulationShortID,
    simulation::{package::id::PackageId, task::Task},
    types::TaskID,
};

#[derive(new, Debug)]
pub struct WrappedTask {
    pub task_id: TaskID,
    pub package_id: PackageId,
    pub inner: Task,
    pub comms: ActiveTaskExecutorComms,
    pub shared_store: TaskSharedStore,
}

#[derive(Debug)]
pub struct EngineToWorkerPoolMsg {
    pub sim_id: SimulationShortID,
    pub payload: EngineToWorkerPoolMsgPayload,
}

impl EngineToWorkerPoolMsg {
    pub fn task(sim_id: SimulationShortID, task: WrappedTask) -> Self {
        Self {
            sim_id,
            payload: EngineToWorkerPoolMsgPayload::Task(task),
        }
    }

    pub fn sync(sim_id: SimulationShortID, sync_msg: SyncPayload) -> Self {
        Self {
            sim_id,
            payload: EngineToWorkerPoolMsgPayload::Sync(sync_msg),
        }
    }
}

#[derive(Debug)]
pub enum EngineToWorkerPoolMsgPayload {
    Task(WrappedTask),
    Sync(SyncPayload),
}
