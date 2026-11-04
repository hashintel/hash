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

/// The command the program parses its arguments with.
fn cli() -> clap::Command {
    TracingConfig::with_namespace(Entry::command(), "HASH_GRAPH")
}

fn main() -> Result<(), Box<dyn Error>> {
    let mut matches = cli().get_matches();
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

#[cfg(test)]
mod tests {
    use clap::CommandFactory as _;
    use hash_telemetry::TracingConfig;

    use super::{Entry, cli};

    fn env_name<'command>(command: &'command clap::Command, id: &str) -> Option<&'command str> {
        command
            .get_arguments()
            .find(|arg| arg.get_id() == id)?
            .get_env()?
            .to_str()
    }

    #[test]
    fn command_valid() {
        cli().debug_assert();
    }

    #[test]
    fn cli_env_default() {
        let command = cli();

        assert_eq!(
            env_name(&command, "logging-console-level"),
            Some("HASH_GRAPH_LOG_CONSOLE_LEVEL"),
            "the telemetry arguments should read the `HASH_GRAPH_` variables"
        );
        assert_eq!(
            env_name(&command, "endpoint"),
            Some("HASH_OTLP_ENDPOINT"),
            "the OTLP endpoint should keep its variable"
        );
    }

    #[test]
    fn cli_env_custom_namespace() {
        let command = TracingConfig::with_namespace(Entry::command(), "TEST");

        assert_eq!(
            env_name(&command, "logging-console-level"),
            Some("TEST_LOG_CONSOLE_LEVEL"),
            "the telemetry arguments should read the namespace's variables"
        );
        assert_eq!(
            env_name(&command, "endpoint"),
            Some("HASH_OTLP_ENDPOINT"),
            "the OTLP endpoint should keep its variable"
        );
        command.debug_assert();
    }
}
