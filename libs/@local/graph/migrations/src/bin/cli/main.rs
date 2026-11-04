#![feature(
    // Language Features
    return_type_notation,
)]
#![expect(clippy::future_not_send)]

pub use self::subcommand::Subcommand;

mod subcommand;

use core::error::Error;

use clap::{CommandFactory as _, FromArgMatches as _};
use hash_telemetry::{TracingConfig, init_tracing};

pub trait Command {
    async fn execute(self) -> Result<(), Box<dyn Error>>;
}

/// Arguments passed to the program.
#[derive(Debug, clap::Parser)]
#[clap(version, author, about, long_about = None)]
pub struct Entry {
    #[clap(flatten)]
    pub tracing_config: TracingConfig,
    /// Specify a subcommand to run.
    #[command(subcommand)]
    pub subcommand: Subcommand,
}

fn main() -> Result<(), Box<dyn Error>> {
    let mut matches =
        TracingConfig::with_namespace_flag(Entry::command(), std::env::args_os()).get_matches();
    let entry = Entry::from_arg_matches_mut(&mut matches)
        .unwrap_or_else(|error| error.format(&mut Entry::command()).exit());

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?
        .block_on(async {
            let _telemetry_guard = init_tracing(entry.tracing_config, "Graph Migrations")
                .expect("should be able to initialize telemetry");

            entry.subcommand.execute().await
        })
}
