use std::sync::Arc;

use execution::{
    runner::{comms::PackageMsgs, RunnerConfig},
    worker_pool::WorkerIndex,
};
use stateful::global::SharedDatasets;

use crate::proto::ExperimentId;

// TODO: UNUSED: Needs triage
pub struct DatastoreInit {
    pub agent_batch_schema: Vec<u8>,
    pub message_batch_schema: Vec<u8>,
    pub context_batch_schema: Vec<u8>,
    pub shared_context: SharedDatasets,
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
