use execution::{
    package::PackageTask,
    task::{TaskId, TaskSharedStore},
    worker::SyncPayload,
};
use simulation_structure::SimulationShortId;
use stateful::field::PackageId;
use tracing::Span;

use crate::simulation::comms::active::ActiveTaskExecutorComms;

#[derive(derive_new::new, Debug)]
pub struct WrappedTask {
    pub task_id: TaskId,
    pub package_id: PackageId,
    pub inner: PackageTask,
    pub comms: ActiveTaskExecutorComms,
    pub shared_store: TaskSharedStore,
}

#[derive(Debug)]
pub struct EngineToWorkerPoolMsg {
    pub span: Span,
    pub sim_id: SimulationShortId,
    pub payload: EngineToWorkerPoolMsgPayload,
}

impl EngineToWorkerPoolMsg {
    pub fn task(sim_id: SimulationShortId, task: WrappedTask) -> Self {
        Self {
            span: Span::current(),
            sim_id,
            payload: EngineToWorkerPoolMsgPayload::Task(task),
        }
    }

    pub fn sync(sim_id: SimulationShortId, sync_msg: SyncPayload) -> Self {
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
