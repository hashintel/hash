use std::{
    borrow::Cow,
    fmt,
    fs::File,
    io::{BufRead, BufReader},
    panic::Location,
    path::Path,
    sync::Arc,
};
#[cfg(feature = "clap")]
use std::{ffi::OsStr, str::FromStr};

#[cfg(feature = "clap")]
use clap::{builder::TypedValueParser, error::ErrorKind, Arg, Command, Error, Parser};
use error_stack::Report;
pub use sentry::release_name;
use sentry::{
    integrations::tracing::{EventFilter, SentryLayer},
    protocol::{Event, TemplateInfo},
    types::Dsn,
    ClientInitGuard, Hub, Level,
};
use tracing::Subscriber;
use tracing_subscriber::registry::LookupSpan;

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(clap::ValueEnum))]
pub enum SentryEnvironment {
    #[default]
    Development,
    Production,
}

impl fmt::Display for SentryEnvironment {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Development => fmt.write_str("development"),
            Self::Production => fmt.write_str("production"),
        }
    }
}

#[derive(Clone)]
#[cfg(feature = "clap")]
pub struct OptionalSentryDsnParser;

#[cfg(feature = "clap")]
impl TypedValueParser for OptionalSentryDsnParser {
    type Value = Option<Dsn>;

    fn parse_ref(
        &self,
        cmd: &Command,
        _: Option<&Arg>,
        value: &OsStr,
    ) -> Result<Self::Value, Error> {
        if value.is_empty() {
            Ok(None)
        } else {
            let Some(value) = value.to_str() else {
                return Err(Error::new(ErrorKind::InvalidValue).with_cmd(cmd));
            };

            Dsn::from_str(value)
                .map(Some)
                .map_err(|_error| Error::new(ErrorKind::InvalidValue))
        }
    }
}

/// Arguments for configuring the logging setup
#[derive(Debug, Clone)]
#[cfg_attr(feature = "clap", derive(Parser))]
pub struct SentryConfig {
    // we need to qualify `Option` here, as otherwise `clap` tries to be too smart and only uses
    // the `value_parser` on the internal `sentry::types::Dsn`, failing.
    #[cfg_attr(feature = "clap", arg(long, env = "HASH_GRAPH_SENTRY_DSN", value_parser = OptionalSentryDsnParser, default_value = ""))]
    pub sentry_dsn: core::option::Option<Dsn>,

    #[cfg_attr(feature = "clap", arg(
    long,
    env = "HASH_GRAPH_SENTRY_ENVIRONMENT",
    default_value_t = SentryEnvironment::default(),
    ))]
    pub sentry_environment: SentryEnvironment,

    /// Enable every parent span's attributes to be sent along with own event's attributes.
    #[cfg_attr(
        feature = "clap",
        arg(long, env = "HASH_GRAPH_SENTRY_ENABLE_SPAN_ATTRIBUTES",)
    )]
    pub sentry_enable_span_attributes: bool,

    #[cfg_attr(
        feature = "clap",
        arg(long, env = "HASH_GRAPH_SENTRY_SPAN_FILTER", default_value_t = tracing::Level::INFO)
    )]
    pub sentry_span_filter: tracing::Level,

    #[cfg_attr(
        feature = "clap",
        arg(long, env = "HASH_GRAPH_SENTRY_EVENT_FILTER", default_value_t = tracing::Level::INFO)
    )]
    pub sentry_event_filter: tracing::Level,
}

pub fn init_sentry(
    config: &SentryConfig,
    release: impl Into<Option<Cow<'static, str>>>,
) -> ClientInitGuard {
    // Initialize Sentry
    // When initializing Sentry, a `Drop` guard is returned, once dropped any remaining events are
    // flushed. This means we need to keep the guard around for the entire lifetime of the program.
    sentry::init(sentry::ClientOptions {
        dsn: config.sentry_dsn.clone(),
        release: release.into(),
        session_mode: sentry::SessionMode::Request,
        traces_sampler: Some(Arc::new(|ctx| {
            if Some(true) == ctx.sampled() {
                1.0
            } else if ctx.operation() == "http.server" {
                0.1
            } else {
                1.0
            }
        })),
        environment: Some(Cow::Owned(config.sentry_environment.to_string())),
        attach_stacktrace: true,
        in_app_exclude: vec!["tracing", "axum", "futures", "tower", "tokio"],

        ..Default::default()
    })
}

#[must_use]
pub fn layer<S>(config: &SentryConfig) -> SentryLayer<S>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    let mut layer = ::sentry::integrations::tracing::layer();
    if config.sentry_enable_span_attributes {
        layer = layer.enable_span_attributes();
    }
    let span_filter = config.sentry_event_filter;
    let event_filter = config.sentry_event_filter;
    layer
        .span_filter(move |metadata| *metadata.level() <= span_filter)
        .event_filter(move |metadata| match *metadata.level() {
            tracing::Level::ERROR => EventFilter::Exception,
            level if level <= event_filter => EventFilter::Breadcrumb,
            _ => EventFilter::Ignore,
        })
}

fn read_source(location: Location) -> (Vec<String>, Option<String>, Vec<String>) {
    let Ok(file) = File::open(location.file()) else {
        return (Vec::new(), None, Vec::new());
    };

    // Extract relevant lines.
    let reader = BufReader::new(file);
    let line_no = location.line() as usize - 1;
    let start_line = line_no.saturating_sub(10);

    // Read the surrounding lines of `location`:
    // - 10 lines before (stored into `pre_context`)
    // - 3 lines after (stored into `post_context`)
    // - the line of `location` (stored into `context_line`)
    let mut pre_context = Vec::with_capacity(10);
    let mut context_line = None;
    let mut post_context = Vec::with_capacity(3);

    for (current_line, line) in reader.lines().enumerate().skip(start_line) {
        let Ok(line) = line else {
            // If the file can only partially be read, we cannot use the source.
            return (Vec::new(), None, Vec::new());
        };
        if current_line < line_no {
            pre_context.push(line);
        } else if current_line == line_no {
            context_line.replace(line);
        } else if current_line <= line_no + 3 {
            post_context.push(line);
        } else {
            break;
        }
    }

    (pre_context, context_line, post_context)
}

fn create_template(location: Location) -> TemplateInfo {
    let (pre_context, context_line, post_context) = read_source(location);

    let path = Path::new(location.file());
    path.file_name()
        .map(|path| path.to_string_lossy().to_string());

    TemplateInfo {
        filename: path
            .file_name()
            .map(|path| path.to_string_lossy().to_string()),
        abs_path: Some(location.file().to_owned()),
        lineno: Some(u64::from(location.line())),
        colno: Some(u64::from(location.column())),
        pre_context,
        context_line,
        post_context,
    }
}

#[track_caller]
pub fn capture_report<C>(report: &Report<C>) {
    Hub::with_active(|hub| {
        hub.capture_event(Event {
            level: Level::Error,
            message: Some(format!("Error: {report:#?}")),
            template: report
                .request_ref::<Location>()
                .next()
                .copied()
                .or_else(|| report.request_value::<Location>().next())
                .map(create_template),
            ..Event::default()
        });
    });
}
