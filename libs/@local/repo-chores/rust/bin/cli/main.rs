use core::error::Error;

use clap::Parser;
use hash_telemetry::{TracingConfig, init_tracing};
use tokio::runtime::Handle;

mod subcommand;

/// Arguments passed to the program.
#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
struct Args {
    /// Specify a subcommand to run.
    #[command(subcommand)]
    subcommand: subcommand::Subcommand,

    /// Tracing/logging configuration
    #[clap(flatten)]
    tracing_config: TracingConfig,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error + Send + Sync>> {
    let args = Args::parse();

    let handle = Handle::current();
    let _log_guard =
        init_tracing(args.tracing_config, &handle).expect("should be able to initialize tracing");

    args.subcommand.run().await
}
