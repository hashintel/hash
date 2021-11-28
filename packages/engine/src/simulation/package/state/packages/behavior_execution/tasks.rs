use super::Result;
use crate::config::{Distribution, TaskDistributionConfig};
use crate::simulation::enum_dispatch::{StateTask, StateTaskMessage, WorkerHandler};
use crate::simulation::task::args::GetTaskArgs;
use crate::simulation::task::handler::{SplitConfig, WorkerPoolHandler};
use crate::simulation::task::msg::{TargetedTaskMessage, TaskMessage};
use crate::simulation::task::Task;
use crate::simulation::Result as SimulationResult;
use crate::worker::runner::comms::MessageTarget;
use serde::{Deserialize, Serialize};
// use crate::datastore::prelude::State;

#[derive(Clone, Debug)]
pub struct ExecuteBehaviorsTask {
    pub target: MessageTarget,
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
