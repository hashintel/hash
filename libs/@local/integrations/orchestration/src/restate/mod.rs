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

use self::{
    coordination::TokenBuckets,
    step::{CANCELLED, Failure, IntegrationRun, Start},
};
use crate::{
    BackendError, RunFailure, RunFunction, RunId, RunPhase, RunStart, RunStatus, Runs, StartError,
    Worker,
};

mod coordination;
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
    #[display("the run's record is not one this backend wrote")]
    Recorded,
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
    /// Serves the run object and the token buckets at the configured address and registers its
    /// URL with Restate.
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
            .bind(TokenBuckets)
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
    /// The run's ID.
    idempotency_key: String,
    /// The run's admission key.
    target_service_key: String,
    /// `success` or `failure`, once the run has finished.
    completion_result: Option<String>,
    /// `[<status code>] <message>` of the error a failed run's handler ended with.
    completion_failure: Option<String>,
}

impl Runs for RestateBackend {
    /// Sends the run to the object of its admission key, with the run's ID as the idempotency
    /// key. Restate queues it durably whether or not a worker is running.
    ///
    /// The check for an active run and the send are two requests. Two runs that start under one
    /// admission key at the same moment can both be accepted, and Restate then executes them one
    /// after the other.
    #[tracing::instrument(skip_all, fields(run = %run))]
    async fn start(&self, run: RunId, start: RunStart) -> Result<(), Report<StartError>> {
        self.start_run(&run, start).await
    }

    async fn status(&self, run: &RunId) -> Result<Option<RunStatus>, Report<BackendError>> {
        self.read_status(run).await.change_context(BackendError)
    }

    /// Restate raises the cancellation in the run at its next step, so a step that is executing
    /// finishes and is recorded. A run that has not begun is removed.
    async fn cancel(&self, run: &RunId) -> Result<(), Report<BackendError>> {
        self.cancel_run(run).await.change_context(BackendError)
    }
}

impl RestateBackend {
    async fn start_run(&self, run: &RunId, start: RunStart) -> Result<(), Report<StartError>> {
        let admission = start.admission;
        let start = Start {
            version: start.version.get(),
            policy: start.policy,
            input: start.input,
        };
        let invocations = self
            .invocations(&format!(
                "idempotency_key = '{run}' OR (target_service_key = '{admission}' AND \
                 completion_result IS NULL)"
            ))
            .await
            .change_context(StartError::Backend)?;

        if let Some(started) = invocations
            .iter()
            .find(|invocation| invocation.idempotency_key == run.as_ref())
        {
            let recorded = self
                .recorded_start(started)
                .await
                .change_context(StartError::Backend)?;
            return if started.target_service_key == admission.as_ref() && recorded == start {
                Ok(())
            } else {
                Err(Report::new(StartError::StartMismatch))
            };
        }
        if let Some(active) = invocations.first() {
            let active = active
                .idempotency_key
                .parse()
                .change_context(StartError::Backend)?;
            return Err(Report::new(StartError::AlreadyActive { active }));
        }

        self.http
            .post(format!(
                "{}/restate/send/IntegrationRun/{}/run",
                self.config.ingress_url,
                path_segment(admission.as_ref())
            ))
            .header("idempotency-key", run.as_ref())
            .json(&start)
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
            .change_context(StartError::Backend)?;
        Ok(())
    }

    /// Reads the start a run was sent with, which is the input in the first entry of its journal.
    async fn recorded_start(&self, invocation: &Invocation) -> Result<Start, Report<RestateError>> {
        #[derive(Deserialize)]
        struct Entry {
            entry_json: String,
        }

        let entries: Vec<Entry> = self
            .query(&format!(
                "SELECT entry_json FROM sys_journal WHERE id = '{}' AND index = 0",
                invocation.id
            ))
            .await?;
        let entry = entries.first().ok_or(RestateError::Recorded)?;
        let entry: serde_json::Value =
            serde_json::from_str(&entry.entry_json).change_context(RestateError::Recorded)?;
        let input: Vec<u8> = entry
            .pointer("/Command/Input/payload")
            .cloned()
            .map(serde_json::from_value)
            .ok_or(RestateError::Recorded)?
            .change_context(RestateError::Recorded)?;
        serde_json::from_slice(&input).change_context(RestateError::Recorded)
    }

    async fn cancel_run(&self, run: &RunId) -> Result<(), Report<RestateError>> {
        let unfinished = self
            .invocations(&format!(
                "idempotency_key = '{run}' AND completion_result IS NULL"
            ))
            .await?;
        for invocation in unfinished {
            self.http
                .patch(format!(
                    "{}/invocations/{}/cancel",
                    self.config.admin_url, invocation.id
                ))
                .send()
                .await
                .and_then(reqwest::Response::error_for_status)
                .change_context(RestateError::Request)?;
        }
        Ok(())
    }

    /// Reads the runs that match `filter` from Restate's `sys_invocation` table.
    async fn invocations(&self, filter: &str) -> Result<Vec<Invocation>, Report<RestateError>> {
        self.query(&format!(
            "SELECT id, idempotency_key, target_service_key, completion_result, \
             completion_failure FROM sys_invocation WHERE target_service_name = 'IntegrationRun' \
             AND ({filter})"
        ))
        .await
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

        let invocations = self
            .invocations(&format!("idempotency_key = '{run}'"))
            .await?;
        let Some(invocation) = invocations.first() else {
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

/// An object key as a segment of a URL path. A key can hold `/`, which separates segments.
fn path_segment(key: &str) -> String {
    key.replace('/', "%2F")
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
