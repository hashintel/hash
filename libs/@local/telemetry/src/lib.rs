//! # HASH Tracing
//!
//! Tracing and logging utilities for the HASH platform.
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![feature(
    // Language Features
    type_alias_impl_trait,

    // Library Features
    can_vector,
    write_all_vectored,
)]

extern crate alloc;

pub mod logging;
pub mod metrics;
pub mod traces;

mod otlp;

#[cfg(feature = "clap")]
use std::ffi::OsString;
use std::{
    fs::{self, File},
    io::BufWriter,
    path::PathBuf,
};

#[cfg(feature = "clap")]
use clap::{Args as _, Command, Id};
use error_stack::{Report, ResultExt as _};
use opentelemetry::metrics::{Meter, MeterProvider as _};
use opentelemetry_sdk::{
    logs::SdkLoggerProvider, metrics::SdkMeterProvider, trace::SdkTracerProvider,
};
use tracing::{Dispatch, subscriber::DefaultGuard, warn};
use tracing_appender::non_blocking::WorkerGuard;
use tracing_error::ErrorLayer;
use tracing_flame::{FlameLayer, FlushGuard};
use tracing_subscriber::{layer::SubscriberExt as _, util::SubscriberInitExt as _};

pub use self::otlp::OtlpConfig;
use self::{
    logging::{ConsoleConfig, FileConfig, LoggingConfig},
    traces::sentry::SentryConfig,
};

/// Namespace of the environment variables the telemetry configuration reads by default.
pub const DEFAULT_NAMESPACE: &str = "HASH_GRAPH";

/// Arguments for configuring the tracing setup.
#[derive(Debug, Clone)]
#[cfg_attr(feature = "clap", derive(clap::Args))]
pub struct TracingConfig {
    /// Namespace of the telemetry environment variables, e.g. `HASH_GRAPH` reads
    /// `HASH_GRAPH_LOG_LEVEL`.
    #[cfg_attr(
        feature = "clap",
        clap(
            id = "telemetry-namespace",
            long = "telemetry-namespace",
            value_name = "NAMESPACE",
            default_value = DEFAULT_NAMESPACE,
            global = true
        )
    )]
    pub namespace: String,

    #[cfg_attr(feature = "clap", clap(flatten))]
    pub logging: LoggingConfig,

    #[cfg_attr(feature = "clap", clap(flatten))]
    pub otlp: OtlpConfig,

    #[cfg_attr(feature = "clap", clap(flatten))]
    pub sentry: SentryConfig,
}

#[cfg(feature = "clap")]
impl TracingConfig {
    /// Makes the telemetry arguments in `command` read the namespace that `args` pass with
    /// `--telemetry-namespace`.
    ///
    /// The namespace decides which environment variables clap reads, so it is taken from the raw
    /// arguments before `command` parses them. Without the flag the arguments read the variables
    /// of [`DEFAULT_NAMESPACE`].
    #[must_use]
    pub fn with_namespace_flag(
        command: Command,
        args: impl IntoIterator<Item = impl Into<OsString>>,
    ) -> Command {
        match namespace_argument(args) {
            Some(namespace) => with_env_namespace(command, &namespace),
            None => command,
        }
    }
}

/// The value of the last `--telemetry-namespace` in `args`, ignoring everything after `--`.
#[cfg(feature = "clap")]
fn namespace_argument(args: impl IntoIterator<Item = impl Into<OsString>>) -> Option<String> {
    let mut args = args.into_iter().map(Into::into);
    let mut namespace = None;

    while let Some(arg) = args.next() {
        let Some(arg) = arg.to_str() else {
            continue;
        };

        match arg {
            "--" => break,
            "--telemetry-namespace" => {
                namespace = args.next().and_then(|value| value.into_string().ok());
            }
            _ => {
                if let Some(value) = arg.strip_prefix("--telemetry-namespace=") {
                    namespace = Some(value.to_owned());
                }
            }
        }
    }

    namespace
}

/// Makes the telemetry arguments in `command` read `<namespace>_*` instead of `HASH_GRAPH_*`.
///
/// Arguments that are not part of [`TracingConfig`] keep their environment variables, and so
/// does `HASH_OTLP_ENDPOINT`.
#[cfg(feature = "clap")]
fn with_env_namespace(command: Command, namespace: &str) -> Command {
    let ids: Vec<Id> = TracingConfig::augment_args(Command::new("telemetry"))
        .get_arguments()
        .map(|arg| arg.get_id().clone())
        .collect();

    command.mut_args(|arg| {
        let env = ids
            .contains(arg.get_id())
            .then(|| {
                arg.get_env()?
                    .to_str()?
                    .strip_prefix(DEFAULT_NAMESPACE)?
                    .strip_prefix('_')
            })
            .flatten()
            .map(|name| format!("{namespace}_{name}"));

        match env {
            Some(env) => arg.env(env),
            None => arg,
        }
    })
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("Failed to initialize tracing")]
pub struct InitTracingError;

#[derive(Debug, Default)]
pub struct TelemetryRegistry {
    error_layer: bool,
    namespace: Option<String>,
    log_level: Option<String>,
    console_logging: Option<ConsoleConfig>,
    file_logging: Option<FileConfig>,
    sentry: Option<SentryConfig>,
    otlp: Option<(OtlpConfig, &'static str)>,
    flamegraph_path: Option<PathBuf>,
}

impl TelemetryRegistry {
    #[must_use]
    pub const fn with_error_layer(mut self) -> Self {
        self.error_layer = true;
        self
    }

    /// Sets the namespace of the environment variables the configuration was read from.
    ///
    /// Warnings name the variables of this namespace, [`DEFAULT_NAMESPACE`] if unset.
    #[must_use]
    pub fn with_namespace(mut self, namespace: impl Into<String>) -> Self {
        self.namespace = Some(namespace.into());
        self
    }

    /// Sets the logging filter for outputs without their own level.
    ///
    /// See [`logging::env_filter`] for how it combines with the level of each output and with
    /// `RUST_LOG`.
    #[must_use]
    pub fn with_log_level(mut self, directives: Option<String>) -> Self {
        self.log_level = directives;
        self
    }

    #[must_use]
    pub const fn with_console_logging(mut self, config: ConsoleConfig) -> Self {
        if config.enabled {
            self.console_logging = Some(config);
        }
        self
    }

    #[must_use]
    pub fn with_file_logging(mut self, config: FileConfig) -> Self {
        if config.enabled {
            self.file_logging = Some(config);
        }
        self
    }

    #[must_use]
    pub fn with_sentry(mut self, config: SentryConfig) -> Self {
        self.sentry = Some(config);
        self
    }

    #[must_use]
    pub fn with_otlp(mut self, config: OtlpConfig, service_name: &'static str) -> Self {
        if let Some(endpoint) = config.endpoint.as_ref()
            && !endpoint.is_empty()
        {
            self.otlp = Some((config, service_name));
        }

        self
    }

    #[must_use]
    pub fn with_flamegraph(mut self, target_dir: impl Into<PathBuf>) -> Self {
        self.flamegraph_path = Some(target_dir.into());
        self
    }

    fn build(self) -> Result<(impl Into<Dispatch>, Telemetry), Report<InitTracingError>> {
        let directives = self.log_level.as_deref();

        let error_layer = self.error_layer.then(ErrorLayer::default);
        let console_layer = self
            .console_logging
            .as_ref()
            .map(|config| self::logging::console_layer(config, directives));

        let (file_layer, file_guard) = self
            .file_logging
            .map(|config| self::logging::file_layer(config, directives))
            .unzip();

        let sentry_layer = self.sentry.as_ref().map(self::traces::sentry::layer);

        let (otlp_logs_layer, otlp_logs_provider) = self
            .otlp
            .as_ref()
            .map(|(otlp, service_name)| {
                self::logging::otlp::provider(otlp, service_name)
                    .change_context(InitTracingError)
                    .map(|provider| (self::logging::otlp::layer(&provider, directives), provider))
            })
            .transpose()?
            .unzip();

        let (otlp_traces_layer, otlp_traces_provider) = self
            .otlp
            .as_ref()
            .map(|(otlp, service_name)| {
                self::traces::otlp::provider(otlp, service_name)
                    .change_context(InitTracingError)
                    .map(|provider| (self::traces::otlp::layer(&provider, directives), provider))
            })
            .transpose()?
            .unzip();

        let otlp_metrics_provider = self
            .otlp
            .as_ref()
            .map(|(otlp, service_name)| {
                self::metrics::otlp::provider(otlp, service_name).change_context(InitTracingError)
            })
            .transpose()?;

        let (flame_layer, flamegraph_guard) = self
            .flamegraph_path
            .map(|path| {
                fs::create_dir_all(&path).change_context(InitTracingError)?;
                FlameLayer::with_file(path.join("tracing.folded")).change_context(InitTracingError)
            })
            .transpose()?
            .unzip();

        let guard = Telemetry {
            otlp_traces_provider,
            otlp_logs_provider,
            metrics_exported: otlp_metrics_provider.is_some(),
            // Without an OTLP endpoint the provider has no reader, so its instruments discard
            // every measurement.
            metrics_provider: otlp_metrics_provider
                .unwrap_or_else(|| SdkMeterProvider::builder().build()),
            _file_guard: file_guard,
            _flamegraph: flamegraph_guard,
        };

        Ok((
            tracing_subscriber::registry()
                .with(error_layer)
                .with(sentry_layer)
                .with(otlp_logs_layer)
                .with(otlp_traces_layer)
                .with(console_layer)
                .with(file_layer)
                .with(flame_layer),
            guard,
        ))
    }

    /// Initialize the telemetry setup in the current scope.
    ///
    /// Never registers the meter provider globally: it would replace a global registration and
    /// shut the provider down when the returned guard drops.
    ///
    /// # Errors
    ///
    /// - [`InitTracingError`], if initializing the [`tracing_subscriber::Registry`] fails.
    pub fn init(self) -> Result<impl Drop, Report<InitTracingError>> {
        #[expect(unused)]
        struct DropGuard<T>(T, DefaultGuard);

        #[expect(clippy::empty_drop)]
        impl<T> Drop for DropGuard<T> {
            fn drop(&mut self) {}
        }

        let namespace = self.namespace.clone();
        let log_level_set = self.log_level.is_some();
        let (registry, telemetry_guard) = self.build()?;
        let default_guard = tracing::dispatcher::set_default(&registry.into());

        // We have to wait until logging is initialized before we can print the warnings.
        warn_about_log_level_variables(namespace.as_deref(), log_level_set);
        telemetry_guard.warn_where_metrics_are_discarded();

        Ok(DropGuard(telemetry_guard, default_guard))
    }

    /// Initialize the telemetry setup.
    ///
    /// Registers the meter provider globally, so `opentelemetry::global::meter` hands out
    /// exporting instruments.
    ///
    /// # Errors
    ///
    /// - [`InitTracingError`], if initializing the [`tracing_subscriber::Registry`] fails.
    pub fn init_global(self) -> Result<Telemetry, Report<InitTracingError>> {
        let namespace = self.namespace.clone();
        let log_level_set = self.log_level.is_some();
        let (registry, guard) = self.build()?;

        registry.try_init().change_context(InitTracingError)?;
        opentelemetry::global::set_meter_provider(guard.metrics_provider.clone());

        // We have to wait until logging is initialized before we can print the warnings.
        warn_about_log_level_variables(namespace.as_deref(), log_level_set);
        guard.warn_where_metrics_are_discarded();

        Ok(guard)
    }
}

fn warn_about_log_level_variables(namespace: Option<&str>, log_level_set: bool) {
    let namespace = namespace.unwrap_or(DEFAULT_NAMESPACE);

    if std::env::var("RUST_LOG").is_ok() {
        if log_level_set {
            warn!(
                "`{namespace}_LOG_LEVEL` and `RUST_LOG` are set, `{namespace}_LOG_LEVEL` has been \
                 used to determine the logging level."
            );
        } else {
            warn!("`RUST_LOG` is set, please use `{namespace}_LOG_LEVEL` instead");
        }
    }
}

/// The initialized telemetry pipelines, shutting them down on drop.
#[must_use = "dropping the guard shuts the telemetry pipelines down"]
pub struct Telemetry {
    otlp_traces_provider: Option<SdkTracerProvider>,
    otlp_logs_provider: Option<SdkLoggerProvider>,
    metrics_provider: SdkMeterProvider,
    metrics_exported: bool,
    _file_guard: Option<WorkerGuard>,
    _flamegraph: Option<FlushGuard<BufWriter<File>>>,
}

impl Telemetry {
    /// Returns a [`Meter`] on the held provider.
    ///
    /// Instruments built from it export measurements regardless of whether the provider is
    /// registered globally, so binding them cannot race the registration.
    #[must_use]
    pub fn meter(&self, scope: &'static str) -> Meter {
        self.metrics_provider.meter(scope)
    }

    fn warn_where_metrics_are_discarded(&self) {
        if !self.metrics_exported {
            warn!(
                "no OTLP endpoint is configured, so metric instruments record into a provider \
                 with no reader and every measurement is discarded"
            );
        }
    }
}

impl Drop for Telemetry {
    fn drop(&mut self) {
        if let Err(error) = self.metrics_provider.shutdown() {
            tracing::warn!("Failed to shutdown OpenTelemetry metrics: {error}");
        }

        if let Some(provider) = self.otlp_logs_provider.take()
            && let Err(error) = provider.shutdown()
        {
            tracing::warn!("Failed to shutdown OpenTelemetry logs: {error}");
        }

        if let Some(provider) = self.otlp_traces_provider.take()
            && let Err(error) = provider.shutdown()
        {
            tracing::warn!("Failed to shutdown OpenTelemetry traces: {error}");
        }
    }
}

/// Initialize the `tracing` logging setup.
///
/// Outputs without their own level are filtered by `<namespace>_LOG_LEVEL`, falling back to
/// `RUST_LOG`.
///
/// # Errors
///
/// - [`InitTracingError`], if initializing the [`tracing_subscriber::Registry`] fails.
pub fn init_tracing(
    config: TracingConfig,
    service_name: &'static str,
) -> Result<Telemetry, Report<InitTracingError>> {
    let log_level = std::env::var(format!("{}_LOG_LEVEL", config.namespace)).ok();

    TelemetryRegistry::default()
        .with_error_layer()
        .with_namespace(config.namespace)
        .with_log_level(log_level)
        .with_console_logging(config.logging.console)
        .with_file_logging(config.logging.file)
        .with_sentry(config.sentry)
        .with_otlp(config.otlp, service_name)
        .init_global()
}

#[cfg(all(test, feature = "clap"))]
mod tests {
    use clap::{Arg, Args as _, Command};

    use crate::{TracingConfig, namespace_argument, with_env_namespace};

    fn telemetry_command() -> Command {
        TracingConfig::augment_args(Command::new("telemetry"))
    }

    /// The ID and environment variable of every argument in `command` that reads one.
    fn env_names(command: &Command) -> Vec<(&str, &str)> {
        command
            .get_arguments()
            .filter_map(|arg| Some((arg.get_id().as_str(), arg.get_env()?.to_str()?)))
            .collect()
    }

    #[test]
    fn env_names_default() {
        assert_eq!(
            env_names(&telemetry_command()),
            [
                ("logging-console-enabled", "HASH_GRAPH_LOG_CONSOLE_ENABLED"),
                ("logging-console-format", "HASH_GRAPH_LOG_CONSOLE_FORMAT"),
                ("logging-console-color", "HASH_GRAPH_LOG_CONSOLE_COLOR"),
                ("logging-console-level", "HASH_GRAPH_LOG_CONSOLE_LEVEL"),
                ("logging-file-enabled", "HASH_GRAPH_LOG_FILE_ENABLED"),
                ("logging-file-format", "HASH_GRAPH_LOG_FILE_FORMAT"),
                ("logging-file-level", "HASH_GRAPH_LOG_FILE_LEVEL"),
                ("logging-file-output", "HASH_GRAPH_LOG_FOLDER"),
                ("endpoint", "HASH_OTLP_ENDPOINT"),
                ("sentry-dsn", "HASH_GRAPH_SENTRY_DSN"),
                ("sentry-environment", "HASH_GRAPH_SENTRY_ENVIRONMENT"),
                (
                    "sentry-enable-span-attributes",
                    "HASH_GRAPH_SENTRY_ENABLE_SPAN_ATTRIBUTES"
                ),
                ("sentry-span-filter", "HASH_GRAPH_SENTRY_SPAN_FILTER"),
                ("sentry-event-filter", "HASH_GRAPH_SENTRY_EVENT_FILTER"),
            ],
            "telemetry arguments should read the `HASH_GRAPH_` variables unless a binary sets a \
             prefix"
        );
    }

    #[test]
    fn with_env_prefix_telemetry_arguments() {
        let command = with_env_namespace(telemetry_command(), "TEST");

        assert_eq!(
            env_names(&command),
            [
                ("logging-console-enabled", "TEST_LOG_CONSOLE_ENABLED"),
                ("logging-console-format", "TEST_LOG_CONSOLE_FORMAT"),
                ("logging-console-color", "TEST_LOG_CONSOLE_COLOR"),
                ("logging-console-level", "TEST_LOG_CONSOLE_LEVEL"),
                ("logging-file-enabled", "TEST_LOG_FILE_ENABLED"),
                ("logging-file-format", "TEST_LOG_FILE_FORMAT"),
                ("logging-file-level", "TEST_LOG_FILE_LEVEL"),
                ("logging-file-output", "TEST_LOG_FOLDER"),
                ("endpoint", "HASH_OTLP_ENDPOINT"),
                ("sentry-dsn", "TEST_SENTRY_DSN"),
                ("sentry-environment", "TEST_SENTRY_ENVIRONMENT"),
                (
                    "sentry-enable-span-attributes",
                    "TEST_SENTRY_ENABLE_SPAN_ATTRIBUTES"
                ),
                ("sentry-span-filter", "TEST_SENTRY_SPAN_FILTER"),
                ("sentry-event-filter", "TEST_SENTRY_EVENT_FILTER"),
            ],
            "every telemetry variable except `HASH_OTLP_ENDPOINT` should take the prefix"
        );
    }

    #[test]
    fn with_env_prefix_other_arguments() {
        let command = with_env_namespace(
            telemetry_command().arg(
                Arg::new("worker-threads")
                    .long("worker-threads")
                    .env("HASH_GRAPH_WORKER_THREADS"),
            ),
            "TEST",
        );

        let worker_threads = command
            .get_arguments()
            .find(|arg| arg.get_id() == "worker-threads")
            .and_then(Arg::get_env);
        assert_eq!(
            worker_threads.and_then(|env| env.to_str()),
            Some("HASH_GRAPH_WORKER_THREADS"),
            "an argument outside the telemetry configuration should keep its variable"
        );
    }

    #[test]
    fn with_env_prefix_subcommand() {
        let mut command = with_env_namespace(
            telemetry_command().subcommand(Command::new("server")),
            "TEST",
        );
        command.build();

        let server = command
            .find_subcommand("server")
            .expect("should have the `server` subcommand");
        assert_eq!(
            env_names(server),
            [
                ("logging-console-enabled", "TEST_LOG_CONSOLE_ENABLED"),
                ("logging-console-format", "TEST_LOG_CONSOLE_FORMAT"),
                ("logging-console-color", "TEST_LOG_CONSOLE_COLOR"),
                ("logging-console-level", "TEST_LOG_CONSOLE_LEVEL"),
                ("logging-file-enabled", "TEST_LOG_FILE_ENABLED"),
                ("logging-file-format", "TEST_LOG_FILE_FORMAT"),
                ("logging-file-level", "TEST_LOG_FILE_LEVEL"),
                ("logging-file-output", "TEST_LOG_FOLDER"),
            ],
            "the global logging arguments a subcommand inherits should read the prefixed variables"
        );
    }

    #[test]
    fn namespace_argument_separate_value() {
        assert_eq!(
            namespace_argument(["bin", "--telemetry-namespace", "TEST", "server"]),
            Some("TEST".to_owned()),
            "the value after the flag should be the namespace"
        );
    }

    #[test]
    fn namespace_argument_inline_value() {
        assert_eq!(
            namespace_argument(["bin", "server", "--telemetry-namespace=TEST"]),
            Some("TEST".to_owned()),
            "the value after `=` should be the namespace, also behind a subcommand"
        );
    }

    #[test]
    fn namespace_argument_absent() {
        assert_eq!(
            namespace_argument(["bin", "server", "--logging-console-level", "info"]),
            None,
            "arguments without the flag should leave the default namespace in place"
        );
    }

    #[test]
    fn namespace_argument_repeated() {
        assert_eq!(
            namespace_argument([
                "bin",
                "--telemetry-namespace",
                "FIRST",
                "--telemetry-namespace=SECOND",
            ]),
            Some("SECOND".to_owned()),
            "the last flag should win"
        );
    }

    #[test]
    fn namespace_argument_after_terminator() {
        assert_eq!(
            namespace_argument(["bin", "--", "--telemetry-namespace", "TEST"]),
            None,
            "a flag after `--` should be a positional value, not the namespace"
        );
    }

    #[test]
    fn with_namespace_flag_default() {
        let command = TracingConfig::with_namespace_flag(telemetry_command(), ["bin", "server"]);

        assert_eq!(
            env_names(&command),
            env_names(&telemetry_command()),
            "without the flag the telemetry arguments should keep their variables"
        );
    }

    #[test]
    fn with_namespace_flag_custom() {
        let command = TracingConfig::with_namespace_flag(
            telemetry_command(),
            ["bin", "--telemetry-namespace", "TEST"],
        );

        assert_eq!(
            env_names(&command),
            env_names(&with_env_namespace(telemetry_command(), "TEST")),
            "the flag should rename the telemetry variables into its namespace"
        );
    }
}
