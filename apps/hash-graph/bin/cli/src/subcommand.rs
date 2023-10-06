mod completions;
mod migrate;
mod server;
mod snapshot;
#[cfg(all(hash_graph_test_environment, feature = "test-server"))]
mod test_server;
mod type_fetcher;

use std::future::Future;

use error_stack::Result;

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

fn block_on(future: impl Future<Output = Result<(), GraphError>>) -> Result<(), GraphError> {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("failed to create runtime")
        .block_on(future)
}

impl Subcommand {
    pub(crate) fn execute(self) -> Result<(), GraphError> {
        match self {
            Self::Server(args) => block_on(server(args)),
            Self::Migrate(args) => block_on(migrate(args)),
            Self::TypeFetcher(args) => block_on(type_fetcher(args)),
            Self::Completions(ref args) => {
                completions(args);
                Ok(())
            }
            Self::Snapshot(args) => block_on(snapshot(args)),
            #[cfg(all(hash_graph_test_environment, feature = "test-server"))]
            Self::TestServer(args) => block_on(test_server(args)),
        }
    }
}
