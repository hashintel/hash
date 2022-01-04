use crate::simulation::{
    enum_dispatch::*,
    task::msg::{TargetedTaskMessage, TaskMessage},
    Error, Result,
};

#[enum_dispatch]
pub trait WorkerHandler {
    /// Given an initial message from the package in the
    /// main loop of the simulation, convert it to one
    /// that can be sent to a language runner
    fn start_message(&self) -> Result<TargetedTaskMessage> {
        Err(Error::WorkerNodeHandlerNotImplemented)
    }

    /// Given an inbound worker message and a dynamic Target, create a new
    /// worker message (which may be a completion message)
    fn handle_worker_message(&mut self, _msg: TaskMessage) -> Result<TargetedTaskMessage> {
        Err(Error::WorkerNodeHandlerNotImplemented)
    }
}
