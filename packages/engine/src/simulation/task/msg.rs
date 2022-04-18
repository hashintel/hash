use execution::package::TaskMessage;

/// Marks either the final [`TaskMessage`] of a [`Task`]'s execution chain, or indicates a
/// cancellation.
///
/// [`Task`]: crate::simulation::task::Task
#[derive(Debug, Clone)]
pub enum TaskResultOrCancelled {
    Result(TaskMessage),
    Cancelled,
}
