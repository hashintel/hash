use std::{
    fmt::{Display, Formatter},
    io,
    io::{IsTerminal, Stderr},
    path::{Path, PathBuf},
};

#[cfg(feature = "clap")]
use clap::Parser;
use error_stack::{fmt::ColorMode, Report};
use tracing::{Event, Level, Subscriber};
use tracing_appender::non_blocking::NonBlocking;
use tracing_subscriber::{
    filter::Directive,
    fmt::{
        self,
        format::{DefaultFields, Format, Json, JsonFields, Writer},
        time::{FormatTime, SystemTime},
        FmtContext, FormatEvent, FormatFields,
    },
    registry::LookupSpan,
};

/// Output format emitted to the terminal
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(clap::ValueEnum))]
pub enum LogFormat {
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

impl Display for LogFormat {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Full => f.write_str("full"),
            Self::Pretty => f.write_str("pretty"),
            Self::Json => f.write_str("json"),
            Self::Compact => f.write_str("compact"),
        }
    }
}

impl Default for LogFormat {
    fn default() -> Self {
        Self::Pretty
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(clap::ValueEnum))]
pub enum LogLevel {
    Trace,
    Debug,
    Info,
    Warning,
    Error,
}

impl Display for LogLevel {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Trace => fmt.write_str("trace"),
            Self::Debug => fmt.write_str("debug"),
            Self::Info => fmt.write_str("info"),
            Self::Warning => fmt.write_str("warning"),
            Self::Error => fmt.write_str("error"),
        }
    }
}

impl From<LogLevel> for Directive {
    fn from(level: LogLevel) -> Self {
        match level {
            LogLevel::Trace => Self::from(Level::TRACE),
            LogLevel::Debug => Self::from(Level::DEBUG),
            LogLevel::Info => Self::from(Level::INFO),
            LogLevel::Warning => Self::from(Level::WARN),
            LogLevel::Error => Self::from(Level::ERROR),
        }
    }
}

/// Arguments for configuring the logging setup
#[derive(Debug, Clone)]
#[cfg_attr(feature = "clap", derive(Parser))]
#[expect(
    clippy::struct_field_names,
    reason = "The fields are used as CLI arguments"
)]
pub struct LoggingConfig {
    /// Log format used for output to stderr.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            default_value = "compact",
            value_enum,
            env = "HASH_GRAPH_LOG_FORMAT",
            global = true,
        )
    )]
    pub log_format: LogFormat,

    /// Logging verbosity to use. If not set `HASH_GRAPH_LOG_LEVEL` will be used.
    #[cfg_attr(feature = "clap", clap(long, value_enum, global = true))]
    pub log_level: Option<LogLevel>,

    /// Logging output folder. The folder is created if it doesn't exist.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            default_value = "./logs",
            env = "HASH_GRAPH_LOG_FOLDER",
            global = true
        )
    )]
    pub log_folder: PathBuf,

    /// Logging output file prefix.
    #[cfg_attr(
        feature = "clap",
        clap(short, long, default_value = "out", global = true)
    )]
    pub log_file_prefix: String,
}

pub enum OutputFormatter<T> {
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

type FileOutputLayer<S> = fmt::Layer<S, JsonFields, Format<Json>, NonBlocking>;

pub type TracingDropGuard = impl Drop;

pub fn file_logger<S>(
    folder: impl AsRef<Path>,
    file_prefix: &str,
) -> (FileOutputLayer<S>, TracingDropGuard)
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    let (writer, guard) = tracing_appender::non_blocking(tracing_appender::rolling::never(
        folder,
        format!("{file_prefix}.jsonl"),
    ));

    let json_file_layer = fmt::layer()
        .event_format(fmt::format().with_target(true).json())
        .fmt_fields(JsonFields::new())
        .with_writer(writer);

    (json_file_layer, guard)
}

type JsonOutputLayer<S> =
    Option<fmt::Layer<S, JsonFields, OutputFormatter<SystemTime>, fn() -> Stderr>>;
type OutputLayer<S> =
    Option<fmt::Layer<S, DefaultFields, OutputFormatter<SystemTime>, fn() -> Stderr>>;

pub fn console_logger<S1, S2>(log_format: LogFormat) -> (OutputLayer<S1>, JsonOutputLayer<S2>)
where
    S1: Subscriber + for<'a> LookupSpan<'a>,
    S2: Subscriber + for<'a> LookupSpan<'a>,
{
    let formatter = fmt::format();

    let output_format = match log_format {
        LogFormat::Full => OutputFormatter::Full(formatter),
        LogFormat::Pretty => OutputFormatter::Pretty(formatter.pretty()),
        LogFormat::Json => OutputFormatter::Json(formatter.json()),
        LogFormat::Compact => OutputFormatter::Compact(formatter.compact()),
    };

    let ansi_output = io::stderr().is_terminal() && log_format != LogFormat::Json;
    if !ansi_output {
        Report::set_color_mode(ColorMode::None);
    }

    // Because of how the Registry and Layer interface is designed, we can't just have one
    // layer, as they have different types. We also can't box them as it requires Sized.
    // However, Option<Layer> implements the Layer trait so we can just provide None for
    // one and Some for the other.
    // Alternatively we could also create an enum that implements Layer and use that instead, but
    // that would require a lot of boilerplate.
    match log_format {
        LogFormat::Json => (
            None,
            Some(
                fmt::layer()
                    .event_format(output_format)
                    .fmt_fields(JsonFields::new())
                    .with_ansi(ansi_output)
                    .with_writer(io::stderr),
            ),
        ),
        _ => (
            Some(
                fmt::layer()
                    .event_format(output_format)
                    .with_ansi(ansi_output)
                    .with_writer(io::stderr),
            ),
            None,
        ),
    }
}
