mod completions;
mod migrate;
mod server;
mod snapshot;
#[cfg(all(hash_graph_test_environment, feature = "test_server"))]
mod test_server;
#[cfg(feature = "type-fetcher")]
mod type_fetcher;

#[cfg(all(hash_graph_test_environment, feature = "test_server"))]
pub use self::test_server::{test_server, TestServerArgs};
#[cfg(feature = "type-fetcher")]
pub use self::type_fetcher::{type_fetcher, TypeFetcherArgs};
pub use self::{
    completions::{completions, CompletionsArgs},
    migrate::{migrate, MigrateArgs},
    server::{server, ServerArgs},
    snapshot::{snapshot, SnapshotArgs},
};

/// Subcommand for the program.
#[derive(Debug, clap::Subcommand)]
pub enum Subcommand {
    /// Run the Graph webserver.
    Server(ServerArgs),
    /// Run database migrations required by the Graph.
    Migrate(MigrateArgs),
    /// Run the type fetcher to request external types.
    #[cfg(feature = "type-fetcher")]
    TypeFetcher(TypeFetcherArgs),
    /// Generate a completion script for the given shell and outputs it to stdout.
    Completions(CompletionsArgs),
    /// Snapshot API for the database.
    Snapshot(SnapshotArgs),
    /// Test server
    #[cfg(all(hash_graph_test_environment, feature = "test_server"))]
    TestServer(TestServerArgs),
}
