use std::{
    convert::Infallible,
    env::VarError,
    fmt::{Display, Formatter},
    io,
    path::{Path, PathBuf},
    str::FromStr,
    time::Duration,
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
    /// Newline-delimited JSON logs.
    Json,
    /// Only includes the fields from the most recently entered span.
    Compact,
}

impl Display for OutputFormat {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
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

#[derive(Debug, Clone, PartialEq, Eq, clap::ArgEnum)]
pub enum OutputLocation {
    StdOut,
    StdErr,
    File(PathBuf),
}

impl Display for OutputLocation {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            OutputLocation::StdOut => f.write_str("stdout"),
            OutputLocation::StdErr => f.write_str("stderr"),
            OutputLocation::File(path) => Display::fmt(&path.to_string_lossy(), f),
        }
    }
}

impl FromStr for OutputLocation {
    type Err = Infallible;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "stdout" => Ok(Self::StdOut),
            "stderr" => Ok(Self::StdErr),
            _ => Ok(Self::File(PathBuf::from_str(s)?)),
        }
    }
}

impl Default for OutputLocation {
    fn default() -> Self {
        Self::StdErr
    }
}

impl OutputLocation {
    fn writer<P: AsRef<Path>>(&self, log_folder: P) -> (BoxMakeWriter, OutputFileGuard) {
        match self {
            Self::StdOut => (BoxMakeWriter::new(io::stdout), OutputFileGuard::None),
            Self::StdErr => (BoxMakeWriter::new(io::stderr), OutputFileGuard::None),
            Self::File(file_name) => {
                let file_appender = tracing_appender::rolling::never(log_folder, file_name);
                let (file, guard) = tracing_appender::non_blocking(file_appender);
                (BoxMakeWriter::new(file), OutputFileGuard::File(guard))
            }
        }
    }

    fn ansi(&self) -> bool {
        match self {
            // TODO: evaluate if we want disable ansi-output (color) in files
            Self::File(_) => true,
            _ => true,
        }
    }
}

pub enum OutputFileGuard {
    None,
    File(WorkerGuard),
}

impl Drop for OutputFileGuard {
    fn drop(&mut self) {}
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

pub fn init_logger<P: AsRef<Path>>(
    output_format: OutputFormat,
    output_location: OutputLocation,
    log_folder: P,
    log_file_output_name: &str,
    texray_output_name: &str,
) -> (impl Drop, impl Drop, impl Drop) {
    let log_folder = log_folder.as_ref();

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
    let output_formatter = match output_format {
        OutputFormat::Full => OutputFormatter::Full(formatter.clone()),
        OutputFormat::Pretty => OutputFormatter::Pretty(formatter.clone().pretty()),
        OutputFormat::Json => OutputFormatter::Json(formatter.clone().json()),
        OutputFormat::Compact => OutputFormatter::Compact(formatter.clone().compact()),
    };

    let error_layer = tracing_error::ErrorLayer::default();

    let (output_writer, output_guard) = output_location.writer(log_folder);
    // Because of how the Registry and Layer interface is designed, we can't just have one layer,
    // as they have different types. We also can't box them as it requires Sized. However,
    // Option<Layer> implements the Layer trait so we can  just provide None for one and Some
    // for the other
    let (output_layer, json_output_layer) = match output_format {
        OutputFormat::Json => (
            None,
            Some(
                fmt::layer()
                    .event_format(output_formatter)
                    .with_ansi(output_location.ansi())
                    .fmt_fields(JsonFields::new())
                    .with_writer(output_writer),
            ),
        ),
        _ => (
            Some(
                fmt::layer()
                    .event_format(output_formatter)
                    .with_ansi(output_location.ansi())
                    .with_writer(output_writer),
            ),
            None,
        ),
    };

    let json_file_appender =
        tracing_appender::rolling::never(log_folder, format!("{log_file_output_name}.json"));
    let (non_blocking, json_file_guard) = tracing_appender::non_blocking(json_file_appender);

    let json_file_layer = fmt::layer()
        .event_format(formatter.json())
        .fmt_fields(JsonFields::new())
        .with_writer(non_blocking);

    let (texray_layer, texray_guard) = texray::create_texray_layer(texray_output_name);

    tracing_subscriber::registry()
        .with(filter)
        .with(output_layer)
        .with(json_output_layer)
        .with(json_file_layer)
        .with(error_layer)
        .with(texray_layer)
        .init();

    (json_file_guard, texray_guard, output_guard)
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

#[cfg(feature = "texray")]
pub mod texray {
    pub use tracing_texray::examine;
    use tracing_texray::TeXRayLayer;

    pub fn create_texray_layer(output_name: &str) -> (Option<TeXRayLayer>, impl Drop) {
        let texray_file_appender =
            tracing_appender::rolling::never("./log", format!("{output_name}.txt"));
        let (non_blocking, _texray_guard) = tracing_appender::non_blocking(texray_file_appender);

        // we clone update_settings to satisfy move rules as writer takes a `Fn` rather than
        // `FnOnce`
        let texray_layer =
            TeXRayLayer::new().update_settings(|settings| settings.writer(non_blocking.clone()));
        // only print spans longer than a certain duration
        // .min_duration(Duration::from_millis(100)),;

        (Some(texray_layer), _texray_guard)
    }
}

#[cfg(not(feature = "texray"))]
pub mod texray {
    use tracing::Span;
    use tracing_subscriber::fmt::Layer;

    pub fn examine(span: Span) -> Span {
        span
    }

    struct EmptyDrop {}
    impl Drop for EmptyDrop {
        fn drop(&mut self) {}
    }

    pub fn create_texray_layer<S>(_output_name: &str) -> (Option<Layer<S>>, impl Drop) {
        (None, EmptyDrop {})
    }
}
