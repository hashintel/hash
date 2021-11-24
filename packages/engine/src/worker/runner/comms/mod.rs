use std::fmt::{Debug, Formatter};
use std::{collections::HashMap, fmt, sync::Arc};

use crate::config::Globals;
use crate::datastore::schema::state::AgentSchema;
use crate::datastore::shared_store::SharedStore;
use crate::proto::{ExperimentID, SimulationShortID};
use crate::simulation::enum_dispatch::TaskSharedStore;
use crate::simulation::package::id::PackageId;
use crate::simulation::task::msg::TaskMessage;
use crate::{
    datastore::prelude::ArrowSchema,
    simulation::package::worker_init::PackageInitMsgForWorker,
    types::{TaskID, WorkerIndex},
    Language,
};

pub mod inbound;
pub mod outbound;

#[derive(Debug, Clone, Copy)]
pub enum MessageTarget {
    Rust,
    Python,
    JavaScript,
    Dynamic,
    Main,
}

impl From<Language> for MessageTarget {
    fn from(l: Language) -> Self {
        match l {
            Language::Rust => Self::Rust,
            Language::Python => Self::Python,
            Language::JavaScript => Self::JavaScript,
        }
    }
}

// TODO: Group indices have type u32 in RunnerTaskMsg, but usize in StateInterimSync.
#[derive(Debug)]
pub struct RunnerTaskMsg {
    pub package_id: PackageId,
    pub task_id: TaskID,
    pub payload: TaskMessage,
    pub shared_store: TaskSharedStore,
}

#[derive(Debug)]
pub struct TargetedRunnerTaskMsg {
    pub target: MessageTarget,
    pub msg: RunnerTaskMsg,
}

#[derive(Debug)]
pub struct StateInterimSync {
    pub shared_store: TaskSharedStore,
}

pub struct DatastoreInit {
    pub agent_batch_schema: Vec<u8>,
    pub message_batch_schema: Vec<u8>,
    pub context_batch_schema: Vec<u8>,
    pub shared_context: SharedStore,
}

#[derive(Clone, Debug)]
pub struct PackageMsgs(pub HashMap<PackageId, PackageInitMsgForWorker>);

#[derive(Debug, Clone)]
pub struct NewSimulationRun {
    pub short_id: SimulationShortID,
    pub packages: PackageMsgs,
    pub datastore: DatastoreSimulationPayload,
    pub globals: Arc<Globals>,
}

#[derive(new, Clone)]
pub struct DatastoreSimulationPayload {
    pub agent_batch_schema: Arc<AgentSchema>,
    pub message_batch_schema: Arc<ArrowSchema>,
    pub context_batch_schema: Arc<ArrowSchema>,
    pub shared_store: Arc<SharedStore>,
}

impl Debug for DatastoreSimulationPayload {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str("DatastoreSimulationPayload")
    }
}

#[derive(Clone)]
pub struct ExperimentInitRunnerMsgBase {
    pub experiment_id: ExperimentID,
    pub shared_context: Arc<SharedStore>,
    pub package_config: Arc<PackageMsgs>,
}

#[derive(Clone)]
pub struct ExperimentInitRunnerMsg {
    pub experiment_id: ExperimentID,
    pub worker_index: WorkerIndex,
    pub shared_context: Arc<SharedStore>,
    pub package_config: Arc<PackageMsgs>,
}

impl ExperimentInitRunnerMsg {
    pub fn new(
        base: &ExperimentInitRunnerMsgBase,
        worker_index: WorkerIndex,
    ) -> ExperimentInitRunnerMsg {
        let ExperimentInitRunnerMsgBase {
            experiment_id,
            shared_context,
            package_config,
        } = base.clone();
        ExperimentInitRunnerMsg {
            experiment_id,
            worker_index,
            shared_context,
            package_config,
        }
    }
}
