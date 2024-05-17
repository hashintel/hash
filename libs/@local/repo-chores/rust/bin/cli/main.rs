#![feature(lint_reasons)]

use std::error::Error;

use clap::Parser;

mod subcommand;

/// Arguments passed to the program.
#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
struct Args {
    /// Specify a subcommand to run.
    #[command(subcommand)]
    subcommand: subcommand::Subcommand,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error + Send + Sync>> {
    Args::parse().subcommand.run().await
}
