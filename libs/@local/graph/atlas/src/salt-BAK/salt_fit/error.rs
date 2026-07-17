use core::{error::Error, fmt};
use std::io;

use camino::Utf8PathBuf;

/// Failure while loading or validating a production fit request.
#[derive(Debug)]
pub enum FitConfigurationError {
    /// A configured file could not be read or inspected.
    Io {
        path: Utf8PathBuf,
        source: io::Error,
    },
    /// A bounded JSON document did not match its typed schema.
    Json {
        document: &'static str,
        source: serde_json::Error,
    },
    /// A typed field violated an M0 invariant.
    Invalid {
        field: &'static str,
        reason: &'static str,
    },
    /// A relative input escaped its configured root.
    PathEscape {
        field: &'static str,
        path: Utf8PathBuf,
    },
    /// A secret file had unsafe Unix permissions.
    SecretPermissions { path: Utf8PathBuf, mode: u32 },
    /// A content-addressed input did not match its declared digest.
    ContentHash {
        field: &'static str,
        path: Utf8PathBuf,
    },
}

impl fmt::Display for FitConfigurationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io { path, .. } => write!(formatter, "could not read fit input {path}"),
            Self::Json { document, .. } => {
                write!(formatter, "{document} does not match its versioned schema")
            }
            Self::Invalid { field, reason } => {
                write!(formatter, "invalid fit field {field}: {reason}")
            }
            Self::PathEscape { field, path } => {
                write!(
                    formatter,
                    "fit field {field} escapes its configured root: {path}"
                )
            }
            Self::SecretPermissions { path, mode } => write!(
                formatter,
                "secret file {path} has mode {mode:04o}; expected 0400 or 0600"
            ),
            Self::ContentHash { field, path } => {
                write!(
                    formatter,
                    "fit field {field} does not match the content of {path}"
                )
            }
        }
    }
}

impl Error for FitConfigurationError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            Self::Json { source, .. } => Some(source),
            Self::Invalid { .. }
            | Self::PathEscape { .. }
            | Self::SecretPermissions { .. }
            | Self::ContentHash { .. } => None,
        }
    }
}
