//! Error types for the sampler API.

use alloc::string::String;
use core::{error, ffi::c_int, fmt};

use darwin_kperf_sys::load::LoadError;

use crate::{FrameworkError, event::Event};

/// An error from the [`Sampler`](super::Sampler) API.
#[derive(Debug)]
pub enum SamplerError {
    /// Failed to load a framework via `dlopen`/`dlsym`.
    Load(LoadError),
    /// A `kperfdata.framework` (KPEP) operation failed.
    Framework(FrameworkError),
    /// The PMC database name is not valid UTF-8.
    InvalidCpuName,
    /// The detected CPU is not recognized by this build.
    UnknownCpu(String),
    /// An event is not available on the detected CPU.
    EventUnavailable(Event),
    /// The framework's `kpep_event` struct size does not match our definition.
    EventLayoutMismatch { expected: usize, actual: usize },
    /// A framework function returned a null pointer where non-null was expected.
    UnexpectedNullPointer,
    /// Insufficient privileges to access performance counters.
    MissingPrivileges,
    /// Failed to force-acquire all hardware counters.
    FailedToForceAllCounters(c_int),
    /// Failed to set KPC register configuration.
    FailedToSetKpcConfig(c_int),
    /// Failed to enable counting.
    UnableToStartCounting(c_int),
    /// Failed to disable counting.
    UnableToStopCounting(c_int),
    /// Failed to enable per-thread counting.
    UnableToStartThreadCounting(c_int),
    /// Failed to disable per-thread counting.
    UnableToStopThreadCounting(c_int),
    /// Failed to read thread counters.
    UnableToReadCounters(c_int),
    /// Failed to release force-acquired counters during teardown.
    UnableToResetControl(c_int),
    /// Attempted to sample while counting is not enabled.
    SamplerNotRunning,
}

impl fmt::Display for SamplerError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Load(error) => write!(fmt, "framework load failed: {error}"),
            Self::Framework(error) => fmt::Display::fmt(error, fmt),
            Self::InvalidCpuName => fmt.write_str("PMC database name is not valid UTF-8"),
            Self::UnknownCpu(name) => write!(fmt, "unrecognized CPU: {name}"),
            #[expect(clippy::use_debug)]
            Self::EventUnavailable(event) => {
                write!(fmt, "event {event:?} is unavailable on this CPU")
            }
            Self::EventLayoutMismatch { expected, actual } => {
                write!(
                    fmt,
                    "kpep_event layout mismatch: expected stride {expected}, got {actual}"
                )
            }
            Self::UnexpectedNullPointer => {
                fmt.write_str("framework returned unexpected null pointer")
            }
            Self::MissingPrivileges => {
                fmt.write_str("insufficient privileges to access performance counters")
            }
            Self::FailedToForceAllCounters(code) => {
                write!(fmt, "failed to force-acquire counters (code {code})")
            }
            Self::FailedToSetKpcConfig(code) => {
                write!(fmt, "failed to set KPC config (code {code})")
            }
            Self::UnableToStartCounting(code) => {
                write!(fmt, "failed to start counting (code {code})")
            }
            Self::UnableToStopCounting(code) => {
                write!(fmt, "failed to stop counting (code {code})")
            }
            Self::UnableToStartThreadCounting(code) => {
                write!(fmt, "failed to start thread counting (code {code})")
            }
            Self::UnableToStopThreadCounting(code) => {
                write!(fmt, "failed to stop thread counting (code {code})")
            }
            Self::UnableToReadCounters(code) => {
                write!(fmt, "failed to read thread counters (code {code})")
            }
            Self::UnableToResetControl(code) => {
                write!(fmt, "failed to release counters (code {code})")
            }
            Self::SamplerNotRunning => {
                fmt.write_str("attempted to sample while counting is not enabled")
            }
        }
    }
}

impl error::Error for SamplerError {
    fn source(&self) -> Option<&(dyn error::Error + 'static)> {
        match self {
            Self::Load(err) => Some(err),
            Self::Framework(err) => Some(err),
            Self::InvalidCpuName
            | Self::UnknownCpu(_)
            | Self::EventUnavailable(_)
            | Self::EventLayoutMismatch { .. }
            | Self::UnexpectedNullPointer
            | Self::MissingPrivileges
            | Self::FailedToForceAllCounters(_)
            | Self::FailedToSetKpcConfig(_)
            | Self::UnableToStartCounting(_)
            | Self::UnableToStopCounting(_)
            | Self::UnableToStartThreadCounting(_)
            | Self::UnableToStopThreadCounting(_)
            | Self::UnableToReadCounters(_)
            | Self::UnableToResetControl(_)
            | Self::SamplerNotRunning => None,
        }
    }
}

impl From<LoadError> for SamplerError {
    fn from(value: LoadError) -> Self {
        Self::Load(value)
    }
}

impl From<FrameworkError> for SamplerError {
    fn from(value: FrameworkError) -> Self {
        Self::Framework(value)
    }
}

/// Converts a KPEP return code into a [`Result`], mapping non-zero to
/// [`FrameworkError`].
pub(crate) const fn try_kpep(code: c_int) -> Result<(), FrameworkError> {
    if code == 0 {
        Ok(())
    } else {
        Err(FrameworkError::from_code(code))
    }
}

/// Converts a KPC return code into a [`Result`], using `error` to construct
/// the [`SamplerError`] variant for non-zero codes.
pub(crate) fn try_kpc(code: c_int, error: fn(c_int) -> SamplerError) -> Result<(), SamplerError> {
    if code == 0 { Ok(()) } else { Err(error(code)) }
}
