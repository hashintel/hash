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
};

#[derive(Debug)]
/// TODO: doc
pub struct RunnerTaskMessage {
    pub package_id: PackageId,
    pub task_id: TaskId,
    pub group_index: Option<usize>,
    pub payload: TaskMessage,
    pub shared_store: TaskSharedStore,
}

#[derive(Debug)]
/// TODO: doc
pub struct TargetedRunnerTaskMsg {
    pub target: MessageTarget,
    pub msg: RunnerTaskMessage,
}

#[derive(Debug)]
/// TODO: doc
pub struct StateInterimSync {
    pub shared_store: TaskSharedStore,
}

#[derive(Clone, Debug)]
/// TODO: doc
pub struct PackageMsgs(pub HashMap<PackageId, PackageInitMsgForWorker>);

#[derive(Debug, Clone)]
/// TODO: doc
pub struct NewSimulationRun {
    pub span: Span,
    pub short_id: SimulationId,
    pub worker_allocation: Arc<WorkerAllocation>,
    pub packages: PackageMsgs,
    pub datastore: DatastoreSimulationPayload,
    pub globals: Arc<Globals>,
}

#[derive(Clone)]
/// TODO: doc
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
/// TODO: doc
struct DatastoreInit {
    pub agent_batch_schema: Vec<u8>,
    pub message_batch_schema: Vec<u8>,
    pub context_batch_schema: Vec<u8>,
    pub shared_context: SharedStore,
}

#[derive(Clone)]
/// TODO: doc
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
