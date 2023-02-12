mod completions;
mod migrate;
mod server;
#[cfg(feature = "type-fetcher")]
mod type_fetcher;

#[cfg(feature = "type-fetcher")]
pub use self::type_fetcher::{type_fetcher, TypeFetcherArgs};
pub use self::{
    completions::{completions, CompletionsArgs},
    migrate::{migrate, MigrateArgs},
    server::{server, ServerArgs},
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
}
