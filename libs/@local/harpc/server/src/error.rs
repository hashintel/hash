use alloc::borrow::Cow;
use core::{
    error::Error,
    fmt::{self, Display},
};

use harpc_types::{
    error_code::ErrorCode,
    procedure::{ProcedureDescriptor, ProcedureId},
    subsystem::SubsystemDescriptor,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display)]
#[display("subsystem {subsystem} not found")]
pub struct SubsystemNotFound {
    pub subsystem: SubsystemDescriptor,
}

impl Error for SubsystemNotFound {
    fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
        request.provide_value(ErrorCode::SUBSYSTEM_NOT_FOUND);
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display)]
#[display("procedure {procedure} not found in subsystem {subsystem}")]
pub struct ProcedureNotFound {
    pub subsystem: SubsystemDescriptor,

    pub procedure: ProcedureId,
}

impl Error for ProcedureNotFound {
    fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
        request.provide_value(ErrorCode::PROCEDURE_NOT_FOUND);
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Forbidden {
    pub subsystem: SubsystemDescriptor,
    pub procedure: ProcedureDescriptor,

    pub reason: Cow<'static, str>,
}

impl Display for Forbidden {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(
            fmt,
            "forbidden to call {}::{}",
            self.subsystem, self.procedure
        )?;

        if !self.reason.is_empty() {
            write!(fmt, ", reason: {}", self.reason)?;
        }

        Ok(())
    }
}

impl Error for Forbidden {
    fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
        request.provide_value(ErrorCode::FORBIDDEN);
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestExpectedItemCountMismatch {
    min: Option<usize>,
    max: Option<usize>,
}

impl RequestExpectedItemCountMismatch {
    #[must_use]
    pub const fn exactly(expected: usize) -> Self {
        Self {
            min: Some(expected),
            max: Some(expected),
        }
    }

    #[must_use]
    pub const fn at_least(min: usize) -> Self {
        Self {
            min: Some(min),
            max: None,
        }
    }

    #[must_use]
    pub const fn at_most(max: usize) -> Self {
        Self {
            min: None,
            max: Some(max),
        }
    }

    #[must_use]
    pub const fn with_min(mut self, min: usize) -> Self {
        self.min = Some(min);
        self
    }

    #[must_use]
    pub const fn with_max(mut self, max: usize) -> Self {
        self.max = Some(max);
        self
    }
}

impl Display for RequestExpectedItemCountMismatch {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match (self.min, self.max) {
            (Some(min), Some(max)) if min == max => write!(fmt, "expected length of {min}"),
            (Some(min), Some(max)) => write!(fmt, "expected length between {min} and {max}"),
            (Some(min), None) => write!(fmt, "expected length of at least {min}"),
            (None, Some(max)) => write!(fmt, "expected length of at most {max}"),
            (None, None) => fmt.write_str("expected length"),
        }
    }
}

impl Error for RequestExpectedItemCountMismatch {
    fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
        request.provide_value(ErrorCode::REQUEST_EXPECTED_ITEM_COUNT_MISMATCH);
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("unable to delegate request to subsystem implementation")]
pub struct DelegationError;
