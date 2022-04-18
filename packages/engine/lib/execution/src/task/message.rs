use crate::{package::TaskMessage, runner::MessageTarget};

/// A [`TaskMessage`] to be forwarded to the given [`MessageTarget`] as part of the execution of a
/// [`Task`].
///
/// [`Task`]: crate::simulation::task::Task
pub struct TargetedTaskMessage {
    pub target: MessageTarget,
    pub payload: TaskMessage,
}
