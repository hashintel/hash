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

/// A handle to a spawned server task that supports graceful shutdown.
///
/// When awaited (via [`IntoFuture`]), it cancels the server's shutdown token and waits for the
/// task to complete.
#[must_use = "server task must be awaited to ensure graceful shutdown"]
pub(crate) struct ServerTaskTracker {
    tracker: TaskTracker,
    cancellation_token: CancellationToken,
}

impl ServerTaskTracker {
    pub(crate) fn new() -> (Self, CancellationToken) {
        let cancellation_token = CancellationToken::new();
        (
            Self {
                tracker: TaskTracker::new(),
                cancellation_token: cancellation_token.clone(),
            },
            cancellation_token,
        )
    }

    pub(crate) fn spawn(&self, future: impl Future<Output = ()> + Send + 'static) {
        self.tracker.spawn(future);
    }
}

impl IntoFuture for ServerTaskTracker {
    type Output = ();

    type IntoFuture = impl Future<Output = Self::Output>;

    fn into_future(self) -> Self::IntoFuture {
        async move {
            self.tracker.close();
            self.cancellation_token.cancel();
            self.tracker.wait().await;
        }
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
