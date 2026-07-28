//! The standalone binary's shell: the command line and the entry point.

use clap::{Parser, Subcommand};

use super::{FitArgs, PostgresArgs, ProbeArgs, ReportCommand};

/// The standalone atlas binary's command line.
///
/// The operator commands over the generation root and the live store; serving stays exclusive to
/// the `hash-graph` binary.
#[derive(Debug, Parser)]
#[command(name = "hash-graph-atlas")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

/// The standalone atlas binary's commands.
#[derive(Debug, Subcommand)]
enum Command {
    /// Fits one generation over the live store and activates it on admission.
    Fit {
        #[command(flatten)]
        store: PostgresArgs,

        // The fit flags dwarf the other variants; the box keeps the enum small.
        #[command(flatten)]
        args: Box<FitArgs>,
    },

    /// Solves one fold subset from a published generation's frozen corpus and dumps every
    /// receipt.
    Probe(ProbeArgs),

    /// Compiles an analysis bundle over a published generation.
    Report {
        #[command(subcommand)]
        command: ReportCommand,
    },
}

/// Renders a command's failure chain to stderr and returns the failure exit code.
#[cfg(feature = "cli")]
#[expect(
    clippy::print_stderr,
    reason = "the rendered failure chain is the binary shell's product"
)]
fn render_failure(error: &dyn core::error::Error) -> std::process::ExitCode {
    eprintln!("error: {error}");
    let mut source = error.source();
    while let Some(cause) = source {
        eprintln!("  caused by: {cause}");
        source = cause.source();
    }

    std::process::ExitCode::FAILURE
}

/// Runs the standalone atlas binary: parses the command line, installs the log renderer, and
/// dispatches the command.
///
/// The returned exit code is the command's verdict: success, or failure with the error chain
/// rendered to stderr.
///
/// # Panics
///
/// Panics when the tokio runtime cannot start or a global log subscriber is already installed.
#[cfg(feature = "cli")]
#[must_use]
#[tokio::main]
pub async fn main() -> std::process::ExitCode {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let cli = Cli::parse();
    match cli.command {
        Command::Fit { store, args } => {
            let mut client = match store.connect().await {
                Ok(client) => client,
                Err(error) => return render_failure(&error),
            };
            match super::FitCommand::from(*args).run(&mut client).await {
                Ok(()) => std::process::ExitCode::SUCCESS,
                Err(error) => render_failure(&error),
            }
        }
        Command::Probe(args) => {
            args.run().await;
            std::process::ExitCode::SUCCESS
        }
        Command::Report { command } => match command.run().await {
            Ok(()) => std::process::ExitCode::SUCCESS,
            Err(error) => render_failure(&error),
        },
    }
}
