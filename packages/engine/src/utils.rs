use std::{env::VarError, fmt::Display, time::Duration};

use tracing::{Event, Subscriber};
use tracing_flame::FlameLayer;
use tracing_subscriber::{
    filter::{Directive, LevelFilter},
    fmt::{
        self,
        format::{Format, Writer},
        time::FormatTime,
        FmtContext, FormatEvent, FormatFields,
    },
    prelude::*,
    registry::LookupSpan,
    EnvFilter,
};

/// Output format emitted to the terminal
#[derive(Debug, Copy, Clone, PartialEq, Eq, clap::ArgEnum)]
pub enum OutputFormat {
    /// Human-readable, single-line logs for each event that occurs, with the current span context
    /// displayed before the formatted representation of the event.
    Full,
    /// excessively pretty, multi-line logs, optimized for human readability.
    Pretty,
    // TODO: Add JSON output. Currently it's failing when adding spans, we probably need to add
    //   it ourself
    // /// Newline-delimited JSON logs.
    // Json,
    /// Only includes the fields from the most recently entered span.
    Compact,
}

impl Display for OutputFormat {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            OutputFormat::Full => f.write_str("full"),
            OutputFormat::Pretty => f.write_str("pretty"),
            // OutputFormat::Json => f.write_str("json"),
            OutputFormat::Compact => f.write_str("compact"),
        }
    }
}

enum OutputFormatter<T> {
    Full(Format<fmt::format::Full, T>),
    Pretty(Format<fmt::format::Pretty, T>),
    // Json(Format<fmt::format::Json, T>),
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
            // OutputFormatter::Json(fmt) => fmt.format_event(ctx, writer, event),
            OutputFormatter::Compact(fmt) => fmt.format_event(ctx, writer, event),
        }
    }
}

impl Default for OutputFormat {
    fn default() -> Self {
        Self::Pretty
    }
}

pub fn init_logger(output_format: OutputFormat, flame_output: &str) -> impl Drop {
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
    let formatter = match output_format {
        OutputFormat::Full => OutputFormatter::Full(formatter),
        OutputFormat::Pretty => OutputFormatter::Pretty(formatter.pretty()),
        // OutputFormat::Json => OutputFormatter::Json(formatter.json()),
        OutputFormat::Compact => OutputFormatter::Compact(formatter.compact()),
    };

    let stderr_layer = fmt::layer()
        .event_format(formatter)
        .with_writer(std::io::stderr);
    let error_layer = tracing_error::ErrorLayer::default();

    let (flame_layer, _guard) = FlameLayer::with_file(flame_output).unwrap();

    tracing_subscriber::registry()
        .with(filter.and_then(stderr_layer))
        .with(error_layer)
        .with(flame_layer)
        .init();

    _guard
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
