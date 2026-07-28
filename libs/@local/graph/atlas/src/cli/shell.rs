//! The standalone binary's shell: the command line and the entry point.

use clap::{Parser, Subcommand};

use super::{FitArgs, PostgresArgs, ReportCommand, RootArgs};

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
        root: RootArgs,

        #[command(flatten)]
        store: PostgresArgs,

        // The fit flags dwarf the other variants; the box keeps the enum small.
        #[command(flatten)]
        args: Box<FitArgs>,

        /// Watch the run on the live dashboard instead of a log stream.
        ///
        /// The stage rail, its timings, the placement's loss curve, and the log tail draw in place
        /// until the run ends; `q` or Ctrl-C stops the process as an interrupt would. The
        /// dashboard belongs to this binary: the graph server always logs.
        #[arg(long)]
        tui: bool,
    },

    /// Compiles an analysis instrument over a published generation.
    Report {
        #[command(subcommand)]
        command: ReportCommand,
    },
}

/// One dashboard-hosted fit's failure, by step.
///
/// The dashboard path owns three failures the logged path does not have to distinguish, and an
/// operator reading a restored terminal needs to know which one they hit.
#[cfg(feature = "cli")]
#[derive(Debug)]
enum DashboardError {
    /// The terminal could not be prepared, drawn, or restored.
    Terminal(std::io::Error),
    /// The store connection could not be dialed.
    Connect(super::ConnectError),
    /// The fit failed.
    Fit(super::FitError),
}

#[cfg(feature = "cli")]
impl core::fmt::Display for DashboardError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Terminal(_) => fmt.write_str("the live dashboard could not use the terminal"),
            Self::Connect(_) => fmt.write_str("the store connection could not be dialed"),
            // The fit's own chain is the diagnosis; this variant adds no
            // step of its own.
            Self::Fit(error) => core::fmt::Display::fmt(error, fmt),
        }
    }
}

#[cfg(feature = "cli")]
impl core::error::Error for DashboardError {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        match self {
            Self::Terminal(error) => Some(error),
            Self::Connect(error) => Some(error),
            Self::Fit(error) => error.source(),
        }
    }
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

/// Renders one fit's verdict.
#[cfg(feature = "cli")]
#[expect(clippy::print_stdout, reason = "the verdict is the command's product")]
fn render_verdict(verdict: &super::FitVerdict) {
    println!("{verdict}");
}

/// The log filter of an invocation: the environment's, or informational records.
#[cfg(feature = "cli")]
fn log_filter() -> tracing_subscriber::EnvFilter {
    tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"))
}

/// Runs one fit on the live dashboard, restoring the terminal before anything is rendered.
///
/// The subscriber is installed globally rather than around the run: the pipeline reports from the
/// tokio and rayon halves both, and a thread-local dispatcher would collect neither.
///
/// # Errors
///
/// Returns the step that failed - terminal, connection, or the fit itself. The run's failure wins
/// over a terminal failure, since it is the one an operator is trying to read.
#[cfg(feature = "cli")]
async fn fit_on_dashboard(
    root: RootArgs,
    store: PostgresArgs,
    args: FitArgs,
) -> Result<super::FitVerdict, DashboardError> {
    let dashboard = super::tui::Dashboard::start().map_err(DashboardError::Terminal)?;

    // The dashboard owns the terminal from here, so the records the run
    // emits belong in its pane, not on the screen it is drawing.
    tracing_subscriber::fmt()
        .with_env_filter(log_filter())
        .with_writer(dashboard.log_sink())
        .with_ansi(false)
        .without_time()
        .init();

    let observer = dashboard.observer();
    let outcome = async {
        let mut client = store.connect().await.map_err(DashboardError::Connect)?;

        super::FitCommand::new(root, args)
            .with_progress(observer)
            .run(&mut client)
            .await
            .map_err(DashboardError::Fit)
    }
    .await;

    // The terminal comes back before either result is rendered.
    let restored = dashboard.finish();
    let verdict = outcome?;
    restored.map_err(DashboardError::Terminal)?;

    Ok(verdict)
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
    let cli = Cli::parse();

    // The dashboard installs its own subscriber, because records written
    // to stderr would land on the screen it draws.
    if !matches!(cli.command, Command::Fit { tui: true, .. }) {
        tracing_subscriber::fmt()
            .with_env_filter(log_filter())
            .init();
    }

    match cli.command {
        Command::Fit {
            root,
            store,
            args,
            tui: true,
        } => match fit_on_dashboard(root, store, *args).await {
            Ok(verdict) => {
                render_verdict(&verdict);
                std::process::ExitCode::SUCCESS
            }
            Err(error) => render_failure(&error),
        },

        Command::Fit {
            root,
            store,
            args,
            tui: false,
        } => {
            let mut client = match store.connect().await {
                Ok(client) => client,
                Err(error) => return render_failure(&error),
            };
            match super::FitCommand::new(root, *args).run(&mut client).await {
                Ok(verdict) => {
                    render_verdict(&verdict);
                    std::process::ExitCode::SUCCESS
                }
                Err(error) => render_failure(&error),
            }
        }

        Command::Report { command } => match command.run().await {
            Ok(()) => std::process::ExitCode::SUCCESS,
            Err(error) => render_failure(&error),
        },
    }
}
