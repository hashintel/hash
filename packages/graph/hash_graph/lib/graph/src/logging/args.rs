use std::{
    fmt::{Display, Formatter},
    path::PathBuf,
};

#[cfg(feature = "clap")]
use clap::Parser;
use tracing::Level;
use tracing_subscriber::filter::Directive;

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

impl Default for LogFormat {
    fn default() -> Self {
        Self::Pretty
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
        match level {
            LogLevel::Trace => Directive::from(Level::TRACE),
            LogLevel::Debug => Directive::from(Level::DEBUG),
            LogLevel::Info => Directive::from(Level::INFO),
            LogLevel::Warning => Directive::from(Level::WARN),
            LogLevel::Error => Directive::from(Level::ERROR),
        }
    }
}

/// Arguments for configuring the logging setup
#[derive(Debug)]
#[cfg_attr(feature = "clap", derive(Parser))]
pub struct LoggingArgs {
    /// Log format used for output to stderr.
    #[cfg_attr(
        feature = "clap",
        clap(long, default_value = "pretty", arg_enum, env = "HASH_LOG_FORMAT")
    )]
    pub log_format: LogFormat,

    /// Logging verbosity to use. If not set `RUST_LOG` will be used
    #[cfg_attr(feature = "clap", clap(long, arg_enum))]
    pub log_level: Option<LogLevel>,

    /// Logging output folder. The folder is created if it doesn't exist.
    #[cfg_attr(
        feature = "clap",
        clap(long, default_value = "./log", env = "HASH_LOG_FOLDER")
    )]
    pub log_folder: PathBuf,

    /// Logging output file prefix.
    #[cfg_attr(feature = "clap", clap(short, long, default_value = "out"))]
    pub log_file_prefix: String,
}
