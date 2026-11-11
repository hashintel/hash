//! The orchestration backend on Restate.
//!
//! Restate is a server that journals every step of a run and calls a worker to execute the run.
//! Each module implements one trait of the orchestrator on it:
//!
//! - `worker` implements [`Worker`](crate::Worker). A worker serves the run function over HTTP and
//!   registers its URL with Restate. It has no identity: Restate retries a run whose worker died,
//!   or whose step ran past [`RestateConfig::step_timeout`], on whichever worker answers at
//!   [`RestateConfig::worker_url`].
//! - `run` executes a [`RunFunction`](crate::RunFunction) and is its
//!   [`StepContext`](crate::StepContext). A run is one call of the `IntegrationRun` object, whose
//!   key is the run's admission key, so Restate executes one run per admission key at a time. A
//!   step is a Restate `run` action, whose result Restate journals.
//! - `runs` implements [`Runs`](crate::Runs). Starting a run and cancelling it are one request to
//!   Restate each.
//! - `status` reads a run's status. Restate has no client call for the progress of a run that is
//!   executing, so the status comes from the tables of Restate's admin API.
//! - `token_bucket` implements [`CoordinationStore`](crate::CoordinationStore). A token bucket is
//!   an object keyed by its scope, with the balance as the object's state.

use alloc::string::String;
use core::{net::SocketAddr, time::Duration};

use error_stack::{Report, ResultExt as _};

mod run;
mod runs;
mod status;
mod token_bucket;
mod worker;

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

/// Sends a request to Restate and fails if Restate answers with an error status.
async fn send(request: reqwest::RequestBuilder) -> Result<reqwest::Response, Report<RestateError>> {
    request
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .change_context(RestateError::Request)
}

/// An object key as a segment of a URL path. A key can hold `/`, which separates segments.
fn path_segment(key: &str) -> String {
    key.replace('/', "%2F")
}
