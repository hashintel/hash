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

/// Arguments for configuring the tracing setup.
#[derive(Debug, Clone)]
#[cfg_attr(feature = "clap", derive(clap::Args))]
pub struct TracingConfig {
    #[cfg_attr(feature = "clap", clap(flatten))]
    pub logging: LoggingConfig,

    #[cfg_attr(feature = "clap", clap(flatten))]
    pub otlp: OtlpConfig,

    #[cfg_attr(feature = "clap", clap(flatten))]
    pub sentry: SentryConfig,
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("Failed to initialize tracing")]
pub struct InitTracingError;

#[derive(Debug, Default)]
pub struct TelemetryRegistry {
    error_layer: bool,
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
        let error_layer = self.error_layer.then(ErrorLayer::default);
        let console_layer = self
            .console_logging
            .as_ref()
            .map(self::logging::console_layer);

        let (file_layer, file_guard) = self.file_logging.map(self::logging::file_layer).unzip();

        let sentry_layer = self.sentry.as_ref().map(self::traces::sentry::layer);

        let (otlp_logs_layer, otlp_logs_provider) = self
            .otlp
            .as_ref()
            .map(|(otlp, service_name)| {
                self::logging::otlp::provider(otlp, service_name)
                    .change_context(InitTracingError)
                    .map(|provider| (self::logging::otlp::layer(&provider), provider))
            })
            .transpose()?
            .unzip();

        let (otlp_traces_layer, otlp_traces_provider) = self
            .otlp
            .as_ref()
            .map(|(otlp, service_name)| {
                self::traces::otlp::provider(otlp, service_name)
                    .change_context(InitTracingError)
                    .map(|provider| (self::traces::otlp::layer(&provider), provider))
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
        warn_about_log_level_variables();
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
        warn_about_log_level_variables();
        guard.warn_where_metrics_are_discarded();

        Ok(guard)
    }
}

fn warn_about_log_level_variables() {
    if std::env::var("RUST_LOG").is_ok() {
        if std::env::var("HASH_GRAPH_LOG_LEVEL").is_ok() {
            warn!(
                "`HASH_GRAPH_LOG_LEVEL` and `RUST_LOG` are set, `HASH_GRAPH_LOG_LEVEL` has been \
                 used to determine the logging level."
            );
        } else {
            warn!("`RUST_LOG` is set, please use `HASH_GRAPH_LOG_LEVEL` instead");
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
/// # Errors
///
/// - [`InitTracingError`], if initializing the [`tracing_subscriber::Registry`] fails.
pub fn init_tracing(
    config: TracingConfig,
    service_name: &'static str,
) -> Result<Telemetry, Report<InitTracingError>> {
    TelemetryRegistry::default()
        .with_error_layer()
        .with_console_logging(config.logging.console)
        .with_file_logging(config.logging.file)
        .with_sentry(config.sentry)
        .with_otlp(config.otlp, service_name)
        .init_global()
}
