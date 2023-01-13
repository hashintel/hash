//! Messages to be sent to or received from the runners.

mod inbound;
mod outbound;

use std::{
    collections::HashMap,
    fmt,
    sync::{Arc, Weak},
};

use arrow2::datatypes::Schema;
use stateful::{
    agent::AgentSchema,
    field::PackageId,
    global::{Globals, SharedStore},
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
    package::{experiment::ExperimentId, simulation::SimulationId},
    runner::{MessageTarget, RunnerConfig},
    task::{TaskId, TaskMessage, TaskSharedStore},
    worker::PackageInitMsgForWorker,
    worker_pool::{WorkerAllocation, WorkerIndex},
    Error, Result,
};

/// Contains some data about an inbound task that was sent to a runner's external process,
/// but for which the runner hasn't yet gotten back the corresponding outbound task.
/// This data is useful for reconstructing the outbound message struct later (i.e.
/// converting the outbound FlatBuffers message into a Rust struct).
pub(crate) struct SentTask {
    /// Task shared store from inbound task message.
    pub shared_store: TaskSharedStore,
    /// Top two levels of nesting of task (when serialized as JSON)
    pub task_wrapper: serde_json::Value,
}

#[derive(Debug)]
pub struct RunnerTaskMessage {
    pub package_id: PackageId,
    pub task_id: TaskId,
    pub group_index: Option<usize>,
    pub payload: TaskMessage,
    pub shared_store: TaskSharedStore,
}

#[derive(Debug)]
pub struct TargetedRunnerTaskMsg {
    pub target: MessageTarget,
    pub msg: RunnerTaskMessage,
}

impl TargetedRunnerTaskMsg {
    pub(crate) fn try_from_fbs(
        task_msg: flatbuffers_gen::task_msg_generated::TaskMsg<'_>,
        sent_tasks: &mut HashMap<TaskId, SentTask>,
    ) -> Result<Self> {
        let task_id = TaskId::from_bytes(task_msg.task_id().0);

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
    pub shared_store: TaskSharedStore,
}

#[derive(Clone, Debug)]
pub struct PackageMsgs(pub HashMap<PackageId, PackageInitMsgForWorker>);

#[derive(Debug, Clone)]
pub struct NewSimulationRun {
    pub span: Span,
    pub short_id: SimulationId,
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
    pub shared_store: Weak<SharedStore>,
}

impl DatastoreSimulationPayload {
    pub fn new(
        agent_batch_schema: Arc<AgentSchema>,
        message_batch_schema: Arc<Schema>,
        context_batch_schema: Arc<Schema>,
        shared_store: Weak<SharedStore>,
    ) -> Self {
        Self {
            agent_batch_schema,
            message_batch_schema,
            context_batch_schema,
            shared_store,
        }
    }
}

impl fmt::Debug for DatastoreSimulationPayload {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("DatastoreSimulationPayload")
    }
}

#[allow(dead_code)]
struct DatastoreInit {
    pub agent_batch_schema: Vec<u8>,
    pub message_batch_schema: Vec<u8>,
    pub context_batch_schema: Vec<u8>,
    pub shared_context: SharedStore,
}

#[derive(Clone)]
pub struct ExperimentInitRunnerMsgBase {
    pub experiment_id: ExperimentId,
    pub shared_context: Weak<SharedStore>,
    pub package_config: Arc<PackageMsgs>,
    pub runner_config: RunnerConfig,
}

#[derive(Clone)]
pub struct ExperimentInitRunnerMsg {
    pub experiment_id: ExperimentId,
    pub worker_index: WorkerIndex,
    pub shared_context: Weak<SharedStore>,
    pub package_config: Arc<PackageMsgs>,
    pub runner_config: RunnerConfig,
}

impl ExperimentInitRunnerMsg {
    pub fn new(
        base: &ExperimentInitRunnerMsgBase,
        worker_index: WorkerIndex,
    ) -> ExperimentInitRunnerMsg {
        ExperimentInitRunnerMsg {
            experiment_id: base.experiment_id,
            worker_index,
            shared_context: base.shared_context.clone(),
            package_config: base.package_config.clone(),
            runner_config: base.runner_config.clone(),
        }
    }
}
