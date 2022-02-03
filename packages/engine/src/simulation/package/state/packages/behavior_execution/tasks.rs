use serde::{Deserialize, Serialize};

use super::{Error, Result};
use crate::{
    config::{Distribution, TaskDistributionConfig},
    simulation::{
        enum_dispatch::{StateTask, StateTaskMessage, WorkerHandler},
        task::{
            args::GetTaskArgs,
            handler::{SplitConfig, WorkerPoolHandler},
            msg::{TargetedTaskMessage, TaskMessage},
            GetTaskName, Task,
        },
        Result as SimulationResult,
    },
    worker::runner::comms::MessageTarget,
};

#[derive(Clone, Debug)]
pub struct ExecuteBehaviorsTask {
    pub target: MessageTarget,
}

impl GetTaskName for ExecuteBehaviorsTask {
    fn get_task_name(&self) -> &'static str {
        "BehaviorExecution"
    }
}

impl GetTaskArgs for ExecuteBehaviorsTask {
    fn distribution(&self) -> TaskDistributionConfig {
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
    fn split_task(&self, split_config: &SplitConfig) -> Result<Vec<Task>> {
        split_config
            .agent_distribution
            .as_ref()
            .expect("Behavior execution is expected to be distributed");
        let task: StateTask = self.clone().into();
        let task: Task = task.into();
        Ok((0..split_config.num_workers)
            .map(|_| task.clone())
            .collect())
    }

    fn combine_messages(&self, split_tasks: Vec<TaskMessage>) -> Result<TaskMessage> {
        for task in split_tasks {
            if !matches!(
                task,
                TaskMessage::StateTaskMessage(StateTaskMessage::ExecuteBehaviorsTaskMessage(_))
            ) {
                return Err(Error::InvalidBehaviorTaskMessage(task));
            }
        }
        let task: StateTaskMessage = ExecuteBehaviorsTaskMessage {}.into();
        let task: TaskMessage = task.into();
        Ok(task)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
// This is an empty struct, as the runners have access to all the information through Arrow
// and the task finishes by returning to the "main" target.
pub struct ExecuteBehaviorsTaskMessage {}
