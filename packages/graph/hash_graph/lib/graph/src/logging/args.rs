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
pub struct LoggingArgs {
    /// Log format used for output to stderr.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            default_value = "pretty",
            value_enum,
            env = "HASH_GRAPH_LOG_FORMAT",
            global = true
        )
    )]
    pub log_format: LogFormat,

    /// Logging verbosity to use. If not set `RUST_LOG` will be used.
    #[cfg_attr(feature = "clap", clap(long, value_enum, global = true))]
    pub log_level: Option<LogLevel>,

    /// Logging output folder. The folder is created if it doesn't exist.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            default_value = "./log",
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
