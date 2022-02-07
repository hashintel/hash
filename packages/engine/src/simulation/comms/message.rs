use tracing::Span;

use super::active::ActiveTaskExecutorComms;
use crate::{
    datastore::table::{sync::SyncPayload, task_shared_store::TaskSharedStore},
    proto::SimulationShortId,
    simulation::{package::id::PackageId, task::Task},
    types::TaskId,
    worker::error::Result as WorkerResult,
};

pub type SyncCompletionReceiver = tokio::sync::oneshot::Receiver<WorkerResult<()>>;
pub type SyncCompletionSender = tokio::sync::oneshot::Sender<WorkerResult<()>>;

#[derive(derive_new::new, Debug)]
pub struct WrappedTask {
    pub task_id: TaskId,
    pub package_id: PackageId,
    pub inner: Task,
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
