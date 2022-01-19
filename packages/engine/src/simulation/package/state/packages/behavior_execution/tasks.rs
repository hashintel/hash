use serde::{Deserialize, Serialize};

use super::Result;
use crate::{
    config::{Distribution, TaskDistributionConfig},
    simulation::{
        enum_dispatch::{StateTask, StateTaskMessage, WorkerHandler},
        task::{
            args::GetTaskArgs,
            handler::{SplitConfig, WorkerPoolHandler},
            msg::{TargetedTaskMessage, TaskMessage},
            Task,
        },
        Result as SimulationResult,
    },
    worker::runner::comms::MessageTarget,
};

#[derive(Clone, Debug)]
pub struct ExecuteBehaviorsTask {
    pub target: MessageTarget,
}

impl GetTaskArgs for ExecuteBehaviorsTask {
    #[tracing::instrument(skip_all)]
    fn distribution(&self) -> TaskDistributionConfig {
        TaskDistributionConfig::Distributed(Distribution {
            single_read_access: true,
        })
    }
}

impl WorkerHandler for ExecuteBehaviorsTask {
    #[tracing::instrument(skip_all)]
    fn start_message(&self) -> Result<TargetedTaskMessage> {
        let task_msg: StateTaskMessage = ExecuteBehaviorsTaskMessage {}.into();
        SimulationResult::Ok(TargetedTaskMessage {
            target: self.target,
            payload: task_msg.into(),
        })
    }
}

impl WorkerPoolHandler for ExecuteBehaviorsTask {
    #[tracing::instrument(skip_all)]
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

    #[tracing::instrument(skip_all)]
    fn combine_messages(&self, split_tasks: Vec<TaskMessage>) -> Result<TaskMessage> {
        for _task in split_tasks {
            // TODO: How can we match an enum_dispatch nested enum?
            // match task {
            //     TaskMessage::StateTaskMessage(
            //         StateTaskMessage::ExecuteBehaviorsTaskMessage(
            //             ExecuteBehaviorsTaskMessage
            //         )
            //     ) => {},
            //     _ => return Err(Error::InvalidBehaviorTaskMessage(task))
            // }
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
