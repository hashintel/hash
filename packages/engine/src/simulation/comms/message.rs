use execution::{package::PackageTask, task::SharedStore};
use stateful::field::PackageId;
use tracing::Span;

use crate::{
    datastore::table::sync::SyncPayload, proto::SimulationShortId,
    simulation::comms::active::ActiveTaskExecutorComms, types::TaskId,
    worker::Result as WorkerResult,
};

pub type SyncCompletionReceiver = tokio::sync::oneshot::Receiver<WorkerResult<()>>;
pub type SyncCompletionSender = tokio::sync::oneshot::Sender<WorkerResult<()>>;

#[derive(derive_new::new, Debug)]
pub struct WrappedTask {
    pub task_id: TaskId,
    pub package_id: PackageId,
    pub inner: PackageTask,
    pub comms: ActiveTaskExecutorComms,
    pub shared_store: SharedStore,
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
