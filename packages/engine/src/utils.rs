use std::{env::VarError, fmt::Display, time::Duration};

use tracing::{Event, Subscriber};
use tracing_subscriber::{
    filter::{Directive, LevelFilter},
    fmt::{
        self,
        format::{Format, JsonFields, Writer},
        time::FormatTime,
        FmtContext, FormatEvent, FormatFields,
    },
    prelude::*,
    registry::LookupSpan,
    EnvFilter,
};
use tracing_texray::TeXRayLayer;

/// Output format emitted to the terminal
#[derive(Debug, Copy, Clone, PartialEq, Eq, clap::ArgEnum)]
pub enum OutputFormat {
    /// Human-readable, single-line logs for each event that occurs, with the current span context
    /// displayed before the formatted representation of the event.
    Full,
    /// excessively pretty, multi-line logs, optimized for human readability.
    Pretty,
    /// Newline-delimited JSON logs.
    Json,
    /// Only includes the fields from the most recently entered span.
    Compact,
}

impl Display for OutputFormat {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            OutputFormat::Full => f.write_str("full"),
            OutputFormat::Pretty => f.write_str("pretty"),
            OutputFormat::Json => f.write_str("json"),
            OutputFormat::Compact => f.write_str("compact"),
        }
    }
}

enum OutputFormatter<T> {
    Full(Format<fmt::format::Full, T>),
    Pretty(Format<fmt::format::Pretty, T>),
    Json(Format<fmt::format::Json, T>),
    Compact(Format<fmt::format::Compact, T>),
}

impl<S, N, T> FormatEvent<S, N> for OutputFormatter<T>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    N: for<'a> FormatFields<'a> + 'static,
    T: FormatTime,
{
    fn format_event(
        &self,
        ctx: &FmtContext<'_, S, N>,
        writer: Writer<'_>,
        event: &Event<'_>,
    ) -> std::fmt::Result {
        match self {
            OutputFormatter::Full(fmt) => fmt.format_event(ctx, writer, event),
            OutputFormatter::Pretty(fmt) => fmt.format_event(ctx, writer, event),
            OutputFormatter::Json(fmt) => fmt.format_event(ctx, writer, event),
            OutputFormatter::Compact(fmt) => fmt.format_event(ctx, writer, event),
        }
    }
}

impl Default for OutputFormat {
    fn default() -> Self {
        Self::Pretty
    }
}

pub fn init_logger(
    std_err_output_format: OutputFormat,
    log_file_output_name: &str,
    texray_output_name: &str,
) -> (impl Drop, impl Drop) {
    let filter = match std::env::var("RUST_LOG") {
        Ok(env) => EnvFilter::new(env),
        #[cfg(debug_assertions)]
        _ => EnvFilter::default().add_directive(Directive::from(LevelFilter::DEBUG)),
        #[cfg(not(debug_assertions))]
        _ => EnvFilter::default().add_directive(Directive::from(LevelFilter::WARN)),
    };

    let formatter = fmt::format()
        .with_timer(fmt::time::Uptime::default())
        .with_target(true);
    let output_formatter = match std_err_output_format {
        OutputFormat::Full => OutputFormatter::Full(formatter.clone()),
        OutputFormat::Pretty => OutputFormatter::Pretty(formatter.clone().pretty()),
        OutputFormat::Json => OutputFormatter::Json(formatter.clone().json()),
        OutputFormat::Compact => OutputFormatter::Compact(formatter.clone().compact()),
    };

    let error_layer = tracing_error::ErrorLayer::default();

    // Because of how the Registry and Layer interface is designed, we can't just have one layer,
    // as they have different types. We also can't box them as it requires Sized. However,
    // Option<Layer> implements the Layer trait so we can  just provide None for one and Some
    // for the other
    let (stderr_layer, json_stderr_layer) = match std_err_output_format {
        OutputFormat::Json => (
            None,
            Some(
                fmt::layer()
                    .event_format(output_formatter)
                    .fmt_fields(JsonFields::new())
                    .with_writer(std::io::stderr),
            ),
        ),
        _ => (
            Some(
                fmt::layer()
                    .event_format(output_formatter)
                    .with_writer(std::io::stderr),
            ),
            None,
        ),
    };

    let json_file_appender =
        tracing_appender::rolling::never("./log", format!("{log_file_output_name}.log"));
    let (non_blocking, _json_file_guard) = tracing_appender::non_blocking(json_file_appender);

    let json_file_layer = fmt::layer()
        .event_format(formatter.json())
        .fmt_fields(JsonFields::new())
        .with_writer(non_blocking);

    let texray_file_appender =
        tracing_appender::rolling::never("./log", format!("{texray_output_name}.txt"));
    let (non_blocking, _tex_ray_guard) = tracing_appender::non_blocking(texray_file_appender);

    // we clone update_settings to satisfy move rules as writer takes a `Fn` rather than `FnOnce`
    let texray_layer =
        TeXRayLayer::new().update_settings(|settings| settings.writer(non_blocking.clone()));

    tracing_subscriber::registry()
        .with(filter)
        .with(stderr_layer)
        .with(json_stderr_layer)
        .with(json_file_layer)
        .with(error_layer)
        .with(
            texray_layer
                // only print spans longer than a certain duration
                // .min_duration(Duration::from_millis(100)),
        )
        .init();

    (_json_file_guard, _tex_ray_guard)
}

pub fn parse_env_duration(name: &str, default: u64) -> Duration {
    Duration::from_secs(
        std::env::var(name)
            .and_then(|timeout| {
                timeout.parse().map_err(|e| {
                    tracing::error!("Could not parse `{}` as integral: {}", name, e);
                    VarError::NotPresent
                })
            })
            .unwrap_or_else(|_| {
                tracing::info!("Setting `{}={}`", name, default);
                default
            }),
    )
}
