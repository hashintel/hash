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
///
/// Every `env` name in [`TracingConfig`] other than `HASH_OTLP_ENDPOINT` starts with it, followed
/// by `_`, because [`TracingConfig::with_namespace`] replaces exactly that part.
pub const DEFAULT_NAMESPACE: &str = "HASH_GRAPH";

/// Arguments for configuring the tracing setup.
#[derive(Debug, Clone)]
#[cfg_attr(feature = "clap", derive(clap::Args))]
pub struct TracingConfig {
    /// Namespace of the telemetry environment variables, which the binary sets in code.
    #[cfg_attr(
        feature = "clap",
        clap(
            id = "telemetry-namespace",
            long = "telemetry-namespace",
            hide = true,
            default_value = DEFAULT_NAMESPACE,
            value_parser = [DEFAULT_NAMESPACE]
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
    /// Makes the telemetry arguments in `command` read the variables of `namespace`, and parses
    /// `namespace` into [`TracingConfig::namespace`].
    #[must_use]
    pub fn with_namespace(command: Command, namespace: &str) -> Command {
        with_env_namespace(command, namespace).mut_arg("telemetry-namespace", |arg| {
            arg.default_value(namespace.to_owned())
                .value_parser([namespace.to_owned()])
        })
    }
}

/// Makes the telemetry arguments in `command` read `<namespace>_*` instead of the
/// [`DEFAULT_NAMESPACE`] variables.
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

    /// Sets the `EnvFilter` directives for outputs without their own level, the OTLP logs and
    /// traces included.
    ///
    /// See [`logging::env_filter`] for how they combine with the level of each output and with
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

        let (registry, telemetry_guard) = self.build()?;
        let default_guard = tracing::dispatcher::set_default(&registry.into());

        // We have to wait until logging is initialized before we can print the warnings.
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
        let (registry, guard) = self.build()?;

        registry.try_init().change_context(InitTracingError)?;
        opentelemetry::global::set_meter_provider(guard.metrics_provider.clone());

        // We have to wait until logging is initialized before we can print the warnings.
        guard.warn_where_metrics_are_discarded();

        Ok(guard)
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
/// Outputs without their own level, the OTLP logs and traces included, are filtered by the
/// `LOG_LEVEL` variable in [`TracingConfig::namespace`], e.g. `HASH_GRAPH_LOG_LEVEL`, falling back
/// to `RUST_LOG`.
///
/// # Errors
///
/// - [`InitTracingError`], if initializing the [`tracing_subscriber::Registry`] fails.
pub fn init_tracing(
    config: TracingConfig,
    service_name: &'static str,
) -> Result<Telemetry, Report<InitTracingError>> {
    let log_level = std::env::var(format!("{}_LOG_LEVEL", config.namespace)).ok();

    let telemetry = TelemetryRegistry::default()
        .with_error_layer()
        .with_log_level(log_level)
        .with_console_logging(config.logging.console)
        .with_file_logging(config.logging.file)
        .with_sentry(config.sentry)
        .with_otlp(config.otlp, service_name)
        .init_global()?;

    if std::env::var_os("RUST_LOG").is_some() {
        warn!(
            "`RUST_LOG` is set, please use `{}_LOG_LEVEL` instead, which takes precedence over it",
            config.namespace
        );
    }

    Ok(telemetry)
}

#[cfg(all(test, feature = "clap"))]
mod tests {
    use clap::{Arg, Args as _, Command, FromArgMatches as _, error::ErrorKind};

    use crate::{TracingConfig, with_env_namespace};

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
             namespace"
        );
    }

    #[test]
    fn with_env_namespace_telemetry_arguments() {
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
            "every telemetry variable except `HASH_OTLP_ENDPOINT` should move to the namespace"
        );
    }

    #[test]
    fn with_env_namespace_other_arguments() {
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
    fn with_env_namespace_subcommand() {
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
            "the global logging arguments a subcommand inherits should read the namespace's \
             variables"
        );
    }

    #[test]
    fn namespace_default() {
        let matches = telemetry_command()
            .try_get_matches_from(["bin"])
            .expect("should parse without arguments");
        let config = TracingConfig::from_arg_matches(&matches).expect("should build the config");

        assert_eq!(
            config.namespace, "HASH_GRAPH",
            "a binary without a namespace should use the default"
        );
    }

    #[test]
    fn with_namespace_parsed() {
        let matches = TracingConfig::with_namespace(telemetry_command(), "TEST")
            .try_get_matches_from(["bin"])
            .expect("should parse without arguments");
        let config = TracingConfig::from_arg_matches(&matches).expect("should build the config");

        assert_eq!(
            config.namespace, "TEST",
            "the parsed config should carry the namespace the command was built with"
        );
    }

    #[test]
    fn with_namespace_other_value() {
        let error = TracingConfig::with_namespace(telemetry_command(), "TEST")
            .try_get_matches_from(["bin", "--telemetry-namespace", "OTHER"])
            .expect_err("should reject a namespace other than the binary's");

        assert_eq!(
            error.kind(),
            ErrorKind::InvalidValue,
            "the namespace should not be changeable from the command line"
        );
    }
}
