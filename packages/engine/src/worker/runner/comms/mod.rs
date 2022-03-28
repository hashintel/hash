use std::{
    collections::HashMap,
    fmt,
    fmt::{Debug, Formatter},
    sync::Arc,
};

use arrow::datatypes::Schema;
use tracing::Span;

use crate::{
    config::{EngineConfig, Globals},
    datastore::{schema::state::AgentSchema, shared_store::SharedStore},
    language::Language,
    proto::{ExperimentId, SimulationShortId},
    simulation::{
        enum_dispatch::TaskSharedStore,
        package::{id::PackageId, worker_init::PackageInitMsgForWorker},
        task::msg::TaskMessage,
    },
    types::{TaskId, WorkerIndex},
    worker::{Error, Result},
};

pub mod inbound;
pub mod outbound;

/// Contains some data about an inbound task that was sent to a runner's external process,
/// but for which the runner hasn't yet gotten back the corresponding outbound task.
/// This data is useful for reconstructing the outbound message struct later (i.e.
/// converting the outbound FlatBuffers message into a Rust struct).
///
/// Fields:
/// `shared_store`: Task shared store from inbound task message
/// `task_wrapper`: Top two levels of nesting of task (when serialized as JSON)
// TODO: UNUSED: Needs triage
pub struct SentTask {
    pub shared_store: TaskSharedStore,
    pub task_wrapper: serde_json::Value,
}

/// Possible targets for a [`TargetedTaskMessage`] to be forwarded to by the `Worker`.
///
/// The execution chain of a `Task` is described within the docs for the
/// [`Task`](crate::simulation::task) module. This enum marks all possible targets that a [`Task`]
/// can be sent to.
///
/// [`TargetedTaskMessage`]: crate::simulation::task::msg::TargetedTaskMessage
#[derive(Debug, Clone, Copy)]
pub enum MessageTarget {
    /// The message should be forwarded to _package.rs_ implementation and executed on the Rust
    /// Language Runner.
    Rust,
    /// The message should be forwarded to _package.py_ implementation and executed on the
    /// Python Language Runner.
    Python,
    /// The message should be forwarded to _package.js_ implementation and executed on the
    /// JavaScript Language Runner.
    JavaScript,
    /// The Package implementation is responsible for deciding the routing of the message. This is
    /// decided by passing it to the [`WorkerHandler::handle_worker_message()`] implementation of
    /// the [`Task`].
    ///
    /// [`Task`]: crate::simulation::task::Task
    /// [`WorkerHandler::handle_worker_message()`]: crate::simulation::task::handler::worker::WorkerHandler::handle_worker_message
    Dynamic,
    /// The [`Task`] execution has finished, and the message is the terminating (result) message.
    ///
    /// [`Task`]: crate::simulation::task::Task
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

impl From<flatbuffers_gen::target_generated::Target> for MessageTarget {
    fn from(target: flatbuffers_gen::target_generated::Target) -> Self {
        match target {
            flatbuffers_gen::target_generated::Target::Rust => Self::Rust,
            flatbuffers_gen::target_generated::Target::Python => Self::Python,
            flatbuffers_gen::target_generated::Target::JavaScript => Self::JavaScript,
            flatbuffers_gen::target_generated::Target::Dynamic => Self::Dynamic,
            flatbuffers_gen::target_generated::Target::Main => Self::Main,
            _ => unreachable!(),
        }
    }
}

impl From<MessageTarget> for flatbuffers_gen::target_generated::Target {
    fn from(target: MessageTarget) -> Self {
        match target {
            MessageTarget::Rust => Self::Rust,
            MessageTarget::Python => Self::Python,
            MessageTarget::JavaScript => Self::JavaScript,
            MessageTarget::Dynamic => Self::Dynamic,
            MessageTarget::Main => Self::Main,
        }
    }
}

#[derive(Debug)]
pub struct RunnerTaskMsg {
    pub package_id: PackageId,
    pub task_id: TaskId,
    pub group_index: Option<usize>,
    pub payload: TaskMessage,
    pub shared_store: TaskSharedStore,
}

#[derive(Debug)]
pub struct TargetedRunnerTaskMsg {
    pub target: MessageTarget,
    pub msg: RunnerTaskMsg,
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
            msg: RunnerTaskMsg {
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

// TODO: UNUSED: Needs triage
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
    pub span: Span,
    pub short_id: SimulationShortId,
    pub engine_config: Arc<EngineConfig>,
    pub packages: PackageMsgs,
    pub datastore: DatastoreSimulationPayload,
    pub globals: Arc<Globals>,
}

#[derive(derive_new::new, Clone)]
pub struct DatastoreSimulationPayload {
    pub agent_batch_schema: Arc<AgentSchema>,
    pub message_batch_schema: Arc<Schema>,
    pub context_batch_schema: Arc<Schema>,
    pub shared_store: Arc<SharedStore>,
}

impl Debug for DatastoreSimulationPayload {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str("DatastoreSimulationPayload")
    }
}

#[derive(Clone)]
pub struct ExperimentInitRunnerMsgBase {
    pub experiment_id: ExperimentId,
    pub shared_context: Arc<SharedStore>,
    pub package_config: Arc<PackageMsgs>,
}

#[derive(Clone)]
pub struct ExperimentInitRunnerMsg {
    pub experiment_id: ExperimentId,
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
