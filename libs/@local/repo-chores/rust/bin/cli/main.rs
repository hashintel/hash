use core::error::Error;

use clap::Parser;
use hash_telemetry::{TracingConfig, init_tracing};

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

    let _telemetry_guard =
        init_tracing(args.tracing_config).expect("should be able to initialize telemetry");

    args.subcommand.run().await
}
