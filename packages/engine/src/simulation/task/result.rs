use crate::simulation::enum_dispatch::*;

#[enum_dispatch(RegisterWithoutTrait)]
#[derive(Debug, Clone)]
pub enum TaskResult {
    InitTaskResult,
    ContextTaskResult,
    StateTaskResult,
    OutputTaskResult,
}

// TODO OS - Documentation
#[derive(Debug, Clone)]
pub enum TaskResultOrCancelled {
    Result(TaskResult),
    Cancelled,
}
