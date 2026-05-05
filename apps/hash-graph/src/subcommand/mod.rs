mod admin_server;
mod completions;
mod migrate;
mod reindex_cache;
mod server;
mod snapshot;
mod type_fetcher;

use core::time::Duration;
use std::time::Instant;

use clap::Parser;
use error_stack::{Report, ensure};
use hash_telemetry::{TracingConfig, init_tracing};
use tokio::time::sleep;
use tokio_util::{sync::CancellationToken, task::TaskTracker};

/// Drop guard that fires the `abort` token when a server task exits unexpectedly.
///
/// "Unexpectedly" means the `shutdown` token has not been cancelled yet. This covers both
/// error returns and panics (which drop the future and thus the guard).
struct ShutdownGuard {
    name: &'static str,
    shutdown: CancellationToken,
    abort: CancellationToken,
}

impl Drop for ShutdownGuard {
    fn drop(&mut self) {
        if !self.shutdown.is_cancelled() {
            tracing::error!("{} exited unexpectedly, initiating shutdown", self.name);
            self.abort.cancel();
        }
    }
}

/// Shared tokens for coordinating server lifecycle.
///
/// - `shutdown`: signals all server components to stop gracefully.
/// - `abort`: fired when a component exits unexpectedly (crash or panic), which triggers shutdown
///   of all remaining components.
#[derive(Clone)]
pub(crate) struct ServerLifecycle {
    pub shutdown: CancellationToken,
    pub abort: CancellationToken,
    tracker: TaskTracker,
}

impl ServerLifecycle {
    pub(crate) fn new() -> Self {
        Self {
            shutdown: CancellationToken::new(),
            abort: CancellationToken::new(),
            tracker: TaskTracker::new(),
        }
    }

    /// Spawns a named server task.
    ///
    /// If the future completes while `shutdown` has not been requested, this is treated as an
    /// unexpected exit and `abort` is cancelled to trigger shutdown of all remaining components.
    /// This also fires on panics via the [`ShutdownGuard`] drop implementation.
    pub(crate) fn spawn(
        &self,
        name: &'static str,
        future: impl Future<Output = Result<(), Report<GraphError>>> + Send + 'static,
    ) {
        let shutdown = self.shutdown.clone();
        let abort = self.abort.clone();
        self.tracker.spawn(async move {
            let _guard = ShutdownGuard {
                name,
                shutdown,
                abort,
            };
            if let Err(report) = future.await {
                tracing::error!(error = ?report, "{name} failed");
            }
        });
    }

    /// Initiates graceful shutdown and waits for all tasks to drain.
    pub(crate) async fn shutdown_and_wait(&self) {
        self.shutdown.cancel();
        self.tracker.close();
        self.tracker.wait().await;
    }
}

/// Shared healthcheck arguments for all server subcommands.
#[derive(Debug, Clone, Parser)]
pub(crate) struct HealthcheckArgs {
    /// Runs the healthcheck for the server.
    #[clap(long, default_value_t = false)]
    pub healthcheck: bool,

    /// Waits for the healthcheck to become healthy.
    #[clap(long, default_value_t = false, requires = "healthcheck")]
    pub wait: bool,

    /// Timeout for the wait flag in seconds.
    #[clap(long, requires = "wait")]
    pub timeout: Option<u64>,
}

pub use self::{
    admin_server::{AdminServerArgs, admin_server},
    completions::{CompletionsArgs, completions},
    migrate::{MigrateArgs, migrate},
    server::{ServerArgs, server},
    snapshot::{SnapshotArgs, snapshot},
    type_fetcher::{TypeFetcherArgs, type_fetcher},
};
use crate::{
    error::{GraphError, HealthcheckError},
    subcommand::reindex_cache::{ReindexCacheArgs, reindex_cache},
};

/// Subcommand for the program.
#[derive(Debug, clap::Subcommand)]
pub enum Subcommand {
    /// Run the Graph webserver.
    Server(Box<ServerArgs>),
    /// Run the admin server for database management operations.
    ///
    /// In production, run this as a dedicated process separate from the main API server.
    /// For development, you can use `server --embed-admin` to embed it instead.
    AdminServer(Box<AdminServerArgs>),
    /// Run database migrations required by the Graph.
    Migrate(Box<MigrateArgs>),
    /// Run the type fetcher to request external types.
    TypeFetcher(Box<TypeFetcherArgs>),
    /// Generate a completion script for the given shell and outputs it to stdout.
    Completions(Box<CompletionsArgs>),
    /// Snapshot API for the database.
    Snapshot(Box<SnapshotArgs>),
    /// Re-indexes the cache.
    ///
    /// This is only needed if the backend was changed in an uncommon way such as schemas being
    /// updated in place. This is a rare operation and should be avoided if possible.
    ReindexCache(Box<ReindexCacheArgs>),
}

fn block_on(
    future: impl Future<Output = Result<(), Report<GraphError>>>,
    service_name: &'static str,
    tracing_config: TracingConfig,
) -> Result<(), Report<GraphError>> {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("failed to create runtime")
        .block_on(async {
            let _telemetry_guard = init_tracing(tracing_config, service_name)
                .expect("should be able to initialize telemetry");

            future.await
        })
}

impl Subcommand {
    pub(crate) fn execute(self, tracing_config: TracingConfig) -> Result<(), Report<GraphError>> {
        match self {
            Self::Server(args) => block_on(server(*args), "Graph API", tracing_config),
            Self::AdminServer(args) => {
                block_on(admin_server(*args), "Graph Admin API", tracing_config)
            }
            Self::Migrate(args) => block_on(migrate(*args), "Graph Migrations", tracing_config),
            Self::TypeFetcher(args) => {
                block_on(type_fetcher(*args), "Type Fetcher", tracing_config)
            }
            Self::Completions(ref args) => {
                completions(args);
                Ok(())
            }
            Self::Snapshot(args) => block_on(snapshot(*args), "Graph Snapshot", tracing_config),
            Self::ReindexCache(args) => {
                block_on(reindex_cache(*args), "Graph Indexer", tracing_config)
            }
        }
    }
}

pub async fn wait_healthcheck<F, Ret>(
    func: F,
    args: &HealthcheckArgs,
) -> Result<(), Report<HealthcheckError>>
where
    F: Fn() -> Ret + Send,
    Ret: Future<Output = Result<(), Report<HealthcheckError>>> + Send,
{
    let expected_end_time = args
        .timeout
        .map(|timeout| Instant::now() + Duration::from_secs(timeout));

    loop {
        if func().await.is_ok() {
            return Ok(());
        }
        ensure!(args.wait, HealthcheckError::NotHealthy);
        if let Some(end_time) = expected_end_time
            && Instant::now() > end_time
        {
            return Err(HealthcheckError::Timeout.into());
        }
        sleep(Duration::from_secs(1)).await;
    }
}
