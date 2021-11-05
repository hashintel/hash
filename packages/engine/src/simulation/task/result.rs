use crate::simulation::enum_dispatch::*;

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
