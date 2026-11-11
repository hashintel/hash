//! A worker: an HTTP server that Restate calls to execute runs and to consume tokens.

use alloc::{format, sync::Arc};
use core::time::Duration;

use error_stack::{Report, ResultExt as _};
use restate_sdk::prelude::{Endpoint, HttpServer, IntoServiceDefinition as _, ServiceOptions};
use serde_json::json;
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;

use super::{RestateBackend, RestateError, run::IntegrationRun, send, token_bucket::TokenBuckets};
use crate::{BackendError, RunFunction, Worker};

/// How long Restate waits for a step that ran past its timeout to stop, before it aborts the
/// attempt.
const ABORT_TIMEOUT: Duration = Duration::from_secs(5);

/// The longest Restate waits between two attempts of a run, for example while no worker answers.
const RETRY_INTERVAL: Duration = Duration::from_secs(5);

impl Worker for RestateBackend {
    /// Serves the run object and the token buckets at the configured address and registers its
    /// URL with Restate.
    #[tracing::instrument(skip_all, fields(version = %F::VERSION))]
    async fn work<F: RunFunction + 'static>(
        &self,
        function: Arc<F>,
        shutdown: CancellationToken,
    ) -> Result<(), Report<BackendError>> {
        let listener = TcpListener::bind(self.config.listen)
            .await
            .change_context(RestateError::Listen)
            .change_context(BackendError)?;
        let options = ServiceOptions::new()
            .inactivity_timeout(self.config.step_timeout)
            .abort_timeout(ABORT_TIMEOUT)
            .retry_policy_max_interval(RETRY_INTERVAL);
        let endpoint = Endpoint::builder()
            .bind(
                IntegrationRun(function)
                    .into_service_definition()
                    .options(options),
            )
            .bind(TokenBuckets)
            .build();
        let server = HttpServer::new(endpoint).serve_with_cancel(listener, shutdown.cancelled());
        tokio::pin!(server);

        // Restate asks the worker for its services when the URL is registered as a deployment, so
        // the server is already serving by then. Registering a URL again changes nothing.
        let deployments = format!("{}/deployments", self.config.admin_url);
        let register = send(
            self.http
                .post(deployments)
                .json(&json!({ "uri": self.config.worker_url })),
        );
        tokio::select! {
            () = &mut server => return Ok(()),
            registered = register => registered.change_context(BackendError)?,
        };
        server.await;
        Ok(())
    }
}
