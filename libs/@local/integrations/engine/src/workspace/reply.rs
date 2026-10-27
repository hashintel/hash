use core::error::Error;

use error_stack::Report;
use tokio::sync::oneshot;

/// The channel on which the workspace thread answers one request.
pub(super) struct Reply<T, C>(oneshot::Sender<Result<T, Report<C>>>);

impl<T, C> Reply<T, C> {
    /// Returns a reply channel and the receiver that the caller waits on.
    pub(super) fn channel() -> (Self, oneshot::Receiver<Result<T, Report<C>>>) {
        let (sender, receiver) = oneshot::channel();
        (Self(sender), receiver)
    }

    /// Returns whether the caller stopped waiting for the reply.
    pub(super) fn is_closed(&self) -> bool {
        self.0.is_closed()
    }

    /// Sends `result` to the caller.
    ///
    /// A caller that stopped waiting does not receive the result, so a failure is logged instead.
    /// Only the report's current context is logged, because DuckDB errors can quote row values.
    pub(super) fn send(self, result: Result<T, Report<C>>)
    where
        C: Error + Send + Sync + 'static,
    {
        if let Err(Err(report)) = self.0.send(result) {
            tracing::error!(
                error = %report.current_context(),
                "workspace request failed after its caller stopped waiting"
            );
        }
    }
}
