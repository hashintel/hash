use std::{
    collections::HashMap,
    fmt,
    fmt::{Debug, Formatter},
    sync::Arc,
};

use arrow::datatypes::Schema;
use execution::{runner::RunnerConfig, task::SharedStore, worker_pool::WorkerIndex};
use stateful::{agent::AgentSchema, field::PackageId, global::Globals};
use tracing::Span;

use crate::{
    config::EngineConfig,
    datastore::shared_store::SharedDatasets,
    proto::{ExperimentId, SimulationShortId},
    simulation::package::worker_init::PackageInitMsgForWorker,
};

pub mod inbound;
pub mod outbound;

#[derive(Debug)]
pub struct StateInterimSync {
    pub shared_store: SharedStore,
}

// TODO: UNUSED: Needs triage
pub struct DatastoreInit {
    pub agent_batch_schema: Vec<u8>,
    pub message_batch_schema: Vec<u8>,
    pub context_batch_schema: Vec<u8>,
    pub shared_context: SharedDatasets,
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
    pub shared_store: Arc<SharedDatasets>,
}

impl Debug for DatastoreSimulationPayload {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str("DatastoreSimulationPayload")
    }
}

#[derive(Clone)]
pub struct ExperimentInitRunnerMsgBase {
    pub experiment_id: ExperimentId,
    pub shared_context: Arc<SharedDatasets>,
    pub package_config: Arc<PackageMsgs>,
    pub runner_config: RunnerConfig,
}

#[derive(Clone)]
pub struct ExperimentInitRunnerMsg {
    pub experiment_id: ExperimentId,
    pub worker_index: WorkerIndex,
    pub shared_context: Arc<SharedDatasets>,
    pub package_config: Arc<PackageMsgs>,
    pub runner_config: RunnerConfig,
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
            runner_config,
        } = base.clone();
        ExperimentInitRunnerMsg {
            experiment_id,
            worker_index,
            shared_context,
            package_config,
            runner_config,
        }
    }
}
