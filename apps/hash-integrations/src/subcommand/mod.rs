mod completions;
mod run;

use error_stack::Report;

pub use self::{
    completions::{CompletionsArgs, completions},
    run::{RunArgs, SubcommandError, SubmitArgs},
};

/// Subcommand for the program.
#[derive(Debug, clap::Subcommand)]
pub enum Subcommand {
    /// Generate a completion script for the given shell and outputs it to stdout.
    Completions(Box<CompletionsArgs>),
    /// Submit an integration definition and print the ID of its run as JSON.
    Submit(Box<SubmitArgs>),
    /// Print the status of a run as JSON.
    Status(Box<RunArgs>),
    /// Request cancellation of a run and print its ID as JSON. A finished or unknown run is not an
    /// error.
    Cancel(Box<RunArgs>),
}

impl Subcommand {
    /// Runs the subcommand. `submit`, `status` and `cancel` run on the Restate server their
    /// arguments name.
    ///
    /// # Errors
    ///
    /// Returns the [`SubcommandError`] of `submit`, `status` or `cancel`.
    pub(crate) async fn execute(self) -> Result<(), Report<SubcommandError>> {
        match self {
            Self::Completions(args) => {
                completions(&args);
                Ok(())
            }
            Self::Submit(args) => run::submit(args.restate.backend(), *args).await,
            Self::Status(args) => run::status(args.restate.backend(), *args).await,
            Self::Cancel(args) => run::cancel(args.restate.backend(), *args).await,
        }
    }
}
