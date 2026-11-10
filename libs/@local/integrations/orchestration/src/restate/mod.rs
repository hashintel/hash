//! The orchestration backend on Restate.
//!
//! A run is one invocation of the `IntegrationRun` object. The object's key is the run's admission
//! key, so Restate executes one run per admission key at a time. The invocation's idempotency key
//! is the run's ID, so starting a run again attaches to it. Restate journals each step and sends
//! the journal with every attempt, so any worker can execute any attempt.
//!
//! A worker is an HTTP endpoint that Restate calls, and it has no identity. Restate retries a run
//! whose worker died, or whose step ran past [`RestateConfig::step_timeout`], on whichever worker
//! answers at [`RestateConfig::worker_url`]. That URL is a deployment of one version of the run
//! function, and a run stays on the deployment it started on.

use alloc::{format, string::String, sync::Arc, vec::Vec};
use core::{future::Future, net::SocketAddr, time::Duration};

use error_stack::{Report, ResultExt as _};
use restate_sdk::prelude::{Endpoint, HttpServer, IntoServiceDefinition as _, ServiceOptions};
use serde::{Deserialize, de::DeserializeOwned};
use serde_json::json;
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;

use self::step::{CANCELLED, Failure, IntegrationRun, Start};
use crate::{
    BackendError, RunFailure, RunFunction, RunId, RunPhase, RunStart, RunStatus, Runs, StartError,
    Worker,
};

mod step;

/// How long Restate waits for a step that ran past its timeout to stop, before it aborts the
/// attempt.
const ABORT_TIMEOUT: Duration = Duration::from_secs(5);

/// The longest Restate waits between two attempts of a run, for example while no worker answers.
const RETRY_INTERVAL: Duration = Duration::from_secs(5);

/// What the backend was doing with Restate when a call failed.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum RestateError {
    #[display("could not listen on the worker's address")]
    Listen,
    #[display("the request to Restate failed")]
    Request,
}

/// Where the Restate backend finds Restate, and where Restate finds this process's worker.
#[derive(Debug, Clone)]
pub struct RestateConfig {
    /// Restate's ingress, through which runs start. Restate serves it on port 8080.
    pub ingress_url: String,
    /// Restate's admin API, through which runs are read and cancelled and workers registered.
    /// Restate serves it on port 9070.
    pub admin_url: String,
    /// The address this process's worker listens on.
    pub listen: SocketAddr,
    /// The URL at which Restate reaches [`listen`](Self::listen). Every worker of one version of
    /// the run function shares it, and each version has a URL of its own.
    pub worker_url: String,
    /// The longest a step may take. Restate aborts an attempt whose step takes longer and starts
    /// another, which is also how it recovers from a step that hangs.
    pub step_timeout: Duration,
}

/// The backend on Restate. It keeps no connection and no state of its own.
pub struct RestateBackend {
    config: RestateConfig,
    http: reqwest::Client,
}

impl RestateBackend {
    #[must_use]
    pub fn new(config: RestateConfig) -> Self {
        Self {
            config,
            http: reqwest::Client::new(),
        }
    }
}

impl Worker for RestateBackend {
    /// Serves the run object at the configured address and registers its URL with Restate.
    #[tracing::instrument(skip_all, fields(version = %F::VERSION))]
    fn work<F: RunFunction + 'static>(
        &self,
        function: Arc<F>,
        shutdown: CancellationToken,
    ) -> impl Future<Output = Result<(), Report<BackendError>>> + Send {
        async move {
            self.serve(function, shutdown)
                .await
                .change_context(BackendError)
        }
    }
}

impl RestateBackend {
    async fn serve<F: RunFunction + 'static>(
        &self,
        function: Arc<F>,
        shutdown: CancellationToken,
    ) -> Result<(), Report<RestateError>> {
        let listener = TcpListener::bind(self.config.listen)
            .await
            .change_context(RestateError::Listen)?;
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
            .build();
        let server = HttpServer::new(endpoint).serve_with_cancel(listener, shutdown.cancelled());
        tokio::pin!(server);

        // Restate asks the worker for its services when the URL is registered, so the server is
        // already serving by then.
        tokio::select! {
            () = &mut server => return Ok(()),
            registered = self.register() => registered?,
        }
        server.await;
        Ok(())
    }

    /// Registers the worker's URL as a deployment. Registering a URL again changes nothing.
    async fn register(&self) -> Result<(), Report<RestateError>> {
        self.http
            .post(format!("{}/deployments", self.config.admin_url))
            .json(&json!({ "uri": self.config.worker_url }))
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
            .change_context(RestateError::Request)?;
        Ok(())
    }
}

/// A run's row in Restate's `sys_invocation` table.
#[derive(Deserialize)]
struct Invocation {
    id: String,
    /// `success` or `failure`, once the run has finished.
    completion_result: Option<String>,
    /// `[<status code>] <message>` of the error a failed run's handler ended with.
    completion_failure: Option<String>,
}

impl Runs for RestateBackend {
    /// Sends the run to the object of its admission key, with the run's ID as the idempotency
    /// key. Restate queues it durably whether or not a worker is running.
    #[tracing::instrument(skip_all, fields(run = %run))]
    async fn start(&self, run: RunId, start: RunStart) -> Result<(), Report<StartError>> {
        self.send(&run, start)
            .await
            .change_context(StartError::Backend)
    }

    async fn status(&self, run: &RunId) -> Result<Option<RunStatus>, Report<BackendError>> {
        self.read_status(run).await.change_context(BackendError)
    }

    fn cancel(&self, _: &RunId) -> impl Future<Output = Result<(), Report<BackendError>>> + Send {
        core::future::ready(Err(
            Report::new(BackendError).attach("the Restate backend does not cancel runs yet")
        ))
    }
}

impl RestateBackend {
    async fn send(&self, run: &RunId, start: RunStart) -> Result<(), Report<RestateError>> {
        // An admission key can hold `/`, which separates the segments of the path.
        let key = start.admission.as_ref().replace('/', "%2F");
        self.http
            .post(format!(
                "{}/restate/send/IntegrationRun/{key}/run",
                self.config.ingress_url
            ))
            .header("idempotency-key", run.as_ref())
            .json(&Start {
                version: start.version.get(),
                policy: start.policy,
                input: start.input,
            })
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
            .change_context(RestateError::Request)?;
        Ok(())
    }

    /// Runs `sql` on Restate's introspection tables. The names this backend puts into a query
    /// hold only lowercase letters, digits, `-`, `_` and `/`, so they need no escaping.
    async fn query<T: DeserializeOwned>(&self, sql: &str) -> Result<Vec<T>, Report<RestateError>> {
        #[derive(Deserialize)]
        struct Rows<T> {
            rows: Vec<T>,
        }

        let response = self
            .http
            .post(format!("{}/query", self.config.admin_url))
            .header(reqwest::header::ACCEPT, "application/json")
            .json(&json!({ "query": sql }))
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
            .change_context(RestateError::Request)?;
        let rows: Rows<T> = response
            .json()
            .await
            .change_context(RestateError::Request)?;
        Ok(rows.rows)
    }

    async fn read_status(&self, run: &RunId) -> Result<Option<RunStatus>, Report<RestateError>> {
        #[derive(Deserialize)]
        struct Steps {
            steps: u32,
        }

        let invocations: Vec<Invocation> = self
            .query(&format!(
                "SELECT id, completion_result, completion_failure FROM sys_invocation WHERE \
                 target_service_name = 'IntegrationRun' AND idempotency_key = '{run}'"
            ))
            .await?;
        let Some(invocation) = invocations.into_iter().next() else {
            return Ok(None);
        };
        // Restate journals the result of a step, a failure included, as a notification.
        let journaled: Vec<Steps> = self
            .query(&format!(
                "SELECT COUNT(*) AS steps FROM sys_journal WHERE id = '{}' AND entry_type = \
                 'Notification: Run'",
                invocation.id
            ))
            .await?;
        let steps = journaled.first().map_or(0, |count| count.steps);

        let phase = match invocation.completion_result.as_deref() {
            Some("success") => RunPhase::Completed,
            Some(_) => finished_phase(invocation.completion_failure.as_deref().unwrap_or_default()),
            None if steps == 0 => RunPhase::Pending,
            None => RunPhase::Running,
        };
        // A step that failed the run is journaled, but is not a recorded step.
        let failed_steps = u32::from(matches!(phase, RunPhase::Failed(RunFailure::Step { .. })));
        Ok(Some(RunStatus {
            phase,
            steps_recorded: steps - failed_steps,
        }))
    }
}

/// The phase of a run whose handler ended with an error, from `[<status code>] <message>`.
///
/// An error this backend did not write, such as the one of a run Restate killed, reads as a
/// backend failure.
fn finished_phase(failure: &str) -> RunPhase {
    if failure.starts_with(&format!("[{CANCELLED}]")) {
        return RunPhase::Cancelled;
    }
    let recorded = failure
        .split_once(' ')
        .and_then(|(_, message)| serde_json::from_str::<Failure>(message).ok())
        .and_then(|failure| RunFailure::try_from(failure).ok());
    RunPhase::Failed(recorded.unwrap_or_else(|| RunFailure::Function {
        code: "backend-error".parse().expect("should be a failure code"),
    }))
}
