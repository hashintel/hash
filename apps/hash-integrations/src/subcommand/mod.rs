mod completions;

pub use self::completions::{CompletionsArgs, completions};

/// Subcommand for the program.
#[derive(Debug, clap::Subcommand)]
pub enum Subcommand {
    /// Generate a completion script for the given shell and outputs it to stdout.
    Completions(Box<CompletionsArgs>),
}

impl Subcommand {
    pub(crate) fn execute(self) {
        match self {
            Self::Completions(args) => completions(&args),
        }
    }
}
