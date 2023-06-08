use crate::{
    package::simulation::{
        context::ContextTask, init::InitTask, output::OutputTask, state::StateTask,
    },
    task::{
        StoreAccessValidator, TargetedTaskMessage, Task, TaskDistributionConfig, TaskMessage,
        TaskSharedStore,
    },
    worker::WorkerHandler,
    worker_pool::{SplitConfig, WorkerPoolHandler},
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

/// A bundle of traits that the inner tasks must implement so the outer [`PackageTask`] can
/// proxy its own implementations of these traits to them.
pub trait PackageTaskBehaviors:
    Task + StoreAccessValidator + WorkerHandler + WorkerPoolHandler
{
}
impl<T> PackageTaskBehaviors for T where
    T: Task + StoreAccessValidator + WorkerHandler + WorkerPoolHandler
{
}

/// Implement Deref and DerefMut for PackageTask so that we can use
/// the enum as a trait object without having to match on the enum
/// variants for every method call.
impl PackageTask {
    fn as_task(&self) -> &(dyn PackageTaskBehaviors + 'static) {
        match self {
            Self::Init(inner) => inner,
            Self::Context(inner) => inner,
            Self::State(inner) => inner,
            Self::Output(inner) => inner,
        }
    }

    fn as_task_mut(&mut self) -> &mut (dyn PackageTaskBehaviors + 'static) {
        match self {
            Self::Init(inner) => inner,
            Self::Context(inner) => inner,
            Self::State(inner) => inner,
            Self::Output(inner) => inner,
        }
    }

}

impl Task for PackageTask {
    fn name(&self) -> &'static str {
        self.as_task().name()
    }

    fn distribution(&self) -> TaskDistributionConfig {
        self.as_task().distribution()
    }
}

impl StoreAccessValidator for PackageTask {
    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()> {
        self.as_task().verify_store_access(access)
    }
}

impl WorkerHandler for PackageTask {
    fn start_message(&self) -> Result<TargetedTaskMessage> {
        self.as_task().start_message()
    }

    fn handle_worker_message(&mut self, msg: TaskMessage) -> Result<TargetedTaskMessage> {
        self.as_task_mut().handle_worker_message(msg)
    }

    fn combine_task_messages(&self, task_messages: Vec<TaskMessage>) -> Result<TaskMessage> {
        self.as_task().combine_task_messages(task_messages)
    }
}

impl WorkerPoolHandler for PackageTask {
    fn split_task(&self, split_config: &SplitConfig) -> Result<Vec<PackageTask>> {
        self.as_task().split_task(split_config)
    }

    fn combine_messages(&self, split_messages: Vec<TaskMessage>) -> Result<TaskMessage> {
        self.as_task().combine_messages(split_messages)
    }
}

// TODO: Is there an important differentiation between Task and TaskMessage
