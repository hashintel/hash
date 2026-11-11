//! Starting, reading and cancelling runs. None of the three needs a worker.

use alloc::format;

use error_stack::{Report, ResultExt as _};

use super::{RestateBackend, path_segment, run::Start, send};
use crate::{BackendError, RunId, RunStart, RunStatus, Runs, StartError};

impl Runs for RestateBackend {
    /// Sends the run to the object of its admission key, with the run's ID as the idempotency
    /// key. Restate queues it durably whether or not a worker is running.
    ///
    /// Restate decides what a start does that meets another run. A run that is started again
    /// attaches to the run that has its ID. A run whose admission key is held by another run
    /// waits for that run to finish. So this backend returns neither
    /// [`StartError::StartMismatch`] nor [`StartError::AlreadyActive`].
    #[tracing::instrument(skip_all, fields(run = %run))]
    async fn start(&self, run: RunId, start: RunStart) -> Result<(), Report<StartError>> {
        let object = format!(
            "{}/restate/send/IntegrationRun/{}/run",
            self.config.ingress_url,
            path_segment(start.admission.as_ref())
        );
        let request = self
            .http
            .post(object)
            .header("idempotency-key", run.as_ref())
            .json(&Start {
                version: start.version.get(),
                policy: start.policy,
                input: start.input,
            });
        send(request).await.change_context(StartError::Backend)?;
        Ok(())
    }

    async fn status(&self, run: &RunId) -> Result<Option<RunStatus>, Report<BackendError>> {
        self.read_status(run).await.change_context(BackendError)
    }

    /// Restate raises the cancellation in the run at its next step, so a step that is executing
    /// finishes and is recorded. A run that has not begun is removed.
    async fn cancel(&self, run: &RunId) -> Result<(), Report<BackendError>> {
        let unfinished = self
            .invocation(run)
            .await
            .change_context(BackendError)?
            .filter(|invocation| invocation.completion_result.is_none());
        if let Some(invocation) = unfinished {
            let cancel = format!(
                "{}/invocations/{}/cancel",
                self.config.admin_url, invocation.id
            );
            send(self.http.patch(cancel))
                .await
                .change_context(BackendError)?;
        }
        Ok(())
    }
}
