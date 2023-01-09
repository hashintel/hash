use crate::status_code::StatusCode;

impl StatusCode {
    pub fn to_http_code(&self) -> u16 {
        match self {
            StatusCode::Ok => 200,
            StatusCode::Cancelled => 499,
            StatusCode::Unknown => 500,
            StatusCode::InvalidArgument => 400,
            StatusCode::DeadlineExceeded => 504,
            StatusCode::NotFound => 404,
            StatusCode::AlreadyExists => 409,
            StatusCode::PermissionDenied => 403,
            StatusCode::Unauthenticated => 401,
            StatusCode::ResourceExhausted => 429,
            StatusCode::FailedPrecondition => 400,
            StatusCode::Aborted => 409,
            StatusCode::OutOfRange => 400,
            StatusCode::Unimplemented => 501,
            StatusCode::Internal => 500,
            StatusCode::Unavailable => 503,
            StatusCode::DataLoss => 500,
        }
    }
}
