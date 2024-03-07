mod completions;
mod migrate;
mod server;
mod snapshot;
#[cfg(feature = "test-server")]
mod test_server;
mod type_fetcher;

use error_stack::Result;
use hash_tracing::{init_tracing, TracingConfig};

#[cfg(feature = "test-server")]
pub use self::test_server::{test_server, TestServerArgs};
pub use self::{
    completions::{completions, CompletionsArgs},
    migrate::{migrate, MigrateArgs},
    server::{server, ServerArgs},
    snapshot::{snapshot, SnapshotArgs},
    type_fetcher::{type_fetcher, TypeFetcherArgs},
};
use crate::error::GraphError;

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
    /// Test server
    #[cfg(feature = "test-server")]
    TestServer(TestServerArgs),
}

fn block_on(
    future: impl Future<Output = Result<(), GraphError>>,
    tracing_config: TracingConfig,
) -> Result<(), GraphError> {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("failed to create runtime")
        .block_on(async {
            let _log_guard = init_tracing(tracing_config).await;
            future.await
        })
}

impl Subcommand {
    pub(crate) fn execute(self, tracing_config: TracingConfig) -> Result<(), GraphError> {
        match self {
            Self::Server(args) => block_on(server(args), tracing_config),
            Self::Migrate(args) => block_on(migrate(args), tracing_config),
            Self::TypeFetcher(args) => block_on(type_fetcher(args), tracing_config),
            Self::Completions(ref args) => {
                completions(args);
                Ok(())
            }
            Self::Snapshot(args) => block_on(snapshot(args), tracing_config),
            #[cfg(feature = "test-server")]
            Self::TestServer(args) => block_on(test_server(args), tracing_config),
        }
    }
}
