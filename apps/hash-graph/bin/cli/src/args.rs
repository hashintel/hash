use clap::Parser;

use crate::subcommand::Subcommand;

/// Arguments passed to the program.
#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct Args {
    #[arg(long, env = "HASH_GRAPH_SENTRY_DSN")]
    pub sentry_dsn: Option<sentry::types::Dsn>,

    /// Specify a subcommand to run.
    #[command(subcommand)]
    pub subcommand: Subcommand,
}

impl Args {
    /// Parse the arguments passed to the program.
    pub fn parse_args() -> Self {
        Self::parse()
    }
}
