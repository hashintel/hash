//! The problem variants HASH's services share.

use alloc::borrow::Cow;
use core::fmt;

use http::StatusCode;
use problematic::{ProblemType, ProblemVariant};

/// The `detail` of an internal server error, and its description in the documentation.
const DETAIL: &str = "An internal error prevented the request from completing.";

/// The problem variant for an error that stays internal.
///
/// The client receives `500 Internal Server Error` of type `about:blank`, with a `detail` that says
/// nothing about the error. List it in the [`Problem`](problematic::Problem) of an endpoint whose
/// errors can stay internal, and answer with it through [`Answer::new`](problematic::Answer::new).
#[derive(Debug, Clone, Copy, serde::Serialize, schemars::JsonSchema)]
#[schemars(description = DETAIL)]
pub struct InternalServerError;

impl fmt::Display for InternalServerError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(DETAIL)
    }
}

impl ProblemVariant for InternalServerError {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Internal Server Error"),
        status: StatusCode::INTERNAL_SERVER_ERROR,
    };

    fn example() -> Option<Self> {
        Some(Self)
    }
}
