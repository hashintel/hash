use crate::{
    package::simulation::{
        context::ContextTask, init::InitTask, output::OutputTask, state::StateTask,
    },
    task::{
        StoreAccessValidator, Task,
    },
    worker::WorkerHandler,
    worker_pool::WorkerPoolHandler,
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

/// A bundle of traits that the inner tasks must implement so the outer [`PackageTask`] can be used
/// through a dereference.
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
impl std::ops::Deref for PackageTask {
    type Target = dyn PackageTaskBehaviors;

    fn deref(&self) -> &(dyn PackageTaskBehaviors + 'static) {
        match self {
            Self::Init(inner) => inner,
            Self::Context(inner) => inner,
            Self::State(inner) => inner,
            Self::Output(inner) => inner,
        }
    }
}

impl std::ops::DerefMut for PackageTask {
    fn deref_mut(&mut self) -> &mut (dyn PackageTaskBehaviors + 'static) {
        match self {
            Self::Init(inner) => inner,
            Self::Context(inner) => inner,
            Self::State(inner) => inner,
            Self::Output(inner) => inner,
        }
    }
}

// TODO: Is there an important differentiation between Task and TaskMessage
