mod inbound;
mod outbound;

use std::{collections::HashMap, fmt, sync::Arc};

use arrow::datatypes::Schema;
use simulation_structure::SimulationShortId;
use stateful::{
    agent::AgentSchema,
    field::PackageId,
    global::{Globals, SharedDatasets},
};
use tracing::Span;

pub use self::{
    inbound::{InboundToRunnerMsg, InboundToRunnerMsgPayload},
    outbound::{
        OutboundFromRunnerMsg, OutboundFromRunnerMsgPayload, PackageError, RunnerError, UserError,
        UserWarning,
    },
};
use crate::{
    runner::MessageTarget,
    task::{SharedStore, TaskId, TaskMessage},
    worker::PackageInitMsgForWorker,
    worker_pool::WorkerAllocation,
    Error, Result,
};

/// Contains some data about an inbound task that was sent to a runner's external process,
/// but for which the runner hasn't yet gotten back the corresponding outbound task.
/// This data is useful for reconstructing the outbound message struct later (i.e.
/// converting the outbound FlatBuffers message into a Rust struct).
// TODO: UNUSED: Needs triage
pub struct SentTask {
    /// Task shared store from inbound task message.
    pub shared_store: SharedStore,
    /// Top two levels of nesting of task (when serialized as JSON)
    pub task_wrapper: serde_json::Value,
}

#[derive(Debug)]
pub struct RunnerTaskMessage {
    pub package_id: PackageId,
    pub task_id: TaskId,
    pub group_index: Option<usize>,
    pub payload: TaskMessage,
    pub shared_store: SharedStore,
}

#[derive(Debug)]
pub struct TargetedRunnerTaskMsg {
    pub target: MessageTarget,
    pub msg: RunnerTaskMessage,
}

impl TargetedRunnerTaskMsg {
    // TODO: UNUSED: Needs triage
    #[allow(unreachable_code, unused_variables)]
    pub fn try_from_fbs(
        task_msg: flatbuffers_gen::task_msg_generated::TaskMsg<'_>,
        sent_tasks: &mut HashMap<TaskId, SentTask>,
    ) -> Result<Self> {
        let task_id = TaskId::from_le_bytes(task_msg.task_id().0);

        let sent = sent_tasks.remove(&task_id).ok_or_else(|| {
            Error::from(format!("Outbound message w/o sent task id {:?}", task_id))
        })?;

        let target = task_msg.target().into();
        let package_id = (task_msg.package_sid() as usize).into();
        // TODO: our version of flatbuffers doesn't let us have optional Scalars
        let group_index = task_msg.group_index().map(|val| val.inner() as usize);

        let inner_msg: serde_json::Value = serde_json::from_slice(task_msg.payload().inner())?;
        let payload = TaskMessage::try_from_inner_msg_and_wrapper(inner_msg, sent.task_wrapper);
        // TODO: Error message duplication with JS runner
        let payload = payload.map_err(|e| {
            Error::from(format!(
                "Failed to wrap and create a new TaskMessage, perhaps the inner: {:?}, was \
                 formatted incorrectly. Underlying error: {}",
                std::str::from_utf8(task_msg.payload().inner()),
                e
            ))
        })?;

        Ok(Self {
            target,
            msg: RunnerTaskMessage {
                package_id,
                task_id,
                group_index,
                payload,
                shared_store: sent.shared_store,
            },
        })
    }
}

#[derive(Debug)]
pub struct StateInterimSync {
    pub shared_store: SharedStore,
}

#[derive(Clone, Debug)]
pub struct PackageMsgs(pub HashMap<PackageId, PackageInitMsgForWorker>);

#[derive(Debug, Clone)]
pub struct NewSimulationRun {
    pub span: Span,
    pub short_id: SimulationShortId,
    pub worker_allocation: Arc<WorkerAllocation>,
    pub packages: PackageMsgs,
    pub datastore: DatastoreSimulationPayload,
    pub globals: Arc<Globals>,
}

#[derive(Clone)]
pub struct DatastoreSimulationPayload {
    pub agent_batch_schema: Arc<AgentSchema>,
    pub message_batch_schema: Arc<Schema>,
    pub context_batch_schema: Arc<Schema>,
    pub shared_store: Arc<SharedDatasets>,
}

impl fmt::Debug for DatastoreSimulationPayload {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("DatastoreSimulationPayload")
    }
}
