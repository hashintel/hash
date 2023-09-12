use clap::Parser;

use crate::{parser::OptionalSentryDsnParser, subcommand::Subcommand};

/// Arguments passed to the program.
#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct Args {
    // we need to qualify `Option` here, as otherwise `clap` tries to be too smart and only uses
    // the `value_parser` on the internal `sentry::types::Dsn`, failing.
    #[arg(long, env = "HASH_GRAPH_SENTRY_DSN", value_parser = OptionalSentryDsnParser, default_value = None)]
    pub sentry_dsn: core::option::Option<sentry::types::Dsn>,

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
