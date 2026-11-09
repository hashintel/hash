use core::error::Error;

use clap::{Command, CommandFactory as _, FromArgMatches as _};
use hash_repo_chores::cli::Args;
use hash_telemetry::TracingConfig;

/// The command the program parses its arguments with.
fn cli() -> Command {
    TracingConfig::with_namespace(Args::command(), "HASH_GRAPH")
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error + Send + Sync>> {
    let mut matches = cli().get_matches();
    let args = Args::from_arg_matches_mut(&mut matches)
        .unwrap_or_else(|error| error.format(&mut Args::command()).exit());

    args.run().await
}

#[cfg(test)]
mod tests {
    use super::cli;

    #[test]
    fn command_valid() {
        cli().debug_assert();
    }
}
