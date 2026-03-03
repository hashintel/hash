mod completions;
mod migrate;
mod reindex_cache;
mod server;
mod snapshot;
#[cfg(feature = "test-server")]
mod test_server;
mod type_fetcher;

use core::time::Duration;

use error_stack::{Report, ensure};
use hash_telemetry::{TracingConfig, init_tracing};
use tokio::time::sleep;

#[cfg(feature = "test-server")]
pub use self::test_server::{TestServerArgs, test_server};
pub use self::{
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
    Server(ServerArgs),
    /// Run database migrations required by the Graph.
    Migrate(MigrateArgs),
    /// Run the type fetcher to request external types.
    TypeFetcher(TypeFetcherArgs),
    /// Generate a completion script for the given shell and outputs it to stdout.
    Completions(CompletionsArgs),
    /// Snapshot API for the database.
    Snapshot(SnapshotArgs),
    /// Re-indexes the cache.
    ///
    /// This is only needed if the backend was changed in an uncommon way such as schemas being
    /// updated in place. This is a rare operation and should be avoided if possible.
    ReindexCache(ReindexCacheArgs),
    /// Run the Graph test server.
    #[cfg(feature = "test-server")]
    TestServer(TestServerArgs),
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
            Self::Server(args) => block_on(server(args), "Graph API", tracing_config),
            Self::Migrate(args) => block_on(migrate(args), "Graph Migrations", tracing_config),
            Self::TypeFetcher(args) => block_on(type_fetcher(args), "Type Fetcher", tracing_config),
            Self::Completions(ref args) => {
                completions(args);
                Ok(())
            }
            Self::Snapshot(args) => block_on(snapshot(args), "Graph Snapshot", tracing_config),
            Self::ReindexCache(args) => {
                block_on(reindex_cache(args), "Graph Indexer", tracing_config)
            }
            #[cfg(feature = "test-server")]
            Self::TestServer(args) => block_on(test_server(args), "Graph Test API", tracing_config),
        }
    }
}

pub async fn wait_healthcheck<F, Ret>(
    func: F,
    wait: bool,
    wait_timeout: Option<Duration>,
) -> Result<(), Report<HealthcheckError>>
where
    F: Fn() -> Ret + Send,
    Ret: Future<Output = Result<(), Report<HealthcheckError>>> + Send,
{
    let expected_end_time = wait_timeout.map(|timeout| std::time::Instant::now() + timeout);

    loop {
        if func().await.is_ok() {
            return Ok(());
        }
        ensure!(wait, HealthcheckError::NotHealthy);
        if let Some(end_time) = expected_end_time
            && std::time::Instant::now() > end_time
        {
            return Err(HealthcheckError::Timeout.into());
        }
        sleep(Duration::from_secs(1)).await;
    }
}
