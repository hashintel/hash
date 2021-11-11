use crate::simulation::enum_dispatch::*;

// TODO - Remove TaskResult as it ends up not encapsulating useful information and causes unnecessary
//  indirection with TaskMessages. Possibly come up with a better interface for distinguishing between
//  types of TaskMessages, at the very least documentation for explaining change
#[enum_dispatch(RegisterWithoutTrait)]
#[derive(Debug, Clone)]
pub enum TaskResult {
    InitTaskResult,
    ContextTaskResult,
    StateTaskResult,
    OutputTaskResult,
}

#[derive(Debug, Clone)]
pub enum TaskResultOrCancelled {
    Result(TaskResult),
    Cancelled,
}
