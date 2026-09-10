//! The standalone binary's command line and entry point.

#[cfg(feature = "cli")]
use core::panic::UnwindSafe;

use camino::Utf8PathBuf;
use clap::{Parser, Subcommand, ValueHint};

#[cfg(feature = "cli")]
use super::EmbedderArgs;
use super::{DumpArgs, FitArgs, PostgresArgs, ReportCommand, RootArgs, S3Args};
#[cfg(feature = "cli")]
use crate::file::storage::{Storage, error::StorageError};
use crate::integrity::SecretString;
#[cfg(feature = "cli")]
use crate::progress::Progress;

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

        #[command(flatten)]
        s3: S3Args,

        // The fit flags dwarf the other variants. The box keeps the enum small.
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
        /// The dump supplies the snapshot and every embedding. The run reaches neither the store
        /// nor the embedding provider, and the store flags and the provider key are read by
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

    /// Runs one analysis over a published generation.
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
///
/// # Panics
///
/// Panics if both the offline directory and provider key are absent.
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
/// The restored terminal reports the step that failed.
#[cfg(feature = "cli")]
#[derive(Debug)]
enum DashboardError {
    /// Preparing, drawing, or restoring the terminal failed.
    Terminal(std::io::Error),
    /// Dialing the store connection failed.
    Connect(super::ConnectError),
    /// The fit failed.
    Fit(super::FitError),
    /// The storage failed.
    Storage(StorageError),
}

#[cfg(feature = "cli")]
impl core::fmt::Display for DashboardError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Terminal(_) => fmt.write_str("the live dashboard could not use the terminal"),
            Self::Connect(_) => fmt.write_str("the store connection could not be dialed"),
            // The fit's own chain is the diagnosis. This variant adds no
            // step of its own.
            Self::Fit(error) => core::fmt::Display::fmt(error, fmt),
            Self::Storage(_) => fmt.write_str("the storage could not be accessed"),
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
            Self::Storage(error) => Some(error),
        }
    }
}

#[cfg(feature = "cli")]
impl From<StorageError> for DashboardError {
    fn from(value: StorageError) -> Self {
        Self::Storage(value)
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

/// Runs a prepared fit against the selected data source.
///
/// # Errors
///
/// Returns the connection or fit failure.
#[cfg(feature = "cli")]
async fn run_fit(
    command: super::FitCommand<impl Progress<Detached: UnwindSafe> + Sync>,
    source: FitSource,
) -> Result<super::FitVerdict, DashboardError> {
    match source {
        FitSource::Live { store, credential } => {
            let mut client = store.connect().await.map_err(DashboardError::Connect)?;
            Box::pin(command.run(&mut client, credential))
                .await
                .map_err(DashboardError::Fit)
        }
        FitSource::Offline(dump) => Box::pin(command.run_offline(&dump))
            .await
            .map_err(DashboardError::Fit),
    }
}

/// Runs one fit on the live dashboard, restoring the terminal before rendering anything.
///
/// This installs the subscriber globally rather than around the run, because the pipeline reports
/// from the tokio and rayon halves both and a thread-local dispatcher would collect neither.
///
/// # Errors
///
/// Returns [`DashboardError`] on failure. A run failure takes precedence over a
/// terminal-restoration failure.
///
/// # Panics
///
/// Panics if a global tracing subscriber is already installed.
#[cfg(feature = "cli")]
async fn fit_on_dashboard(
    root: RootArgs,
    source: FitSource,
    args: FitArgs,
    storage: Storage,
) -> Result<super::FitVerdict, DashboardError> {
    let dashboard = super::tui::Dashboard::start().map_err(DashboardError::Terminal)?;

    // The dashboard owns the terminal from here. The records the run emits belong in its pane, not
    // on the screen it is drawing.
    tracing_subscriber::fmt()
        .with_env_filter(log_filter())
        .with_writer(dashboard.log_sink())
        .with_ansi(false)
        .without_time()
        .init();

    let observer = dashboard.observer();
    let outcome = async {
        let command = super::FitCommand::new(root, args, storage)
            .await?
            .with_progress(observer);

        run_fit(command, source).await
    }
    .await;

    // The terminal comes back before the process renders either result.
    let restored = dashboard.finish();
    let verdict = outcome?;
    restored.map_err(DashboardError::Terminal)?;

    Ok(verdict)
}

/// Runs a fit without a dashboard and renders its verdict or failure chain.
#[cfg(feature = "cli")]
async fn fit_logged(
    root: RootArgs,
    source: FitSource,
    args: FitArgs,
    storage: Storage,
) -> std::process::ExitCode {
    let command = match super::FitCommand::new(root, args, storage).await {
        Ok(command) => command,
        Err(error) => return render_failure(error),
    };

    let result = match source {
        FitSource::Live { store, credential } => {
            let mut client = match store.connect().await {
                Ok(client) => client,
                Err(error) => return render_failure(error),
            };
            Box::pin(command.run(&mut client, credential)).await
        }
        FitSource::Offline(dump) => Box::pin(command.run_offline(&dump)).await,
    };

    match result {
        Ok(verdict) => {
            render_verdict(verdict);
            std::process::ExitCode::SUCCESS
        }
        Err(error) => render_failure(error),
    }
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
/// installed. After parsing, [`verify_cpu_baseline`](crate::math::kernel::verify_cpu_baseline)
/// rejects a CPU below the compiled baseline, on the conditions it documents.
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
            s3,
        } => {
            let mut storage = Storage::in_temp_dir();
            match s3.client().await {
                Ok(Some(client)) => {
                    storage.set_s3(client);
                }
                Ok(None) => {}
                Err(err) => {
                    return render_failure(err);
                }
            }

            match fit_on_dashboard(
                root,
                fit_source(store, openai_api_key, offline),
                *args,
                storage,
            )
            .await
            {
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
            s3,
            args,
            openai_api_key,
            offline,
            tui: false,
        } => {
            let mut storage = Storage::in_temp_dir();
            match s3.client().await {
                Ok(Some(client)) => {
                    storage.set_s3(client);
                }
                Ok(None) => {}
                Err(err) => {
                    return render_failure(err);
                }
            }

            fit_logged(
                root,
                fit_source(store, openai_api_key, offline),
                *args,
                storage,
            )
            .await
        }

        Command::Report { command } => match command.run().await {
            // The probe dumps its records as it solves and hands back no
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
    use core::assert_matches;

    use camino::Utf8PathBuf;
    use clap::Parser as _;

    use super::{Cli, Command};

    /// Returns a temporary path keyed by the process and test name.
    ///
    /// # Panics
    ///
    /// Panics if the temporary directory path is not UTF-8.
    fn scratch_root(name: &str) -> Utf8PathBuf {
        Utf8PathBuf::from_path_buf(std::env::temp_dir())
            .expect("the temp directory is UTF-8")
            .join(format!("atlas-shell-{}-{name}", std::process::id()))
    }

    /// The shell's command tree satisfies clap's own structural requirements.
    #[test]
    fn cli_consistency() {
        <Cli as clap::CommandFactory>::command().debug_assert();
    }

    /// A fit reading an offline dump parses, so long as it names no live-store flag.
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
        std::fs::remove_dir_all(&root).expect("should remove the parsed generation root");

        assert_matches!(
            cli.command,
            Command::Fit {
                offline: Some(_),
                ..
            }
        );
    }
}
