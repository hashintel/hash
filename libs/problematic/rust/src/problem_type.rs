use alloc::borrow::Cow;

use crate::StatusCode;

/// Metadata shared by occurrences of a problem type.
///
/// ```
/// use std::borrow::Cow;
///
/// use problematic::{ProblemType, StatusCode};
///
/// const WRONG_ACTOR_TYPE: ProblemType = ProblemType {
///     type_uri: Cow::Borrowed("https://example.com/problems/wrong-actor-type"),
///     title: Cow::Borrowed("Wrong actor type"),
///     status: StatusCode::FORBIDDEN,
/// };
/// ```
#[derive(Debug)]
pub struct ProblemType {
    /// The stable URI identifying this problem type.
    pub type_uri: Cow<'static, str>,
    /// The title shared by occurrences of this problem type.
    pub title: Cow<'static, str>,
    /// The HTTP status code for occurrences of this problem type.
    pub status: StatusCode,
}
