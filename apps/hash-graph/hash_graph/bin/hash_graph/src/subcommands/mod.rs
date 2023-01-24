pub mod completions;
pub mod migrate;
pub mod server;

pub use self::{completions::CompletionsArgs, migrate::MigrateArgs, server::ServerArgs};

/// Subcommand for the program.
#[derive(Debug, clap::Subcommand)]
pub enum Subcommand {
    /// Run the Graph webserver.
    Server(ServerArgs),
    /// Run database migrations required by the Graph.
    Migrate(MigrateArgs),
    /// Generate a completion script for the given shell and outputs it to stdout.
    Completions(CompletionsArgs),
}
