use std::{io, path::Path};

use tracing::{Event, Subscriber};
use tracing_subscriber::{
    filter::{Directive, LevelFilter},
    fmt::{
        self,
        format::{Format, JsonFields, Writer},
        time::FormatTime,
        writer::BoxMakeWriter,
        FmtContext, FormatEvent, FormatFields,
    },
    layer::SubscriberExt,
    registry::LookupSpan,
    util::{SubscriberInitExt, TryInitError},
    EnvFilter,
};

use crate::logging::args::{LogFormat, LogLevel};

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
            Self::Full(fmt) => fmt.format_event(ctx, writer, event),
            Self::Pretty(fmt) => fmt.format_event(ctx, writer, event),
            Self::Json(fmt) => fmt.format_event(ctx, writer, event),
            Self::Compact(fmt) => fmt.format_event(ctx, writer, event),
        }
    }
}

/// Initialize the `tracing` logging setup.
///
/// # Errors
///
/// - [`TryInitError`], if initializing the [`tracing_subscriber::Registry`] fails.
pub fn init_logger<P: AsRef<Path>>(
    log_format: LogFormat,
    log_folder: P,
    log_level: Option<LogLevel>,
    log_file_name: &str,
) -> Result<impl Drop, TryInitError> {
    let log_folder = log_folder.as_ref();

    let filter = log_level.map_or_else(
        || {
            std::env::var("RUST_LOG").map_or_else(
                |_| {
                    if cfg!(debug_assertions) {
                        EnvFilter::default().add_directive(Directive::from(LevelFilter::DEBUG))
                    } else {
                        EnvFilter::default().add_directive(Directive::from(LevelFilter::WARN))
                    }
                },
                EnvFilter::new,
            )
        },
        |log_level| EnvFilter::default().add_directive(Directive::from(log_level)),
    );

    let formatter = fmt::format().with_target(true);
    let output_format = match log_format {
        LogFormat::Full => OutputFormatter::Full(formatter.clone()),
        LogFormat::Pretty => OutputFormatter::Pretty(formatter.clone().pretty()),
        LogFormat::Json => OutputFormatter::Json(formatter.clone().json()),
        LogFormat::Compact => OutputFormatter::Compact(formatter.clone().compact()),
    };

    let error_layer = tracing_error::ErrorLayer::default();

    let output_writer = BoxMakeWriter::new(io::stderr);

    // Because of how the Registry and Layer interface is designed, we can't just have one layer,
    // as they have different types. We also can't box them as it requires Sized. However,
    // Option<Layer> implements the Layer trait so we can just provide None for one and Some
    // for the other
    let (output_layer, json_output_layer) = match log_format {
        LogFormat::Json => (
            None,
            Some(
                fmt::layer()
                    .event_format(output_format)
                    .with_ansi(true)
                    .fmt_fields(JsonFields::new())
                    .with_writer(output_writer),
            ),
        ),
        _ => (
            Some(
                fmt::layer()
                    .event_format(output_format)
                    .with_ansi(true)
                    .with_writer(output_writer),
            ),
            None,
        ),
    };

    let json_file_appender =
        tracing_appender::rolling::never(log_folder, format!("{log_file_name}.jsonl"));
    let (non_blocking, json_file_guard) = tracing_appender::non_blocking(json_file_appender);

    let json_file_layer = fmt::layer()
        .event_format(formatter.json())
        .fmt_fields(JsonFields::new())
        .with_writer(non_blocking);

    tracing_subscriber::registry()
        .with(filter)
        .with(output_layer)
        .with(json_output_layer)
        .with(json_file_layer)
        .with(error_layer)
        .try_init()?;

    Ok(json_file_guard)
}
