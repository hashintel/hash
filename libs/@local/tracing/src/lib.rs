#![feature(lint_reasons)]

pub mod logging;

pub mod opentelemetry;
pub mod sentry;

use tracing::{level_filters::LevelFilter, warn};
use tracing_subscriber::{
    filter::Directive,
    layer::SubscriberExt,
    util::{SubscriberInitExt, TryInitError},
    EnvFilter,
};

use crate::{logging::LoggingConfig, opentelemetry::OpenTelemetryConfig, sentry::SentryConfig};

/// Arguments for configuring the logging setup
#[derive(Debug, Clone)]
#[cfg_attr(feature = "clap", derive(clap::Parser))]
pub struct TracingConfig {
    #[cfg_attr(feature = "clap", clap(flatten))]
    pub logging: LoggingConfig,

    #[cfg_attr(feature = "clap", clap(flatten))]
    pub otlp: OpenTelemetryConfig,

    #[cfg_attr(feature = "clap", clap(flatten))]
    pub sentry: SentryConfig,
}

/// Initialize the `tracing` logging setup.
///
/// # Errors
///
/// - [`TryInitError`], if initializing the [`tracing_subscriber::Registry`] fails.
pub async fn init_tracing(config: TracingConfig) -> Result<impl Drop + 'static, TryInitError> {
    let LoggingConfig {
        log_format,
        log_folder,
        log_level,
        log_file_prefix,
    } = config.logging;

    let filter = log_level.map_or_else(
        || {
            // Both environment variables are supported but `HASH_GRAPH_LOG_LEVEL` takes precedence
            // over `RUST_LOG`. If `RUST_LOG` is set we emit a warning at the end of this function.
            std::env::var("HASH_GRAPH_LOG_LEVEL")
                .or_else(|_| std::env::var("RUST_LOG"))
                .map_or_else(
                    |_| {
                        if cfg!(debug_assertions) {
                            EnvFilter::default().add_directive(Directive::from(LevelFilter::DEBUG))
                        } else {
                            EnvFilter::default().add_directive(Directive::from(LevelFilter::INFO))
                        }
                    },
                    EnvFilter::new,
                )
        },
        |log_level| EnvFilter::default().add_directive(Directive::from(log_level)),
    );

    let error_layer = tracing_error::ErrorLayer::default();
    let (output_layer, json_output_layer) = logging::console_logger(log_format);
    let (json_file_layer, json_file_guard) = logging::file_logger(log_folder, &log_file_prefix);
    let opentelemetry_layer = if let Some(endpoint) = config.otlp.otlp_endpoint {
        Some(opentelemetry::layer(endpoint).await)
    } else {
        None
    };
    let sentry_layer = sentry::layer();

    tracing_subscriber::registry()
        .with(filter)
        .with(opentelemetry_layer)
        .with(sentry_layer)
        .with(output_layer)
        .with(json_output_layer)
        .with(json_file_layer)
        .with(error_layer)
        .try_init()?;

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

    Ok(json_file_guard)
}
