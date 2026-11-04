use core::error::Error;

use clap::{CommandFactory as _, FromArgMatches as _};
use hash_repo_chores::cli::Args;
use hash_telemetry::TracingConfig;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error + Send + Sync>> {
    let mut matches =
        TracingConfig::with_namespace_flag(Args::command(), std::env::args_os()).get_matches();
    let args = Args::from_arg_matches_mut(&mut matches)
        .unwrap_or_else(|error| error.format(&mut Args::command()).exit());

    args.run().await
}
