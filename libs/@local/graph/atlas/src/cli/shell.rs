//! The standalone binary's command line and entry point.

use camino::Utf8PathBuf;
use clap::{Parser, Subcommand, ValueHint};

#[cfg(feature = "cli")]
use super::EmbedderArgs;
use super::{DumpArgs, FitArgs, PostgresArgs, ReportCommand, RootArgs};
use crate::integrity::SecretString;

/// The standalone atlas binary's command line.
///
/// The operator commands over the generation root and the live store. Serving stays exclusive to
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
    /// Fits one generation over the live store or a dump directory and activates it on admission.
    Fit {
        #[command(flatten)]
        root: RootArgs,

        #[command(flatten)]
        store: PostgresArgs,

        // The fit flags dwarf the other variants, so the box keeps the enum small.
        #[command(flatten)]
        args: Box<FitArgs>,

        /// The OpenAI API key the embedding provider authenticates with.
        #[arg(
            long,
            env = "OPENAI_API_KEY",
            hide_env_values = true,
            required_unless_present = "offline"
        )]
        openai_api_key: Option<SecretString>,

        /// Fit from the dump directory instead of the live store.
        ///
        /// The dump supplies the snapshot and every embedding, so the run reaches neither the
        /// store nor the embedding provider, and the store flags and the provider key are read by
        /// nothing. The generation's metadata records the dump as the fit's source.
        #[arg(long, value_name = "DUMP", value_hint = ValueHint::DirPath)]
        offline: Option<Utf8PathBuf>,

        /// Watch the run on the live dashboard instead of a log stream.
        ///
        /// The stage rail, its timings, the placement's loss curve, and the log tail draw in place
        /// until the run ends. `q` or Ctrl-C stops the process as an interrupt would. The
        /// dashboard belongs to this binary: the graph server always logs.
        #[arg(long)]
        tui: bool,
    },

    /// Compiles an analysis instrument over a published generation.
    Report {
        #[command(subcommand)]
        command: ReportCommand,
    },

    /// Dumps the live store into a directory an offline fit reads in place of the store.
    Dump {
        #[command(flatten)]
        store: PostgresArgs,

        #[command(flatten)]
        args: DumpArgs,
    },
}

/// Where one shell fit reads from, resolved from the parsed flags.
#[cfg(feature = "cli")]
enum FitSource {
    /// Dial the store and embed through the external provider.
    Live {
        /// The store connection flags.
        store: PostgresArgs,
        /// The embedding provider's credential.
        credential: EmbedderArgs,
    },
    /// Read the dump directory in place of the store and the provider both.
    Offline(Utf8PathBuf),
}

/// Resolves the fit flags into the run's source.
#[cfg(feature = "cli")]
fn fit_source(
    store: PostgresArgs,
    openai_api_key: Option<SecretString>,
    offline: Option<Utf8PathBuf>,
) -> FitSource {
    match (offline, openai_api_key) {
        (Some(dump), _) => FitSource::Offline(dump),
        (None, Some(openai_api_key)) => FitSource::Live {
            store,
            credential: EmbedderArgs::new(openai_api_key),
        },
        (None, None) => unreachable!("clap requires the key when `--offline` is absent"),
    }
}

/// One dashboard-hosted fit's failure, by step.
///
/// The dashboard path owns three failures the logged path does not have to distinguish, and an
/// operator reading a restored terminal needs to know which one they hit.
#[cfg(feature = "cli")]
#[derive(Debug)]
enum DashboardError {
    /// Preparing, drawing, or restoring the terminal failed.
    Terminal(std::io::Error),
    /// Dialing the store connection failed.
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
fn render_failure(error: impl core::error::Error) -> std::process::ExitCode {
    eprintln!("error: {error}");
    let mut source = error.source();
    while let Some(cause) = source {
        eprintln!("  caused by: {cause}");
        source = cause.source();
    }

    std::process::ExitCode::FAILURE
}

/// Renders a command's verdict.
#[cfg(feature = "cli")]
#[expect(clippy::print_stdout, reason = "the verdict is the command's product")]
fn render_verdict(verdict: impl core::fmt::Display) {
    println!("{verdict}");
}

/// The log filter of an invocation: the environment's, or informational records.
#[cfg(feature = "cli")]
fn log_filter() -> tracing_subscriber::EnvFilter {
    tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"))
}

/// Runs one fit on the live dashboard, restoring the terminal before rendering anything.
///
/// This installs the subscriber globally rather than around the run, because the pipeline reports
/// from the tokio and rayon halves both and a thread-local dispatcher would collect neither.
///
/// # Errors
///
/// Returns the step that failed - terminal, connection, or the fit itself. The run's failure wins
/// over a terminal failure, since it is the one an operator is trying to read.
#[cfg(feature = "cli")]
async fn fit_on_dashboard(
    root: RootArgs,
    source: FitSource,
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
        let command = super::FitCommand::new(root, args).with_progress(observer);

        match source {
            FitSource::Live { store, credential } => {
                let mut client = store.connect().await.map_err(DashboardError::Connect)?;

                command
                    .run(&mut client, credential)
                    .await
                    .map_err(DashboardError::Fit)
            }
            FitSource::Offline(dump) => command
                .run_offline(&dump)
                .await
                .map_err(DashboardError::Fit),
        }
    }
    .await;

    // The terminal comes back before the process renders either result.
    let restored = dashboard.finish();
    let verdict = outcome?;
    restored.map_err(DashboardError::Terminal)?;

    Ok(verdict)
}

/// Runs the standalone atlas binary.
///
/// Parses the command line and installs the log renderer before dispatching the command. The
/// returned exit code is the command's verdict: success, or failure with the error chain rendered
/// to stderr.
///
/// # Panics
///
/// This panics when the tokio runtime cannot start or a global log subscriber is already
/// installed.
#[cfg(feature = "cli")]
#[must_use]
#[tokio::main]
pub async fn main() -> std::process::ExitCode {
    let cli = <Cli as Parser>::parse();

    // Placed after parsing so the help and version flags work on an unsupported CPU.
    crate::math::kernel::verify_cpu_baseline();

    // The dashboard installs its own subscriber, because records written to stderr would print over
    // the screen it draws.
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
            openai_api_key,
            offline,
            tui: true,
        } => {
            match fit_on_dashboard(root, fit_source(store, openai_api_key, offline), *args).await {
                Ok(verdict) => {
                    render_verdict(verdict);
                    std::process::ExitCode::SUCCESS
                }
                Err(error) => render_failure(error),
            }
        }

        Command::Fit {
            root,
            store,
            args,
            openai_api_key,
            offline,
            tui: false,
        } => {
            let command = super::FitCommand::new(root, *args);
            let result = match fit_source(store, openai_api_key, offline) {
                FitSource::Live { store, credential } => {
                    let mut client = match store.connect().await {
                        Ok(client) => client,
                        Err(error) => return render_failure(error),
                    };

                    command.run(&mut client, credential).await
                }
                FitSource::Offline(dump) => command.run_offline(&dump).await,
            };

            match result {
                Ok(verdict) => {
                    render_verdict(verdict);
                    std::process::ExitCode::SUCCESS
                }
                Err(error) => render_failure(error),
            }
        }

        Command::Report { command } => match command.run().await {
            // The probe dumps its receipts as it solves and hands back no
            // verdict to render.
            Ok(None) => std::process::ExitCode::SUCCESS,
            Ok(Some(verdict)) => {
                render_verdict(verdict);
                std::process::ExitCode::SUCCESS
            }
            Err(error) => render_failure(error),
        },

        Command::Dump { store, args } => {
            let mut client = match store.connect().await {
                Ok(client) => client,
                Err(error) => return render_failure(error),
            };

            match super::DumpCommand::new(args).run(&mut client).await {
                Ok(verdict) => {
                    render_verdict(verdict);
                    std::process::ExitCode::SUCCESS
                }
                Err(error) => render_failure(error),
            }
        }
    }
}

#[cfg(all(test, feature = "cli"))]
mod tests {
    use camino::Utf8PathBuf;
    use clap::Parser as _;

    use super::{Cli, Command};

    /// A scratch generation root for one parse, keyed so libtest's shared process cannot collide.
    ///
    /// Parsing creates the root directory, so each test names its own and removes it afterwards.
    fn scratch_root(name: &str) -> Utf8PathBuf {
        Utf8PathBuf::from_path_buf(std::env::temp_dir())
            .expect("the temp directory is UTF-8")
            .join(format!("atlas-shell-{}-{name}", std::process::id()))
    }

    #[test]
    fn cli_consistency() {
        <Cli as clap::CommandFactory>::command().debug_assert();
    }

    #[test]
    fn offline_without_live_flags() {
        let root = scratch_root("offline_without_live_flags");
        let cli = Cli::try_parse_from([
            "hash-graph-atlas",
            "fit",
            "--root",
            root.as_str(),
            "--annotations",
            "corpus.json",
            "--offline",
            "dump",
        ])
        .expect("an offline fit needs neither the key nor the store flags");
        let _: Result<(), std::io::Error> = std::fs::remove_dir_all(&root);

        assert!(matches!(
            cli.command,
            Command::Fit {
                offline: Some(_),
                ..
            }
        ));
    }
}
