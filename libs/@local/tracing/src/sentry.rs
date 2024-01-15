#[cfg(feature = "clap")]
use std::ffi::OsStr;
use std::{borrow::Cow, fmt, str::FromStr, sync::Arc};

#[cfg(feature = "clap")]
use clap::{builder::TypedValueParser, error::ErrorKind, Arg, Command, Error, Parser};
use sentry::{types::Dsn, ClientInitGuard};

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
    type Value = Option<sentry::types::Dsn>;

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

            sentry::types::Dsn::from_str(value)
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
}

pub fn init_sentry(config: &SentryConfig) -> ClientInitGuard {
    // Initialize Sentry
    // When initializing Sentry, a `Drop` guard is returned, once dropped any remaining events are
    // flushed. This means we need to keep the guard around for the entire lifetime of the program.
    sentry::init(sentry::ClientOptions {
        dsn: config.sentry_dsn.clone(),
        release: sentry::release_name!(),
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
