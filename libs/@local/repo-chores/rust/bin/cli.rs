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
    use clap::{Command, CommandFactory as _};
    use hash_telemetry::TracingConfig;

    use super::{Args, cli};

    fn env_name<'command>(command: &'command Command, id: &str) -> Option<&'command str> {
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
        let command = TracingConfig::with_namespace(Args::command(), "TEST");

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
