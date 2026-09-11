use alloc::{borrow::Cow, string::String};

use http::StatusCode;
use serde::{Deserialize, Serialize};

/// An empty object for problem types without extensions.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[expect(
    clippy::empty_structs_with_brackets,
    reason = "Serde must emit an object, not null."
)]
pub struct NoExtensions {}

/// Shared metadata for rendering and documenting a problem type.
///
/// Definitions can borrow static text or own values constructed at runtime. Extension types
/// are supplied separately when creating an occurrence or registering its schema.
///
/// ```
/// use std::borrow::Cow;
///
/// use http::StatusCode;
/// use problematic::ProblemType;
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
    /// The HTTP status used for occurrences and their response documentation.
    pub status: StatusCode,
}

/// An RFC 9457 problem details object with problem-specific extension members.
///
/// Responses always include `type`, `title`, and `status`. `detail` and `instance` are included
/// only when supplied.
#[derive(Clone, Serialize, Deserialize)]
#[cfg_attr(
    feature = "schemars",
    derive(schemars::JsonSchema),
    schemars(title = "Problem Details")
)]
pub struct ProblemDetails<E> {
    /// A URI reference identifying the problem type. `about:blank` means the problem has no
    /// additional semantics beyond its HTTP status code.
    #[serde(rename = "type")]
    #[cfg_attr(
        feature = "schemars",
        schemars(
            extend("format" = "uri-reference", "default" = "about:blank"),
            example = "https://example.com/problems/wrong-actor-type"
        )
    )]
    pub type_uri: Cow<'static, str>,

    /// A short, human-readable summary of the problem type. It should remain the same across
    /// occurrences, except for localization.
    #[cfg_attr(feature = "schemars", schemars(example = "Wrong actor type"))]
    pub title: Cow<'static, str>,

    /// The HTTP status code sent by the origin server for this occurrence.
    #[cfg_attr(
        feature = "schemars",
        schemars(range(min = 100, max = 599), example = 403)
    )]
    pub status: u16,

    /// A human-readable explanation of this occurrence that helps the client correct the problem.
    /// Clients should use extension members for structured information.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(
        feature = "schemars",
        schemars(required, example = "This operation requires a machine actor.")
    )]
    pub detail: Option<String>,

    /// A URI reference identifying this occurrence. It may identify the occurrence without
    /// resolving to further information.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(
        feature = "schemars",
        schemars(
            required,
            extend("format" = "uri-reference"),
            example = "https://example.com/problem-occurrences/01J8M6Y7P9"
        )
    )]
    pub instance: Option<String>,

    /// Problem-specific members included alongside the standard fields.
    #[serde(flatten)]
    pub extensions: E,
}
