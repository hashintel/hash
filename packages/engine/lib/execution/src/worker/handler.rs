use crate::{
    task::{TargetedTaskMessage, TaskMessage},
    Error, Result,
};

pub trait WorkerHandler {
    /// Given an initial message from the package in the main loop of the simulation, convert it to
    /// one that can be sent to a language runner.
    fn start_message(&self) -> Result<TargetedTaskMessage> {
        Err(Error::WorkerNodeHandlerNotImplemented)
    }

    /// Given an inbound [`TaskMessage`] with [`MessageTarget::Dynamic`], create a new outbound
    /// message (which may be a terminating message, i.e. [`MessageTarget::Main`]).
    ///
    /// [`MessageTarget::Dynamic`]: crate::runner::MessageTarget::Dynamic
    /// [`MessageTarget::Main`]: crate::runner::MessageTarget::Main
    #[allow(unused_variables)]
    fn handle_worker_message(&mut self, task_message: TaskMessage) -> Result<TargetedTaskMessage> {
        Err(Error::WorkerNodeHandlerNotImplemented)
    }

    /// Combines [`TaskMessage`]s from sub-tasks within a worker, into one resultant [`TaskMessage`]
    /// to summarise the execution of the [`Task`].
    ///
    /// [`Task`]s may be split up _within_ a [`Worker`] into sub-tasks according to the groups of
    /// agents they're operating on (in a similar way to a [`Task`] being distributed _across_
    /// multiple workers).
    ///
    /// [`Worker`]: crate::worker::Worker
    /// [`Task`]: crate::task::Task
    #[allow(unused_variables)]
    fn combine_task_messages(&self, task_messages: Vec<TaskMessage>) -> Result<TaskMessage> {
        Err(Error::WorkerNodeHandlerNotImplemented)
    }
}
