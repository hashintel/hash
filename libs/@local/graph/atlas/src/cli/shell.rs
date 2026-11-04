//! The standalone binary's command line and entry point.

#[cfg(feature = "cli")]
use core::panic::UnwindSafe;
use core::pin::Pin;

use camino::Utf8PathBuf;
use clap::{Parser, Subcommand, ValueHint};
#[cfg(feature = "cli")]
use error_stack::{Report, ResultExt as _};
use hash_crypto::Secret;

#[cfg(feature = "cli")]
use super::EmbedderArgs;
use super::{DumpArgs, FitArgs, PostgresArgs, ReportCommand, RootArgs, S3Args};
#[cfg(feature = "cli")]
use crate::file::storage::Storage;
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
        openai_api_key: Option<Pin<Box<Secret<str>>>>,

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
    openai_api_key: Option<Pin<Box<Secret<str>>>>,
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

/// One shell-hosted fit's failure, by step.
#[cfg(feature = "cli")]
#[derive(Debug)]
enum ShellFitError {
    /// Setting up the temporary directory or the S3 backend failed.
    Storage,
    /// Preparing, drawing, or restoring the live dashboard's terminal failed.
    Terminal,
    /// Resolving the fit inputs failed.
    Prepare,
    /// Dialing the store connection failed.
    Connect,
    /// The fit failed.
    Fit,
}

#[cfg(feature = "cli")]
impl core::fmt::Display for ShellFitError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Storage => fmt.write_str("the fit storage could not be set up"),
            Self::Terminal => fmt.write_str("the live dashboard could not use the terminal"),
            Self::Prepare => fmt.write_str("the fit inputs could not be resolved"),
            Self::Connect => fmt.write_str("the store connection could not be dialed"),
            Self::Fit => fmt.write_str("the fit failed"),
        }
    }
}

#[cfg(feature = "cli")]
impl core::error::Error for ShellFitError {}

/// Renders a command's failure report to stderr and returns the failure exit code.
#[cfg(feature = "cli")]
#[expect(
    clippy::print_stderr,
    clippy::use_debug,
    reason = "the report's `Debug` rendering is the binary shell's product"
)]
fn render_report<C>(report: &Report<C>) -> std::process::ExitCode {
    eprintln!("error: {report:?}");

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

/// Builds fit storage with the optional S3 backend.
///
/// # Errors
///
/// Returns [`ShellFitError::Storage`] if the temporary directory cannot be created, or if the
/// enabled backend's region or credentials cannot be resolved.
#[cfg(feature = "cli")]
#[expect(clippy::significant_drop_in_scrutinee, reason = "false positive")]
async fn fit_storage(s3: S3Args) -> Result<Storage, Report<ShellFitError>> {
    let mut storage = Storage::in_temp_dir()
        .await
        .change_context(ShellFitError::Storage)?;

    if let Some(client) = s3.client().await.change_context(ShellFitError::Storage)? {
        storage.set_s3(client);
    }

    Ok(storage)
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
) -> Result<super::FitVerdict, Report<ShellFitError>> {
    let verdict = match source {
        FitSource::Live { store, credential } => {
            let mut client = store
                .connect()
                .await
                .change_context(ShellFitError::Connect)?;
            Box::pin(command.run(&mut client, credential))
                .await
                .change_context(ShellFitError::Fit)?
        }
        FitSource::Offline(dump) => Box::pin(command.run_offline(&dump))
            .await
            .change_context(ShellFitError::Fit)?,
    };

    Ok(verdict)
}

/// Runs one fit on the live dashboard, restoring the terminal before rendering anything.
///
/// This installs the subscriber globally rather than around the run, because the pipeline reports
/// from the tokio and rayon halves both and a thread-local dispatcher would collect neither.
///
/// # Errors
///
/// Returns [`ShellFitError`] on failure. A run failure takes precedence over a
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
) -> Result<super::FitVerdict, Report<ShellFitError>> {
    let dashboard = super::tui::Dashboard::start().change_context(ShellFitError::Terminal)?;

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
            .await
            .change_context(ShellFitError::Prepare)?
            .with_progress(observer);

        run_fit(command, source).await
    }
    .await;

    // The terminal comes back before the process renders either result.
    let restored = dashboard.finish();
    let verdict = outcome?;
    restored.change_context(ShellFitError::Terminal)?;

    Ok(verdict)
}

/// Runs one fit without a dashboard, its records logged to stderr.
///
/// # Errors
///
/// Returns [`ShellFitError`] on failure.
#[cfg(feature = "cli")]
async fn fit_logged(
    root: RootArgs,
    source: FitSource,
    args: FitArgs,
    storage: Storage,
) -> Result<super::FitVerdict, Report<ShellFitError>> {
    let command = super::FitCommand::new(root, args, storage)
        .await
        .change_context(ShellFitError::Prepare)?;

    run_fit(command, source).await
}

/// Runs the standalone atlas binary.
///
/// Parses the command line and installs the log renderer before dispatching the command. The
/// returned exit code is the command's verdict: success, or failure with the error report rendered
/// to stderr.
///
/// # Panics
///
/// This panics when the tokio runtime cannot start or a global log subscriber is already
/// installed. After parsing, [`verify_cpu_baseline`](crate::math::kernel::verify_cpu_baseline)
/// rejects a CPU below the compiled baseline, on the conditions it documents.
#[cfg(feature = "cli")]
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
            s3,
            args,
            openai_api_key,
            offline,
            tui,
        } => {
            let result = async {
                let storage = fit_storage(s3).await?;
                let source = fit_source(store, openai_api_key, offline);

                if tui {
                    fit_on_dashboard(root, source, *args, storage).await
                } else {
                    fit_logged(root, source, *args, storage).await
                }
            }
            .await;

            match result {
                Ok(verdict) => {
                    render_verdict(verdict);
                    std::process::ExitCode::SUCCESS
                }
                Err(report) => render_report(&report),
            }
        }

        Command::Report { command } => match command.run().await {
            // The probe dumps its records as it solves and hands back no
            // verdict to render.
            Ok(None) => std::process::ExitCode::SUCCESS,
            Ok(Some(verdict)) => {
                render_verdict(verdict);
                std::process::ExitCode::SUCCESS
            }
            Err(report) => render_report(&report),
        },

        Command::Dump { store, args } => {
            let mut client = match store.connect().await {
                Ok(client) => client,
                Err(report) => return render_report(&report),
            };

            match super::DumpCommand::new(args).run(&mut client).await {
                Ok(verdict) => {
                    render_verdict(verdict);
                    std::process::ExitCode::SUCCESS
                }
                Err(report) => render_report(&report),
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
