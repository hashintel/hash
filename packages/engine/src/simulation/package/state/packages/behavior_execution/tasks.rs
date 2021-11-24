use super::{Error, Result};
use crate::config::{Distribution, TaskDistributionConfig};
use crate::simulation::enum_dispatch::{StateTaskMessage, WorkerHandler};
use crate::simulation::task::args::GetTaskArgs;
use crate::simulation::task::handler::{SplitConfig, WorkerPoolHandler};
use crate::simulation::task::msg::{TargetedTaskMessage, TaskMessage};
use crate::simulation::task::Task;
use crate::simulation::Result as SimulationResult;
use crate::worker::runner::comms::MessageTarget;
use serde::{Deserialize, Serialize};

// TODO OS - Tasks, Messages, and Results are unimplemented
#[derive(Clone, Debug)]
pub struct ExecuteBehaviorsTask {
    target: MessageTarget,
}

impl GetTaskArgs for ExecuteBehaviorsTask {
    fn distribution(&self) -> crate::config::TaskDistributionConfig {
        TaskDistributionConfig::Distributed(Distribution {
            single_read_access: true,
        })
    }
}

impl WorkerHandler for ExecuteBehaviorsTask {
    fn start_message(&self) -> Result<TargetedTaskMessage> {
        let task_msg: StateTaskMessage = ExecuteBehaviorsTaskMessage {}.into();
        SimulationResult::Ok(TargetedTaskMessage {
            target: self.target,
            payload: task_msg.into(),
        })
    }
}

impl WorkerPoolHandler for ExecuteBehaviorsTask {
    fn split_task(&self, _split_config: &SplitConfig) -> Result<Vec<Task>> {
        todo!()
    }

    fn combine_messages(&self, _split_tasks: Vec<TaskMessage>) -> Result<TaskMessage> {
        todo!()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
// This is an empty struct, as the runners have access to all the information through Arrow,
// the task finishes by returning to the "main" target
pub struct ExecuteBehaviorsTaskMessage {}
