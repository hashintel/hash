use std::fmt::{Debug, Formatter};
use std::{collections::HashMap, fmt, sync::Arc};

use crate::config::{EngineConfig, Globals};
use crate::datastore::schema::state::AgentSchema;
use crate::datastore::shared_store::SharedStore;
use crate::proto::{ExperimentID, SimulationShortID};
use crate::simulation::enum_dispatch::TaskSharedStore;
use crate::simulation::package::id::PackageId;
use crate::simulation::task::msg::TaskMessage;
use crate::worker::{Error, Result};
use crate::{
    datastore::prelude::ArrowSchema,
    simulation::package::worker_init::PackageInitMsgForWorker,
    types::{TaskID, WorkerIndex},
    Language, SimulationConfig,
};

pub mod inbound;
pub mod outbound;

/// Contains some data about an inbound task that was sent to a runner's external process,
/// but for which the runner hasn't yet gotten back the corresponding outbound task.
/// This data is useful for reconstructing the outbound message struct later (i.e.
/// converting the outbound flatbuffers message into a Rust struct).
///
/// Fields:
/// `shared_store`: Task shared store from inbound task message
/// `task_wrapper`: Top two levels of nesting of task (when serialized as JSON)
pub struct SentTask {
    pub shared_store: TaskSharedStore,
    pub task_wrapper: serde_json::Value,
}

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

impl From<crate::gen::target_generated::Target> for MessageTarget {
    fn from(target: crate::gen::target_generated::Target) -> Self {
        match target {
            crate::gen::target_generated::Target::Rust => Self::Rust,
            crate::gen::target_generated::Target::Python => Self::Python,
            crate::gen::target_generated::Target::JavaScript => Self::JavaScript,
            crate::gen::target_generated::Target::Dynamic => Self::Dynamic,
            crate::gen::target_generated::Target::Main => Self::Main,
            _ => unreachable!(),
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

impl TargetedRunnerTaskMsg {
    pub fn try_from_fbs(
        task_msg: crate::gen::runner_outbound_msg_generated::TaskMsg,
        sent_tasks: &mut HashMap<TaskID, SentTask>,
    ) -> Result<Self> {
        let task_id = task_msg.task_id().ok_or_else(|| {
            Error::from("The TaskMessage from the runner didn't have a required task_id field")
        })?;
        let task_id = uuid::Uuid::from_slice(&task_id.0)?.as_u128();

        let sent = sent_tasks.remove(&task_id).ok_or_else(|| {
            Error::from(format!("Outbound message w/o sent task id {:?}", task_id))
        })?;

        let target = task_msg.target().into();
        let package_id = (task_msg.package_sid() as usize).into();

        let inner_msg: serde_json::Value = serde_json::from_slice(task_msg.payload().inner())?;
        let payload = TaskMessage::try_from_inner_msg_and_wrapper(inner_msg, sent.task_wrapper);
        // TODO: Error message duplication with JS runner
        let payload = payload.map_err(|e| Error::from(format!(
            "Failed to wrap and create a new TaskMessage, perhaps the inner: {:?}, was formatted incorrectly. Underlying error: {}",
            std::str::from_utf8(task_msg.payload().inner()),
            e.to_string()
        )))?;

        Ok(Self {
            target,
            msg: RunnerTaskMsg {
                package_id,
                task_id,
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
    pub engine_config: Arc<EngineConfig>,
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
