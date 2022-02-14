use serde::{Deserialize, Serialize};

use super::{Error, Result};
use crate::{
    config::{StateBatchDistribution, TaskDistributionConfig},
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

#[derive(Clone, Debug, Serialize, Deserialize)]
// This is an empty struct, as the runners have access to all the information through Arrow
// and the task finishes by returning to the "main" target.
pub struct ExecuteBehaviorsTaskMessage {}

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
        TaskDistributionConfig::Distributed(StateBatchDistribution {
            partitioned_batches: true,
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

    fn combine_task_messages(&self, task_messages: Vec<TaskMessage>) -> Result<TaskMessage> {
        combine_task_messages(task_messages)
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

    fn combine_messages(&self, split_messages: Vec<TaskMessage>) -> Result<TaskMessage> {
        combine_task_messages(split_messages)
    }
}

fn combine_task_messages(split_messages: Vec<TaskMessage>) -> Result<TaskMessage> {
    if split_messages.is_empty() {
        Err(Error::Unique(
            "Expected there to be at least one TaskMessage returned by the BehaviorExecutionTask"
                .to_string(),
        ))
    } else {
        // The `ExecuteBehaviorsTaskMessage` is empty so there's no special combining logic, we
        // just need to verify each message is valid
        for task_message in split_messages {
            if !matches!(
                task_message,
                TaskMessage::StateTaskMessage(StateTaskMessage::ExecuteBehaviorsTaskMessage(_))
            ) {
                return Err(Error::InvalidBehaviorTaskMessage(task_message));
            }
        }
        let task_message: StateTaskMessage = ExecuteBehaviorsTaskMessage {}.into();
        let task_message: TaskMessage = task_message.into();
        Ok(task_message)
    }
}
