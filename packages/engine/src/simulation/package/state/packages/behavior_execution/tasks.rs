use crate::simulation::enum_dispatch::WorkerHandler;
use crate::simulation::task::args::GetTaskArgs;
use crate::simulation::task::handler::WorkerPoolHandler;
use serde::{Deserialize, Serialize};

// TODO OS - Tasks, Messages, and Results are unimplemented
#[derive(Clone, Debug)]
pub struct ExecuteBehaviorsTask {
    // TODO
}

impl GetTaskArgs for ExecuteBehaviorsTask {
    fn distribution(&self) -> crate::config::TaskDistributionConfig {
        todo!()
    }
}

impl WorkerHandler for ExecuteBehaviorsTask {
    // TODO
}

impl WorkerPoolHandler for ExecuteBehaviorsTask {
    // TODO
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExecuteBehaviorsTaskMessage {
    // TODO
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExecuteBehaviorsTaskResult {
    // TODO
}
