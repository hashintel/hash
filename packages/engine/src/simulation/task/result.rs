use enum_dispatch::enum_dispatch;

use super::prelude::*;

#[enum_dispatch]
pub enum TaskResult {
    InitTaskResult,
    ContextTaskResult,
    StateTaskResult,
    OutputTaskResult,
}

// TODO Documentation
pub enum TaskResultOrCancelled {
    Result(TaskResult),
    Cancelled,
}
