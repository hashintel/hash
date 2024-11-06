use core::fmt::{self, Display};

// H-xxxx: error-stack reports are currently not de-serializable, see: <https://github.com/orgs/hashintel/discussions/5352>
#[derive(
    Debug,
    Clone,
    PartialEq,
    Eq,
    serde::Serialize,
    serde::Deserialize,
    derive_more::Display,
    derive_more::Error,
)]
#[display("The remote server has encountered an error: {_0:?}")]
#[must_use]
pub struct RemoteError(#[error(ignore)] serde_value::Value);

impl RemoteError {
    pub const fn new(value: serde_value::Value) -> Self {
        Self(value)
    }
}

impl From<serde_value::Value> for RemoteError {
    fn from(value: serde_value::Value) -> Self {
        Self(value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, derive_more::Error)]
#[must_use]
pub struct ResponseExpectedItemCountMismatch {
    min: Option<usize>,
    max: Option<usize>,
}

impl ResponseExpectedItemCountMismatch {
    pub const fn exactly(expected: usize) -> Self {
        Self {
            min: Some(expected),
            max: Some(expected),
        }
    }

    pub const fn at_least(min: usize) -> Self {
        Self {
            min: Some(min),
            max: None,
        }
    }

    pub const fn at_most(max: usize) -> Self {
        Self {
            min: None,
            max: Some(max),
        }
    }

    pub const fn with_min(mut self, min: usize) -> Self {
        self.min = Some(min);
        self
    }

    pub const fn with_max(mut self, max: usize) -> Self {
        self.max = Some(max);
        self
    }
}

impl Display for ResponseExpectedItemCountMismatch {
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

#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("The client has encountered an error while making a call to the remote server.")]
#[must_use]
pub struct RemoteInvocationError;
