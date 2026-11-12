mod completions;
#[expect(
    dead_code,
    reason = "no orchestration backend is available to run them yet"
)]
mod run;

use error_stack::{Report, bail};

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
    /// Request cancellation of a run and print its ID as JSON.
    Cancel(Box<RunArgs>),
}

impl Subcommand {
    pub(crate) fn execute(self) -> Result<(), Report<SubcommandError>> {
        match self {
            Self::Completions(args) => {
                completions(&args);
                Ok(())
            }
            Self::Submit(_) | Self::Status(_) | Self::Cancel(_) => {
                bail!(SubcommandError::NoBackend)
            }
        }
    }
}
