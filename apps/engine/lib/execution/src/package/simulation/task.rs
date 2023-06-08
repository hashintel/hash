use crate::{
    package::simulation::{
        context::ContextTask, init::InitTask, output::OutputTask, state::StateTask,
    },
    task::{StoreAccessValidator, Task, TaskDistributionConfig, TaskSharedStore, TargetedTaskMessage, TaskMessage},
    worker::WorkerHandler,
    worker_pool::{WorkerPoolHandler, SplitConfig},
    Result,
};

// All traits applied here apply to the enum.
// Also we have automatically derived all
// From<init::Task>, ..., From<output::Task> for this enum.
// Additionally we have TryInto<init::Task>, (and others)
// implemented for this enum.
#[derive(Clone, Debug)]
pub enum PackageTask {
    Init(InitTask),
    Context(ContextTask),
    State(StateTask),
    Output(OutputTask),
}

impl Task for PackageTask {
    fn name(&self) -> &'static str {
        match self {
            Self::Init(inner) => inner.name(),
            Self::Context(inner) => inner.name(),
            Self::State(inner) => inner.name(),
            Self::Output(inner) => inner.name(),
        }
    }

    fn distribution(&self) -> TaskDistributionConfig {
        match self {
            Self::Init(inner) => inner.distribution(),
            Self::Context(inner) => inner.distribution(),
            Self::State(inner) => inner.distribution(),
            Self::Output(inner) => inner.distribution(),
        }
    }
}

impl StoreAccessValidator for PackageTask {
    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()> {
        match self {
            Self::Init(inner) => inner.verify_store_access(access),
            Self::Context(inner) => inner.verify_store_access(access),
            Self::State(inner) => inner.verify_store_access(access),
            Self::Output(inner) => inner.verify_store_access(access),
        }
    }
}

impl WorkerHandler for PackageTask {
    fn start_message(&self) -> Result<TargetedTaskMessage> {
        match self {
            Self::Init(inner) => inner.start_message(),
            Self::Context(inner) => inner.start_message(),
            Self::State(inner) => inner.start_message(),
            Self::Output(inner) => inner.start_message(),
        }
    }

    fn handle_worker_message(&mut self, msg: TaskMessage) -> Result<TargetedTaskMessage> {
        match self {
            Self::Init(inner) => inner.handle_worker_message(msg),
            Self::Context(inner) => inner.handle_worker_message(msg),
            Self::State(inner) => inner.handle_worker_message(msg),
            Self::Output(inner) => inner.handle_worker_message(msg),
        }
    }

    fn combine_task_messages(&self, task_messages: Vec<TaskMessage>) -> Result<TaskMessage> {
        match self {
            Self::Init(inner) => inner.combine_task_messages(task_messages),
            Self::Context(inner) => inner.combine_task_messages(task_messages),
            Self::State(inner) => inner.combine_task_messages(task_messages),
            Self::Output(inner) => inner.combine_task_messages(task_messages),
        }
    }
}

impl WorkerPoolHandler for PackageTask {
    fn split_task(&self, split_config: &SplitConfig) -> Result<Vec<PackageTask>> {
        match self {
            Self::Init(inner) => inner.split_task(split_config),
            Self::Context(inner) => inner.split_task(split_config),
            Self::State(inner) => inner.split_task(split_config),
            Self::Output(inner) => inner.split_task(split_config),
        }
    }

    fn combine_messages(&self, split_messages: Vec<TaskMessage>) -> Result<TaskMessage> {
        match self {
            Self::Init(inner) => inner.combine_messages(split_messages),
            Self::Context(inner) => inner.combine_messages(split_messages),
            Self::State(inner) => inner.combine_messages(split_messages),
            Self::Output(inner) => inner.combine_messages(split_messages),
        }
    }
}

// TODO: Is there an important differentiation between Task and TaskMessage
