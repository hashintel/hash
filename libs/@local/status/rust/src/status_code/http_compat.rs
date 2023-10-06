use crate::status_code::StatusCode;

impl StatusCode {
    #[must_use]
    pub const fn to_http_code(&self) -> u16 {
        match self {
            Self::Ok => 200,
            Self::FailedPrecondition | Self::InvalidArgument | Self::OutOfRange => 400,
            Self::Unauthenticated => 401,
            Self::PermissionDenied => 403,
            Self::NotFound => 404,
            Self::Aborted | Self::AlreadyExists => 409,
            Self::ResourceExhausted => 429,
            Self::Cancelled => 499,
            Self::Unknown | Self::Internal | Self::DataLoss => 500,
            Self::Unimplemented => 501,
            Self::Unavailable => 503,
            Self::DeadlineExceeded => 504,
        }
    }
}
