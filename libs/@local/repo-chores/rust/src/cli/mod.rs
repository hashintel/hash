use core::error::Error;

use clap::Parser;
use hash_telemetry::{TracingConfig, init_tracing};

pub mod subcommand;

/// Arguments passed to the program.
#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct Args {
    /// Specify a subcommand to run.
    #[command(subcommand)]
    subcommand: subcommand::Subcommand,

    /// Tracing/logging configuration.
    #[clap(flatten)]
    tracing_config: TracingConfig,
}

impl Args {
    /// Run the CLI.
    ///
    /// # Errors
    ///
    /// Returns an error if the subcommand fails to run.
    ///
    /// # Panics
    ///
    /// If the telemetry initialization fails.
    pub async fn run(self) -> Result<(), Box<dyn Error + Send + Sync>> {
        let _telemetry_guard = init_tracing(self.tracing_config, "Repo Chores")
            .expect("should be able to initialize telemetry");

        self.subcommand.run().await
    }
}
