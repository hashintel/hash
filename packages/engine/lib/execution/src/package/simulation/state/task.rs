use crate::{
    package::simulation::{state::behavior_execution::ExecuteBehaviorsTask, PackageTask},
    task::{
        StoreAccessValidator, TargetedTaskMessage, Task, TaskDistributionConfig, TaskMessage,
        TaskSharedStore,
    },
    worker::WorkerHandler,
    worker_pool::{SplitConfig, WorkerPoolHandler},
    Error, Result,
};

/// All state package tasks are registered in this enum
#[derive(Clone, Debug)]
pub enum StateTask {
    ExecuteBehaviorsTask(ExecuteBehaviorsTask),
}

impl Task for StateTask {
    fn name(&self) -> &'static str {
        match self {
            Self::ExecuteBehaviorsTask(task) => task.name(),
        }
    }

    fn distribution(&self) -> TaskDistributionConfig {
        match self {
            Self::ExecuteBehaviorsTask(task) => task.distribution(),
        }
    }
}

impl StoreAccessValidator for StateTask {
    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()> {
        let state = &access.state;
        let context = access.context();
        // All combinations (as of now) are allowed (but still being explicit)
        if (state.is_readwrite() || state.is_readonly() || state.is_disabled())
            && (context.is_readonly() || context.is_disabled())
        {
            Ok(())
        } else {
            Err(Error::access_not_allowed(state, context, "State".into()))
        }
    }
}

impl WorkerHandler for StateTask {
    fn start_message(&self) -> Result<TargetedTaskMessage> {
        match self {
            Self::ExecuteBehaviorsTask(inner) => inner.start_message(),
        }
    }

    fn handle_worker_message(&mut self, msg: TaskMessage) -> Result<TargetedTaskMessage> {
        match self {
            Self::ExecuteBehaviorsTask(inner) => inner.handle_worker_message(msg),
        }
    }

    fn combine_task_messages(&self, task_messages: Vec<TaskMessage>) -> Result<TaskMessage> {
        match self {
            Self::ExecuteBehaviorsTask(inner) => inner.combine_task_messages(task_messages),
        }
    }
}

impl WorkerPoolHandler for StateTask {
    fn split_task(&self, split_config: &SplitConfig) -> Result<Vec<PackageTask>> {
        match self {
            Self::ExecuteBehaviorsTask(inner) => inner.split_task(split_config),
        }
    }

    fn combine_messages(&self, split_messages: Vec<TaskMessage>) -> Result<TaskMessage> {
        match self {
            Self::ExecuteBehaviorsTask(inner) => inner.combine_messages(split_messages),
        }
    }
}
