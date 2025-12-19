pub mod console;
pub(crate) mod formatter;
pub mod otlp;

use std::{
    io,
    io::IsTerminal as _,
    path::{Path, PathBuf},
};

use error_stack::{Report, fmt::ColorMode};
use tracing::{Level, Subscriber, level_filters::LevelFilter};
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{
    EnvFilter, Layer,
    filter::Directive,
    fmt::{
        self, FormatFields, MakeWriter,
        format::{DefaultFields, JsonFields},
        time::SystemTime,
    },
    registry::LookupSpan,
};

use self::{console::ConsoleMakeWriter, formatter::TracingFormatter};

/// Output format emitted to the terminal.
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
    #[cfg_attr(feature = "clap", clap(skip))]
    Test,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
#[cfg_attr(feature = "clap", derive(clap::ValueEnum))]
pub enum ColorOption {
    #[default]
    Auto,
    Always,
    Never,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum AnsiSupport {
    Always,
    Never,
}

impl ConsoleStream {
    const fn make_writer(self) -> ConsoleMakeWriter {
        match self {
            Self::Stdout => ConsoleMakeWriter::Stdout,
            Self::Stderr => ConsoleMakeWriter::Stderr,
            Self::Test => ConsoleMakeWriter::Test,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(clap::Args), clap(next_help_heading = Some("Console logging")))]
pub struct ConsoleConfig {
    /// Whether to enable logging to stdout/stderr.
    #[cfg_attr(
        feature = "clap",
        clap(
            id = "logging-console-enabled",
            long = "logging-console-enabled",
            default_value_t = true,
            env = "HASH_GRAPH_LOG_CONSOLE_ENABLED",
            global = true
        )
    )]
    pub enabled: bool,

    /// Log format used for output.
    #[cfg_attr(
        feature = "clap",
        clap(
            id = "logging-console-format",
            long = "logging-console-format",
            default_value_t = LogFormat::Pretty,
            value_enum,
            env = "HASH_GRAPH_LOG_CONSOLE_FORMAT",
            global = true,
        )
    )]
    pub format: LogFormat,

    /// Whether to use colors in the output.
    ///
    /// This will only be used if the format is not `Json`.
    #[cfg_attr(
        feature = "clap",
        clap(
            id = "logging-console-color",
            long = "logging-console-color",
            default_value_t = ColorOption::default(),
            value_enum,
            env = "HASH_GRAPH_LOG_CONSOLE_COLOR",
            global = true,
        )
    )]
    pub color: ColorOption,

    /// Logging verbosity level.
    #[cfg_attr(
        feature = "clap",
        clap(
            id = "logging-console-level",
            long = "logging-console-level",
            env = "HASH_GRAPH_LOG_CONSOLE_LEVEL",
            global = true
        )
    )]
    pub level: Option<Level>,

    /// Stream to write to.
    #[cfg_attr(
        feature = "clap",
        clap(
            id = "logging-console-stream",
            long = "logging-console-stream",
            value_enum,
            default_value_t=ConsoleStream::Stderr,
            global = true
        )
    )]
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
#[cfg_attr(feature = "clap", derive(clap::Args))]
pub struct FileRotation {
    #[cfg_attr(
        feature = "clap",
        clap(
            id = "logging-file-rotation",
            long = "logging-file-rotation",
            value_enum,
            default_value_t = RotationInterval::Never,
            global = true
        )
    )]
    pub rotation: RotationInterval,

    #[cfg_attr(
        feature = "clap",
        clap(
            id = "logging-file-filename-prefix",
            long = "logging-file-filename-prefix",
            default_value = Some("out"),
            global = true
        )
    )]
    pub filename_prefix: Option<String>,
    #[cfg_attr(
        feature = "clap",
        clap(
            id = "logging-file-filename-suffix",
            long = "logging-file-filename-suffix",
            global = true
        )
    )]
    pub filename_suffix: Option<String>,

    #[cfg_attr(
        feature = "clap",
        clap(
            id = "logging-file-max-log-files",
            long = "logging-file-max-log-files",
            global = true
        )
    )]
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
#[cfg_attr(feature = "clap", derive(clap::Args), clap(next_help_heading = Some("File logging")))]
pub struct FileConfig {
    /// Whether to enable logging to a file.
    #[cfg_attr(
        feature = "clap",
        clap(
            id = "logging-file-enabled",
            long = "logging-file-enabled",
            default_value_t = false,
            env = "HASH_GRAPH_LOG_FILE_ENABLED",
            global = true
        )
    )]
    pub enabled: bool,

    /// Log format used for output.
    #[cfg_attr(
        feature = "clap",
        clap(
            id = "logging-file-format",
            long = "logging-file-format",
            default_value_t = LogFormat::Json,
            value_enum,
            env = "HASH_GRAPH_LOG_FILE_FORMAT",
            global = true,
        )
    )]
    pub format: LogFormat,

    /// Logging verbosity level.
    #[cfg_attr(
        feature = "clap",
        clap(
            id = "logging-file-level",
            long = "logging-file-level",
            value_enum,
            env = "HASH_GRAPH_LOG_FILE_LEVEL",
            global = true
        )
    )]
    pub level: Option<Level>,

    /// Logging output folder. The folder is created if it doesn't exist.
    #[cfg_attr(
        feature = "clap",
        clap(
            id = "logging-file-output",
            long = "logging-file-output",
            value_hint = clap::ValueHint::DirPath,
            default_value = "./logs",
            env = "HASH_GRAPH_LOG_FOLDER",
            global = true
        )
    )]
    pub output: PathBuf,

    /// Configuration for log file rotation.
    #[cfg_attr(feature = "clap", clap(flatten))]
    pub rotation: FileRotation,
}

/// Arguments for configuring the logging setup.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(clap::Args))]
pub struct LoggingConfig {
    /// Configuration for logging to the console.
    #[cfg_attr(feature = "clap", clap(flatten))]
    pub console: ConsoleConfig,

    /// Configuration for logging to a file.
    #[cfg_attr(feature = "clap", clap(flatten))]
    pub file: FileConfig,
}

#[must_use]
pub fn env_filter(level: Option<Level>) -> EnvFilter {
    level.map_or_else(
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
    )
}

// type ConcreteLayer<S, W, F>
// where
//     S: Subscriber + for<'a> LookupSpan<'a>,
//     W: for<'writer> MakeWriter<'writer> + 'static,
//     F: for<'write> FormatFields<'write> + 'static,
// = impl Layer<S>;

#[expect(
    clippy::min_ident_chars,
    reason = "False positive lint on generic bounds"
)]
fn layer<S, W, F>(
    format: LogFormat,
    level: Option<Level>,
    writer: W,
    fields: F,
    ansi: AnsiSupport,
) -> impl Layer<S> + use<S, W, F>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    W: for<'writer> MakeWriter<'writer> + 'static,
    F: for<'write> FormatFields<'write> + 'static,
{
    let formatter = format.formatter();

    fmt::layer()
        .event_format(formatter)
        .fmt_fields(fields)
        .with_ansi(ansi == AnsiSupport::Always)
        .with_writer(writer)
        .with_filter(env_filter(level))
}

fn delegate_to_correct_layer<S, W>(
    format: LogFormat,
    level: Option<Level>,
    writer: W,
    ansi: AnsiSupport,
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
            Right::<S, W>::Some(layer(format, level, writer, JsonFields::new(), ansi)),
        ),
        LogFormat::Full | LogFormat::Pretty | LogFormat::Compact => {
            <Left<S, W> as Layer<S>>::and_then(
                Some(layer(format, level, writer, DefaultFields::new(), ansi)),
                Right::<S, W>::None,
            )
        }
    }
}

#[must_use]
pub(crate) fn file_layer<S>(config: FileConfig) -> (impl Layer<S>, impl Drop)
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    let appender = config.rotation.appender(config.output);
    let (writer, guard) = tracing_appender::non_blocking(appender);

    let layer = delegate_to_correct_layer(config.format, config.level, writer, AnsiSupport::Never);

    (layer, guard)
}

// pub type ConsoleLayer<S>
// where
//     S: Subscriber + for<'a> LookupSpan<'a>,
// = impl Layer<S>;

#[expect(
    clippy::min_ident_chars,
    reason = "False positive lint on generic bounds"
)]
#[must_use]
pub fn console_layer<S>(config: &ConsoleConfig) -> impl Layer<S> + use<S>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    let ansi_output = config.format != LogFormat::Json
        && match config.color {
            ColorOption::Auto => match config.stream {
                ConsoleStream::Stdout | ConsoleStream::Test => io::stdout().is_terminal(),
                ConsoleStream::Stderr => io::stderr().is_terminal(),
            },
            ColorOption::Always => true,
            ColorOption::Never => false,
        };
    if !ansi_output {
        Report::set_color_mode(ColorMode::None);
    }

    delegate_to_correct_layer(
        config.format,
        config.level,
        config.stream.make_writer(),
        if ansi_output {
            AnsiSupport::Always
        } else {
            AnsiSupport::Never
        },
    )
}
