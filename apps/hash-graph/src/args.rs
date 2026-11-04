use clap::{
    ColorChoice, Command, CommandFactory as _, FromArgMatches as _, Parser,
    builder::{
        Styles,
        styling::{AnsiColor, Effects},
    },
};
use hash_telemetry::TracingConfig;

use crate::subcommand::{Subcommand, WorkerThreads};

/// Arguments passed to the program.
#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct Args {
    #[clap(flatten)]
    pub tracing_config: TracingConfig,

    /// Number of threads in the global worker pool used for CPU-bound work such as entity
    /// clustering.
    ///
    /// Accepts a fixed count (e.g. `4`) or a count relative to the available CPU cores: `n` for
    /// all cores, `n/2` for half, `n/4` for a quarter, and so on.
    #[clap(
        long,
        global = true,
        default_value_t,
        env = "HASH_GRAPH_WORKER_THREADS"
    )]
    pub worker_threads: WorkerThreads,

    /// Specify a subcommand to run.
    #[command(subcommand)]
    pub subcommand: Subcommand,
}

impl Args {
    /// The command the program parses its arguments with.
    fn cli() -> Command {
        TracingConfig::with_namespace_flag(Self::command(), std::env::args_os())
            .color(ColorChoice::Auto)
            .styles(
                Styles::styled()
                    .header(AnsiColor::Green.on_default() | Effects::BOLD)
                    .usage(AnsiColor::Green.on_default() | Effects::BOLD)
                    .literal(AnsiColor::Blue.on_default() | Effects::BOLD)
                    .placeholder(AnsiColor::Cyan.on_default())
                    .error(AnsiColor::Red.on_default() | Effects::BOLD)
                    .valid(AnsiColor::Green.on_default() | Effects::BOLD)
                    .invalid(AnsiColor::Red.on_default() | Effects::BOLD),
            )
    }

    /// Parse the arguments passed to the program.
    pub fn parse_args() -> Self {
        let mut matches = Self::cli().get_matches();
        match Self::from_arg_matches_mut(&mut matches) {
            Ok(args) => args,
            Err(error) => error.format(&mut Self::command()).exit(),
        }
    }
}

#[cfg(test)]
mod tests {
    use clap::{Command, CommandFactory as _};
    use hash_telemetry::TracingConfig;

    use super::Args;

    fn env_name<'command>(command: &'command Command, id: &str) -> Option<&'command str> {
        command
            .get_arguments()
            .find(|arg| arg.get_id() == id)?
            .get_env()?
            .to_str()
    }

    #[test]
    fn command_valid() {
        // Fails on what clap otherwise reports only when the server starts, such as two arguments
        // with the same ID.
        Args::cli().debug_assert();
    }

    #[test]
    fn cli_env_default() {
        let command = Args::cli();

        assert_eq!(
            env_name(&command, "logging-console-level"),
            Some("HASH_GRAPH_LOG_CONSOLE_LEVEL"),
            "the telemetry arguments should read the `HASH_GRAPH_` variables"
        );
        assert_eq!(
            env_name(&command, "worker_threads"),
            Some("HASH_GRAPH_WORKER_THREADS"),
            "the graph's own arguments should read the `HASH_GRAPH_` variables"
        );
    }

    #[test]
    fn cli_env_custom_prefix() {
        let command = TracingConfig::with_namespace_flag(
            Args::command(),
            ["hash-graph", "server", "--telemetry-namespace", "TEST"],
        );

        assert_eq!(
            env_name(&command, "logging-console-level"),
            Some("TEST_LOG_CONSOLE_LEVEL"),
            "the telemetry arguments should read the prefixed variables"
        );
        assert_eq!(
            env_name(&command, "worker_threads"),
            Some("HASH_GRAPH_WORKER_THREADS"),
            "the graph's own arguments should keep their variables"
        );
        command.debug_assert();
    }
}
