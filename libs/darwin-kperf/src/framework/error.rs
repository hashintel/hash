//! Error types for `kperfdata.framework` operations.

use core::{error, ffi::c_int, fmt};

use darwin_kperf_sys::kperfdata;

/// Categorizes a `kpep_config_error_code` into a semantic variant.
///
/// The variants mirror the `KPEP_CONFIG_ERROR_*` constants from `kperfdata.framework`.
/// [`Other`](FrameworkErrorKind::Other) captures any unrecognized code returned by a future OS
/// revision.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrameworkErrorKind {
    /// The operation completed successfully (`KPEP_CONFIG_ERROR_NONE`, code 0).
    None,
    /// A required argument was null or otherwise invalid.
    InvalidArgument,
    /// Memory allocation failed inside the framework.
    OutOfMemory,
    /// An I/O error occurred while reading the PMC database plist.
    Io,
    /// A caller-supplied buffer was too small to receive the result.
    BufferTooSmall,
    /// The current CPU could not be identified in the PMC database.
    CurrentSystemUnknown,
    /// The path to the PMC database plist is invalid.
    DatabasePathInvalid,
    /// No PMC database plist was found for the requested CPU.
    DatabaseNotFound,
    /// The PMC database exists but targets an unsupported architecture.
    DatabaseArchitectureUnsupported,
    /// The PMC database version is not supported by this framework build.
    DatabaseVersionUnsupported,
    /// The PMC database plist is malformed or corrupt.
    DatabaseCorrupt,
    /// The requested event name was not found in the PMC database.
    EventNotFound,
    /// Two or more events conflict and cannot be measured simultaneously.
    ConflictingEvents,
    /// Counters must be force-acquired via `kpc_force_all_ctrs_set(1)` before configuring.
    AllCountersMustBeForced,
    /// The requested event exists in the database but is unavailable on this hardware.
    EventUnavailable,
    /// A POSIX error occurred; check `errno` for details.
    CheckErrno,
    /// An error code not covered by any known variant.
    Other(c_int),
}

impl FrameworkErrorKind {
    /// Maps a raw `kpep_config_error_code` to its corresponding variant.
    const fn from_code(code: c_int) -> Self {
        match code {
            kperfdata::KPEP_CONFIG_ERROR_NONE => Self::None,
            kperfdata::KPEP_CONFIG_ERROR_INVALID_ARGUMENT => Self::InvalidArgument,
            kperfdata::KPEP_CONFIG_ERROR_OUT_OF_MEMORY => Self::OutOfMemory,
            kperfdata::KPEP_CONFIG_ERROR_IO => Self::Io,
            kperfdata::KPEP_CONFIG_ERROR_BUFFER_TOO_SMALL => Self::BufferTooSmall,
            kperfdata::KPEP_CONFIG_ERROR_CUR_SYSTEM_UNKNOWN => Self::CurrentSystemUnknown,
            kperfdata::KPEP_CONFIG_ERROR_DB_PATH_INVALID => Self::DatabasePathInvalid,
            kperfdata::KPEP_CONFIG_ERROR_DB_NOT_FOUND => Self::DatabaseNotFound,
            kperfdata::KPEP_CONFIG_ERROR_DB_ARCH_UNSUPPORTED => {
                Self::DatabaseArchitectureUnsupported
            }
            kperfdata::KPEP_CONFIG_ERROR_DB_VERSION_UNSUPPORTED => Self::DatabaseVersionUnsupported,
            kperfdata::KPEP_CONFIG_ERROR_DB_CORRUPT => Self::DatabaseCorrupt,
            kperfdata::KPEP_CONFIG_ERROR_EVENT_NOT_FOUND => Self::EventNotFound,
            kperfdata::KPEP_CONFIG_ERROR_CONFLICTING_EVENTS => Self::ConflictingEvents,
            kperfdata::KPEP_CONFIG_ERROR_COUNTERS_NOT_FORCED => Self::AllCountersMustBeForced,
            kperfdata::KPEP_CONFIG_ERROR_EVENT_UNAVAILABLE => Self::EventUnavailable,
            kperfdata::KPEP_CONFIG_ERROR_ERRNO => Self::CheckErrno,
            _ => Self::Other(code),
        }
    }

    const fn as_str(self) -> &'static str {
        match self {
            Self::None => "success",
            Self::InvalidArgument => "invalid argument",
            Self::OutOfMemory => "out of memory",
            Self::Io => "I/O error",
            Self::BufferTooSmall => "buffer too small",
            Self::CurrentSystemUnknown => "current system unknown",
            Self::DatabasePathInvalid => "database path invalid",
            Self::DatabaseNotFound => "database not found",
            Self::DatabaseArchitectureUnsupported => "database architecture unsupported",
            Self::DatabaseVersionUnsupported => "database version unsupported",
            Self::DatabaseCorrupt => "database corrupt",
            Self::EventNotFound => "event not found",
            Self::ConflictingEvents => "conflicting events",
            Self::AllCountersMustBeForced => "all counters must be forced",
            Self::EventUnavailable => "event unavailable",
            Self::CheckErrno => "check errno",
            Self::Other(_) => "unknown error",
        }
    }
}

impl fmt::Display for FrameworkErrorKind {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(self.as_str())
    }
}

/// An error returned by a `kperfdata.framework` function.
///
/// Wraps the raw `c_int` error code together with its decoded [`FrameworkErrorKind`]. The original
/// code is preserved so callers can inspect values that may not map to a known variant.
pub struct FrameworkError {
    code: c_int,
    kind: FrameworkErrorKind,
}

impl FrameworkError {
    /// Creates an `Error` from a raw `kpep_config_error_code`.
    #[must_use]
    pub const fn from_code(code: c_int) -> Self {
        Self {
            code,
            kind: FrameworkErrorKind::from_code(code),
        }
    }

    /// Returns the semantic category of this error.
    #[must_use]
    pub const fn kind(&self) -> FrameworkErrorKind {
        self.kind
    }
}

impl fmt::Debug for FrameworkError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("Error")
            .field("kind", &self.kind)
            .finish_non_exhaustive()
    }
}

impl fmt::Display for FrameworkError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "kpep error {}: {}", self.code, self.kind)
    }
}

impl error::Error for FrameworkError {}
