use stateful::field::PackageId;
use tracing::Span;

use crate::{
    package::simulation::{PackageTask, SimulationId},
    task::{TaskId, TaskSharedStore},
    worker::SyncPayload,
    worker_pool::comms::active::ActiveTaskExecutorComms,
};

#[derive(Debug)]
pub struct WrappedTask {
    pub task_id: TaskId,
    pub package_id: PackageId,
    pub task: PackageTask,
    pub comms: ActiveTaskExecutorComms,
    pub shared_store: TaskSharedStore,
}

#[derive(Debug)]
pub struct EngineToWorkerPoolMsg {
    pub span: Span,
    pub sim_id: SimulationId,
    pub payload: EngineToWorkerPoolMsgPayload,
}

impl EngineToWorkerPoolMsg {
    pub fn task(sim_id: SimulationId, task: WrappedTask) -> Self {
        Self {
            span: Span::current(),
            sim_id,
            payload: EngineToWorkerPoolMsgPayload::Task(task),
        }
    }

    pub fn sync(sim_id: SimulationId, sync_msg: SyncPayload) -> Self {
        Self {
            span: Span::current(),
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
