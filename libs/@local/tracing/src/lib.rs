#![feature(type_alias_impl_trait)]
#![feature(can_vector)]
#![feature(write_all_vectored)]

extern crate alloc;

pub mod console;
pub(crate) mod formatter;
pub mod logging;
pub mod opentelemetry;
pub mod sentry;

use tokio::runtime::Handle;
use tracing::warn;
use tracing_error::ErrorLayer;
use tracing_subscriber::{
    layer::SubscriberExt as _,
    util::{SubscriberInitExt as _, TryInitError},
};

use crate::{logging::LoggingConfig, opentelemetry::OpenTelemetryConfig, sentry::SentryConfig};

/// Arguments for configuring the logging setup
#[derive(Debug, Clone)]
#[cfg_attr(feature = "clap", derive(clap::Args))]
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
pub fn init_tracing(config: TracingConfig, handle: &Handle) -> Result<impl Drop, TryInitError> {
    let error = ErrorLayer::default();

    let console = logging::console_layer(&config.logging.console);
    let (file, file_guard) = logging::file_layer(config.logging.file);

    let sentry = sentry::layer(&config.sentry);
    let opentelemetry = opentelemetry::layer(&config.otlp, handle);

    tracing_subscriber::registry()
        .with(sentry)
        .with(opentelemetry)
        .with(console)
        .with(file)
        .with(error)
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

    Ok(file_guard)
}
