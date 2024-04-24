use std::{
    io,
    io::IsTerminal,
    path::{Path, PathBuf},
};

use error_stack::{fmt::ColorMode, Report};
use tracing::{level_filters::LevelFilter, Level, Subscriber};
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{
    filter::Directive,
    fmt::{
        self,
        format::{DefaultFields, JsonFields},
        time::SystemTime,
        FormatFields, MakeWriter,
    },
    registry::LookupSpan,
    EnvFilter, Layer,
};

use crate::{console::ConsoleMakeWriter, formatter::TracingFormatter};

/// Output format emitted to the terminal
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
#[cfg_attr(feature = "clap", derive(clap::ValueEnum))]
pub enum LogFormat {
    /// Human-readable, single-line logs for each event that occurs, with the current span context
    /// displayed before the formatted representation of the event.
    Full,
    /// excessively pretty, multi-line logs, optimized for human readability.
    #[default]
    Pretty,
    /// Newline-delimited JSON logs.
    Json,
    /// Only includes the fields from the most recently entered span.
    Compact,
}

impl LogFormat {
    fn formatter(self) -> TracingFormatter<SystemTime> {
        let default = fmt::format();

        match self {
            Self::Full => TracingFormatter::Full(default),
            Self::Pretty => TracingFormatter::Pretty(default.pretty()),
            Self::Json => TracingFormatter::Json(default.json()),
            Self::Compact => TracingFormatter::Compact(default.compact()),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
#[cfg_attr(feature = "clap", derive(clap::ValueEnum))]
pub enum ConsoleStream {
    Stdout,
    #[default]
    Stderr,
}

impl ConsoleStream {
    const fn make_writer(self) -> ConsoleMakeWriter {
        match self {
            Self::Stdout => ConsoleMakeWriter::Stdout,
            Self::Stderr => ConsoleMakeWriter::Stderr,
        }
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

impl From<LogLevel> for Level {
    fn from(level: LogLevel) -> Self {
        match level {
            LogLevel::Trace => Self::TRACE,
            LogLevel::Debug => Self::DEBUG,
            LogLevel::Info => Self::INFO,
            LogLevel::Warning => Self::WARN,
            LogLevel::Error => Self::ERROR,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(Parser))]
pub struct ConsoleConfig {
    /// Whether to enable logging to stdout/stderr
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            default_value = true,
            env = "HASH_GRAPH_LOG_CONSOLE_ENABLED",
            global = true
        )
    )]
    pub enabled: bool,

    /// Log format used for output
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            default_value = "compact",
            value_enum,
            env = "HASH_GRAPH_LOG_CONSOLE_FORMAT",
            global = true,
        )
    )]
    pub format: LogFormat,

    /// Logging verbosity to use.
    #[cfg_attr(feature = "clap", clap(long, value_enum, global = true))]
    pub level: Option<LogLevel>,

    /// Stream to write to
    #[cfg_attr(feature = "clap", clap(long, value_enum, global = true))]
    pub stream: ConsoleStream,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
#[cfg_attr(feature = "clap", derive(clap::ValueEnum))]
pub enum RotationInterval {
    Minutely,
    Hourly,
    Daily,
    #[default]
    Never,
}

impl From<RotationInterval> for Rotation {
    fn from(value: RotationInterval) -> Self {
        match value {
            RotationInterval::Minutely => Self::MINUTELY,
            RotationInterval::Hourly => Self::HOURLY,
            RotationInterval::Daily => Self::DAILY,
            RotationInterval::Never => Self::NEVER,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
#[cfg_attr(feature = "clap", derive(Parser))]
pub struct FileRotation {
    #[cfg_attr(feature = "clap", clap(long, value_enum, global = true))]
    pub rotation: RotationInterval,

    #[cfg_attr(
        feature = "clap",
        clap(short, long, default_value = Some("out"), global = true)
    )]
    pub filename_prefix: Option<String>,
    #[cfg_attr(feature = "clap", clap(long, global = true))]
    pub filename_suffix: Option<String>,

    pub max_log_files: Option<usize>,
}

impl FileRotation {
    fn appender(self, output: impl AsRef<Path>) -> RollingFileAppender {
        let mut builder = tracing_appender::rolling::Builder::new().rotation(self.rotation.into());

        if let Some(prefix) = self.filename_prefix {
            builder = builder.filename_prefix(prefix);
        }

        if let Some(suffix) = self.filename_suffix {
            builder = builder.filename_suffix(suffix);
        }

        if let Some(max_log_files) = self.max_log_files {
            builder = builder.max_log_files(max_log_files);
        }

        builder
            .build(output)
            .expect("should be able to initialize rolling file appender")
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(Parser))]
pub struct FileConfig {
    /// Whether to enable logging to a file
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            default_value = false,
            env = "HASH_GRAPH_LOG_FILE_ENABLED",
            global = true
        )
    )]
    pub enabled: bool,

    /// Log format used for output
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
    pub format: LogFormat,

    /// Logging verbosity to use.
    #[cfg_attr(feature = "clap", clap(long, value_enum, global = true))]
    pub level: Option<LogLevel>,

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
    pub output: PathBuf,

    /// Configuration for log file rotation
    #[cfg_attr(feature = "clap", clap(flatten))]
    pub rotation: FileRotation,
}

/// Arguments for configuring the logging setup
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(Parser))]
pub struct LoggingConfig {
    /// Configuration for logging to the console
    #[cfg_attr(feature = "clap", clap(flatten))]
    pub console: ConsoleConfig,

    /// Configuration for logging to a file
    #[cfg_attr(feature = "clap", clap(flatten))]
    pub file: FileConfig,
}

fn env_filter(level: Option<Level>) -> EnvFilter {
    // TODO: do we maybe want to have another default level
    level.map_or_else(
        || {
            EnvFilter::builder()
                .with_default_directive(if cfg!(debug_assertions) {
                    LevelFilter::DEBUG.into()
                } else {
                    LevelFilter::INFO.into()
                })
                .from_env_lossy()
        },
        |level| EnvFilter::default().add_directive(Directive::from(level)),
    )
}

type ConcreteLayer<S, W, F>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    W: for<'writer> MakeWriter<'writer> + 'static,
    F: for<'write> FormatFields<'write> + 'static,
= impl Layer<S>;

fn layer<S, W, F>(
    format: LogFormat,
    level: Option<Level>,
    writer: W,
    fields: F,
) -> ConcreteLayer<S, W, F>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    W: for<'writer> MakeWriter<'writer> + 'static,
    F: for<'write> FormatFields<'write> + 'static,
{
    let formatter = format.formatter();

    fmt::layer()
        .event_format(formatter)
        .fmt_fields(fields)
        .with_writer(writer)
        .with_filter(env_filter(level))
}

fn delegate_to_correct_layer<S, W>(
    format: LogFormat,
    level: Option<Level>,
    writer: W,
) -> impl Layer<S>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    W: for<'writer> MakeWriter<'writer> + 'static,
{
    type Left<S, W>
    where
        S: Subscriber + for<'a> tracing_subscriber::registry::LookupSpan<'a>,
        W: for<'writer> MakeWriter<'writer> + 'static,
    = Option<impl Layer<S>>;
    type Right<S, W>
    where
        S: Subscriber + for<'a> tracing_subscriber::registry::LookupSpan<'a>,
        W: for<'writer> MakeWriter<'writer> + 'static,
    = Option<impl Layer<S>>;

    match format {
        LogFormat::Json => <Left<S, W> as Layer<S>>::and_then(
            None,
            Right::<S, W>::Some(layer(format, level, writer, JsonFields::new())),
        ),
        _ => <Left<S, W> as Layer<S>>::and_then(
            Some(layer(format, level, writer, DefaultFields::new())),
            Right::<S, W>::None,
        ),
    }
}

#[must_use]
pub fn file_layer<S>(config: FileConfig) -> (impl Layer<S>, impl Drop)
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    let appender = config.rotation.appender(config.output);
    let (writer, guard) = tracing_appender::non_blocking(appender);

    let layer = delegate_to_correct_layer(config.format, config.level, writer);

    (layer, guard)
}

pub type ConsoleLayer<S>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
= impl Layer<S>;

#[must_use]
pub fn console_layer<S>(config: &ConsoleConfig) -> ConsoleLayer<S>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    let ansi_output = io::stderr().is_terminal() && config.format != LogFormat::Json;
    if !ansi_output {
        Report::set_color_mode(ColorMode::None);
    }

    delegate_to_correct_layer(config.format, config.level, config.stream.make_writer())
}
