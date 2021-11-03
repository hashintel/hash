use crate::simulation::packages::init::InitTaskResult;
use enum_dispatch::enum_dispatch;

use super::prelude::*;

#[enum_dispatch]
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
