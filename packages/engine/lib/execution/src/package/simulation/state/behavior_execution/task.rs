use crate::{
    package::simulation::{
        state::{behavior_execution::ExecuteBehaviorsTaskMessage, StateTask, StateTaskMessage},
        PackageTask,
    },
    runner::MessageTarget,
    task::{
        StateBatchDistribution, TargetedTaskMessage, Task, TaskDistributionConfig, TaskMessage,
    },
    worker::WorkerHandler,
    worker_pool::{SplitConfig, WorkerPoolHandler},
    Error, Result,
};

#[derive(Clone, Debug)]
pub struct ExecuteBehaviorsTask {
    pub target: MessageTarget,
}

impl Task for ExecuteBehaviorsTask {
    fn name(&self) -> &'static str {
        "BehaviorExecution"
    }

    fn distribution(&self) -> TaskDistributionConfig {
        TaskDistributionConfig::Distributed(StateBatchDistribution {
            partitioned_batches: true,
        })
    }
}

impl WorkerHandler for ExecuteBehaviorsTask {
    fn start_message(&self) -> Result<TargetedTaskMessage> {
        let task_msg =
            StateTaskMessage::ExecuteBehaviorsTaskMessage(ExecuteBehaviorsTaskMessage {});
        Result::Ok(TargetedTaskMessage {
            target: self.target,
            payload: TaskMessage::State(task_msg),
        })
    }

    fn combine_task_messages(&self, task_messages: Vec<TaskMessage>) -> Result<TaskMessage> {
        combine_task_messages(task_messages)
    }
}

impl WorkerPoolHandler for ExecuteBehaviorsTask {
    fn split_task(&self, split_config: &SplitConfig) -> Result<Vec<PackageTask>> {
        split_config
            .agent_distribution
            .as_ref()
            .expect("Behavior execution is expected to be distributed");
        let state_task = StateTask::ExecuteBehaviorsTask(self.clone());
        let task = PackageTask::State(state_task);
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
        Err(Error::from(
            "Expected there to be at least one TaskMessage returned by the BehaviorExecutionTask"
                .to_string(),
        ))
    } else {
        // The `ExecuteBehaviorsTaskMessage` is empty so there's no special combining logic, we
        // just need to verify each message is valid
        for task_message in split_messages {
            if !matches!(
                task_message,
                TaskMessage::State(StateTaskMessage::ExecuteBehaviorsTaskMessage(_))
            ) {
                return Err(Error::InvalidBehaviorTaskMessage(task_message));
            }
        }
        let task_message =
            StateTaskMessage::ExecuteBehaviorsTaskMessage(ExecuteBehaviorsTaskMessage {});
        Ok(TaskMessage::State(task_message))
    }
}
