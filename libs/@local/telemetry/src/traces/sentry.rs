use alloc::{borrow::Cow, sync::Arc};
#[cfg(feature = "clap")]
use core::str::FromStr as _;
use core::{fmt, panic::Location};
#[cfg(feature = "clap")]
use std::ffi::OsStr;
use std::{
    fs::File,
    io::{BufRead as _, BufReader},
    path::Path,
};

#[cfg(feature = "clap")]
use clap::{Arg, Command, Error, Parser, builder::TypedValueParser, error::ErrorKind};
use error_stack::Report;
pub use sentry::release_name;
use sentry::{
    Hub, Level,
    integrations::tracing::EventFilter,
    protocol::{Event, TemplateInfo},
};
use sentry_types::Dsn;
use tracing::Subscriber;
use tracing_subscriber::{Layer, registry::LookupSpan};

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

/// Arguments for configuring the Sentry setup.
#[derive(Debug, Clone)]
#[cfg_attr(feature = "clap", derive(Parser), clap(next_help_heading = Some("Sentry")))]
pub struct SentryConfig {
    // we need to qualify `Option` here, as otherwise `clap` tries to be too smart and only uses
    // the `value_parser` on the internal `sentry::types::Dsn`, failing.
    #[cfg_attr(feature = "clap", arg(
        id = "sentry-dsn",
        long = "sentry-dsn",
        env = "HASH_GRAPH_SENTRY_DSN",
        value_parser = OptionalSentryDsnParser,
        default_value = ""
    ))]
    pub dsn: core::option::Option<Dsn>,

    #[cfg_attr(feature = "clap", arg(
        id = "sentry-environment",
        long = "sentry-environment",
        env = "HASH_GRAPH_SENTRY_ENVIRONMENT",
        default_value_t = SentryEnvironment::default(),
    ))]
    pub environment: SentryEnvironment,

    /// Enable every parent span's attributes to be sent along with own event's attributes.
    #[cfg_attr(
        feature = "clap",
        arg(
            id = "sentry-enable-span-attributes",
            long = "sentry-enable-span-attribute ",
            env = "HASH_GRAPH_SENTRY_ENABLE_SPAN_ATTRIBUTES",
        )
    )]
    pub enable_span_attributes: bool,

    #[cfg_attr(
        feature = "clap",
        arg(
            id = "sentry-span-filter",
            long = "sentry-span-filter",
            env = "HASH_GRAPH_SENTRY_SPAN_FILTER",
            default_value_t = tracing::Level::INFO
        )
    )]
    pub span_filter: tracing::Level,

    #[cfg_attr(
        feature = "clap",
        arg(
            id = "sentry-event-filter",
            long = "sentry-event-filter",
            env = "HASH_GRAPH_SENTRY_EVENT_FILTER",
            default_value_t = tracing::Level::INFO
        )
    )]
    pub event_filter: tracing::Level,
}

#[expect(
    clippy::min_ident_chars,
    reason = "False positive lint on generic bounds"
)]
pub fn init<R>(config: &SentryConfig, release: R) -> impl Drop + use<R>
where
    R: Into<Option<Cow<'static, str>>>,
{
    // Initialize Sentry
    // When initializing Sentry, a `Drop` guard is returned, once dropped any remaining events are
    // flushed. This means we need to keep the guard around for the entire lifetime of the program.
    sentry::init(sentry::ClientOptions {
        dsn: config.dsn.clone(),
        release: release.into(),
        traces_sampler: Some(Arc::new(|ctx| {
            if Some(true) == ctx.sampled() {
                1.0
            } else if ctx.operation() == "http.server" {
                0.1
            } else {
                1.0
            }
        })),
        environment: Some(Cow::Owned(config.environment.to_string())),
        attach_stacktrace: true,
        in_app_exclude: vec!["tracing", "axum", "futures", "tower", "tokio"],

        ..Default::default()
    })
}

// Avoids capturing lifetimes
// pub type SentryLayer<S: Subscriber + for<'a> LookupSpan<'a>> = impl Layer<S>;

#[expect(
    clippy::min_ident_chars,
    reason = "False positive lint on generic bounds"
)]
#[must_use]
pub fn layer<'c, S>(config: &'c SentryConfig) -> impl Layer<S> + use<S>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    let mut layer = ::sentry::integrations::tracing::layer();
    if config.enable_span_attributes {
        layer = layer.enable_span_attributes();
    }
    let span_filter = config.span_filter;
    let event_filter = config.event_filter;
    layer
        .span_filter(move |metadata| *metadata.level() <= span_filter)
        .event_filter(move |metadata| match *metadata.level() {
            tracing::Level::ERROR => EventFilter::Event,
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
