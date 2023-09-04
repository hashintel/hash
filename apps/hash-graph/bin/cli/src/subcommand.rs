mod completions;
mod migrate;
mod server;
mod snapshot;
#[cfg(all(hash_graph_test_environment, feature = "test-server"))]
mod test_server;
mod type_fetcher;

use error_stack::Result;
use graph::logging::LoggingArgs;

#[cfg(all(hash_graph_test_environment, feature = "test-server"))]
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
    #[cfg(all(hash_graph_test_environment, feature = "test-server"))]
    TestServer(TestServerArgs),
}

impl Subcommand {
    async fn delegate(self) -> Result<(), GraphError> {
        match self {
            Self::Server(args) => server(args).await,
            Self::Migrate(args) => migrate(args).await,
            Self::TypeFetcher(args) => type_fetcher(args).await,
            Self::Completions(ref args) => {
                completions(args);
                Ok(())
            }
            Self::Snapshot(args) => snapshot(args).await,
            #[cfg(all(hash_graph_test_environment, feature = "test-server"))]
            Self::TestServer(args) => test_server(args).await,
        }
    }

    pub(crate) fn execute(self) -> Result<(), GraphError> {
        // create a runtime
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("failed to create runtime");

        runtime.block_on(self.delegate())
    }
}
