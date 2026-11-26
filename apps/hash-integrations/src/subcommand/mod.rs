mod completions;
mod sync;

use error_stack::Report;

pub use self::{
    completions::{CompletionsArgs, completions},
    sync::{Sync, SyncError},
};

/// Subcommand for the program.
#[derive(Debug, clap::Subcommand)]
pub enum Subcommand {
    /// Generate a completion script for the given shell and outputs it to stdout.
    Completions(Box<CompletionsArgs>),
    /// Take a run of an integration through the stages of its pipeline.
    #[command(subcommand)]
    Sync(Sync),
}

impl Subcommand {
    /// Runs the subcommand.
    ///
    /// # Errors
    ///
    /// Returns the [`SyncError`] of a `sync` command that failed.
    pub(crate) async fn execute(self) -> Result<(), Report<SyncError>> {
        match self {
            Self::Completions(args) => {
                completions(&args);
                Ok(())
            }
            Self::Sync(command) => command.execute().await,
        }
    }
}
