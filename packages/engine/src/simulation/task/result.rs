use crate::simulation::enum_dispatch::*;

#[enum_dispatch(RegisterWithoutTrait)]
pub enum TaskResult {
    InitTaskResult,
    ContextTaskResult,
    StateTaskResult,
    OutputTaskResult,
}

// TODO OS - Documentation
pub enum TaskResultOrCancelled {
    Result(TaskResult),
    Cancelled,
}
