use std::{
    convert::Infallible,
    fmt::{Display, Formatter},
    fs, io,
    path::{Path, PathBuf},
    str::FromStr,
};

use tracing::{Event, Subscriber};
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{
    filter::{Directive, LevelFilter},
    fmt::{
        self,
        format::{Format, JsonFields, Writer},
        time::FormatTime,
        writer::BoxMakeWriter,
        FmtContext, FormatEvent, FormatFields,
    },
    prelude::*,
    registry::LookupSpan,
    util::TryInitError,
    EnvFilter,
};

/// Output format emitted to the terminal
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(clap::ArgEnum))]
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
            LogFormat::Full => f.write_str("full"),
            LogFormat::Pretty => f.write_str("pretty"),
            LogFormat::Json => f.write_str("json"),
            LogFormat::Compact => f.write_str("compact"),
        }
    }
}

enum OutputFormatter<T> {
    Full(Format<fmt::format::Full, T>),
    Pretty(Format<fmt::format::Pretty, T>),
    Json(Format<fmt::format::Json, T>),
    Compact(Format<fmt::format::Compact, T>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(clap::Subcommand))]
pub enum OutputLocation {
    StdOut,
    StdErr,
    File { path: PathBuf },
}

impl Display for OutputLocation {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            OutputLocation::StdOut => f.write_str("stdout"),
            OutputLocation::StdErr => f.write_str("stderr"),
            OutputLocation::File { path } => Display::fmt(&path.to_string_lossy(), f),
        }
    }
}

impl FromStr for OutputLocation {
    type Err = Infallible;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "stdout" => Ok(Self::StdOut),
            "stderr" => Ok(Self::StdErr),
            _ => Ok(Self::File {
                path: PathBuf::from_str(s)?,
            }),
        }
    }
}

impl Default for OutputLocation {
    fn default() -> Self {
        Self::StdErr
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(clap::ArgEnum))]
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
        use tracing::Level;
        match level {
            LogLevel::Trace => Directive::from(Level::TRACE),
            LogLevel::Debug => Directive::from(Level::DEBUG),
            LogLevel::Info => Directive::from(Level::INFO),
            LogLevel::Warning => Directive::from(Level::WARN),
            LogLevel::Error => Directive::from(Level::ERROR),
        }
    }
}

impl OutputLocation {
    fn writer<P: AsRef<Path>>(&self, log_folder: P) -> (BoxMakeWriter, OutputFileGuard) {
        match self {
            Self::StdOut => (BoxMakeWriter::new(io::stdout), OutputFileGuard::None),
            Self::StdErr => (BoxMakeWriter::new(io::stderr), OutputFileGuard::None),
            Self::File { path } => {
                let file_appender = tracing_appender::rolling::never(log_folder, path);
                let (file, guard) = tracing_appender::non_blocking(file_appender);
                (BoxMakeWriter::new(file), OutputFileGuard::File(guard))
            }
        }
    }

    fn ansi(&self) -> bool {
        match self {
            // TODO: evaluate if we want disable ansi-output (color) in files
            Self::File { path: _ } => true,
            _ => true,
        }
    }
}

enum OutputFileGuard {
    None,
    File(WorkerGuard),
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

impl Default for LogFormat {
    fn default() -> Self {
        Self::Pretty
    }
}

/// Guard for file logging, which should not be dropped until every log entry has been written.
struct LogGuard {
    _output_guard: OutputFileGuard,
    _json_file_guard: WorkerGuard,
    #[cfg(feature = "texray")]
    _texray_guard: WorkerGuard,
    #[cfg(not(feature = "texray"))]
    _texray_guard: (),
}

impl Drop for LogGuard {
    fn drop(&mut self) {}
}

pub fn init_logger<P: AsRef<Path>>(
    log_format: LogFormat,
    output_location: &OutputLocation,
    log_folder: P,
    log_level: Option<LogLevel>,
    log_file_name: &str,
    texray_log_file_name: &str,
) -> Result<impl Drop, TryInitError> {
    let log_folder = log_folder.as_ref();

    let filter = if let Some(log_level) = log_level {
        EnvFilter::default().add_directive(Directive::from(log_level))
    } else {
        match std::env::var("RUST_LOG") {
            Ok(env) => EnvFilter::new(env),
            #[cfg(debug_assertions)]
            _ => EnvFilter::default().add_directive(Directive::from(LevelFilter::DEBUG)),
            #[cfg(not(debug_assertions))]
            _ => EnvFilter::default().add_directive(Directive::from(LevelFilter::WARN)),
        }
    };

    let formatter = fmt::format()
        .with_timer(fmt::time::Uptime::default())
        .with_target(true);
    let output_format = match log_format {
        LogFormat::Full => OutputFormatter::Full(formatter.clone()),
        LogFormat::Pretty => OutputFormatter::Pretty(formatter.clone().pretty()),
        LogFormat::Json => OutputFormatter::Json(formatter.clone().json()),
        LogFormat::Compact => OutputFormatter::Compact(formatter.clone().compact()),
    };

    let error_layer = tracing_error::ErrorLayer::default();

    let (output_writer, _output_guard) = output_location.writer(log_folder);
    // Because of how the Registry and Layer interface is designed, we can't just have one layer,
    // as they have different types. We also can't box them as it requires Sized. However,
    // Option<Layer> implements the Layer trait so we can  just provide None for one and Some
    // for the other
    let (output_layer, json_output_layer) = match log_format {
        LogFormat::Json => (
            None,
            Some(
                fmt::layer()
                    .event_format(output_format)
                    .with_ansi(output_location.ansi())
                    .fmt_fields(JsonFields::new())
                    .with_writer(output_writer),
            ),
        ),
        _ => (
            Some(
                fmt::layer()
                    .event_format(output_format)
                    .with_ansi(output_location.ansi())
                    .with_writer(output_writer),
            ),
            None,
        ),
    };

    if log_folder.exists() {
        if !log_folder.is_dir() {
            eprintln!(
                "The provided log folder is not a directory (it is probably a file). Note that \
                 the default name of the log folder is `log`, so if you have a file named `log` \
                 in the current directory and you have selected `log` as the directory to save \
                 the engine logs, please move the file named `log` to a different directory, or \
                 choose a different directory to write log output to."
            );
            std::process::exit(1);
        }
    } else if let Err(e) = fs::create_dir(log_folder) {
        eprintln!(
            "Could not create the log folder. Please try creating the folder `{}` in the \
             directory from which you are running the engine.
             Note: the specific error the engine encountered is `{:?}`",
            log_folder.display(),
            e
        );
        std::process::exit(1)
    }

    let json_file_appender =
        tracing_appender::rolling::never(log_folder, format!("{log_file_name}.json"));
    let (non_blocking, _json_file_guard) = tracing_appender::non_blocking(json_file_appender);

    let json_file_layer = fmt::layer()
        .event_format(formatter.json())
        .fmt_fields(JsonFields::new())
        .with_writer(non_blocking);

    let (texray_layer, _texray_guard) =
        texray::create_texray_layer(&log_folder, texray_log_file_name);

    tracing_subscriber::registry()
        .with(filter)
        .with(output_layer)
        .with(json_output_layer)
        .with(json_file_layer)
        .with(error_layer)
        .with(texray_layer)
        .try_init()?;

    Ok(LogGuard {
        _output_guard,
        _json_file_guard,
        _texray_guard,
    })
}

#[cfg(feature = "texray")]
pub mod texray {
    use std::path::Path;

    use tracing_appender::non_blocking::WorkerGuard;
    pub use tracing_texray::examine;
    use tracing_texray::TeXRayLayer;

    pub fn create_texray_layer(
        log_folder: impl AsRef<Path>,
        output_name: &str,
    ) -> (Option<TeXRayLayer>, WorkerGuard) {
        let texray_file_appender =
            tracing_appender::rolling::never(log_folder.as_ref(), format!("{output_name}.txt"));
        let (non_blocking, texray_guard) = tracing_appender::non_blocking(texray_file_appender);

        // we clone update_settings to satisfy move rules as writer takes a `Fn` rather than
        // `FnOnce`
        let texray_layer =
            TeXRayLayer::new().update_settings(|settings| settings.writer(non_blocking.clone()));
        // only print spans longer than a certain duration
        // .min_duration(Duration::from_millis(100)),;

        (Some(texray_layer), texray_guard)
    }
}

#[cfg(not(feature = "texray"))]
pub mod texray {
    use std::path::Path;

    use tracing::Span;
    use tracing_subscriber::fmt::Layer;

    pub fn examine(span: Span) -> Span {
        span
    }

    pub fn create_texray_layer<S>(
        _log_folder: impl AsRef<Path>,
        _output_name: &str,
    ) -> (Option<Layer<S>>, ()) {
        (None, ())
    }
}
