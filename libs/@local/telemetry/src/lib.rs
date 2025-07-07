//! # HASH Tracing
//!
//! Tracing and logging utilities for the HASH platform.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
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

use error_stack::{Report, ResultExt as _};
use opentelemetry_sdk::{
    logs::SdkLoggerProvider, metrics::SdkMeterProvider, trace::SdkTracerProvider,
};
use tracing::warn;
use tracing_error::ErrorLayer;
use tracing_subscriber::{layer::SubscriberExt as _, util::SubscriberInitExt as _};

pub use self::otlp::OtlpConfig;
use self::{logging::LoggingConfig, traces::sentry::SentryConfig};

/// Arguments for configuring the logging setup
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

pub struct TracingGuard<F> {
    _file_guard: F,
    otlp_traces_provider: Option<SdkTracerProvider>,
    otlp_logs_provider: Option<SdkLoggerProvider>,
    otlp_metrics_provider: Option<SdkMeterProvider>,
}

impl<F> Drop for TracingGuard<F> {
    fn drop(&mut self) {
        if let Some(provider) = self.otlp_metrics_provider.take()
            && let Err(error) = provider.shutdown()
        {
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
) -> Result<TracingGuard<impl Drop>, Report<InitTracingError>> {
    let error_layer = ErrorLayer::default();

    let console_layer = self::logging::console_layer(&config.logging.console);
    let (file_layer, file_guard) = self::logging::file_layer(config.logging.file);

    let sentry_layer = self::traces::sentry::layer(&config.sentry);

    let otlp_logs_provider =
        self::logging::otlp::provider(&config.otlp).change_context(InitTracingError)?;
    let otel_logs_layer = otlp_logs_provider.as_ref().map(self::logging::otlp::layer);

    let otlp_traces_provider =
        self::traces::otlp::provider(&config.otlp).change_context(InitTracingError)?;
    let otel_traces_layer = otlp_traces_provider.as_ref().map(self::traces::otlp::layer);

    let otlp_metrics_provider =
        self::metrics::otlp::provider(&config.otlp).change_context(InitTracingError)?;
    if let Some(provider) = &otlp_metrics_provider {
        ::opentelemetry::global::set_meter_provider(provider.clone());
    }

    tracing_subscriber::registry()
        .with(sentry_layer)
        .with(otel_logs_layer)
        .with(otel_traces_layer)
        .with(console_layer)
        .with(file_layer)
        .with(error_layer)
        .try_init()
        .change_context(InitTracingError)?;

    // We have to wait until logging is initialized before we can print the warning.
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

    Ok(TracingGuard {
        _file_guard: file_guard,
        otlp_traces_provider,
        otlp_logs_provider,
        otlp_metrics_provider,
    })
}
