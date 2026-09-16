use alloc::borrow::Cow;

#[cfg(feature = "serde")]
use ::serde::{Deserialize, Serialize};

#[cfg(feature = "serde")]
use crate::serde::{deserialize_optional_cow, serialize_extensions};

/// An empty object for problem types without extensions.
#[derive(Debug, Clone, Copy)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "schemars", derive(schemars::JsonSchema))]
#[expect(
    clippy::empty_structs_with_brackets,
    reason = "The empty struct must serialize as an object."
)]
pub struct NoExtensions {}

#[cfg(any(feature = "serde", feature = "schemars"))]
const fn default_type_uri() -> Cow<'static, str> {
    Cow::Borrowed("about:blank")
}

/// An RFC 9457 problem details object with problem-specific extension members.
///
/// Serialization includes `type`, `title`, and `status`, plus `detail` and `instance` when
/// supplied.
#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(
    feature = "schemars",
    derive(schemars::JsonSchema),
    schemars(title = "Problem Details")
)]
pub struct ProblemDetails<'a, E> {
    /// A URI reference identifying the problem type. Use `about:blank` when the HTTP status code
    /// fully describes the problem type. If `type` is omitted during deserialization, it defaults
    /// to `about:blank`.
    #[cfg_attr(
        any(feature = "serde", feature = "schemars"),
        serde(rename = "type", borrow, default = "default_type_uri")
    )]
    #[cfg_attr(
        feature = "schemars",
        schemars(
            extend("format" = "uri-reference"),
            example = "https://example.com/problems/wrong-actor-type"
        )
    )]
    pub type_uri: Cow<'a, str>,

    /// A short, human-readable summary of the problem type. Keep it the same across occurrences,
    /// except for localization.
    #[cfg_attr(any(feature = "serde", feature = "schemars"), serde(borrow))]
    #[cfg_attr(feature = "schemars", schemars(example = "Wrong actor type"))]
    pub title: Cow<'a, str>,

    /// The HTTP status code sent with this occurrence.
    #[cfg_attr(
        feature = "schemars",
        schemars(range(min = 100, max = 599), example = 403)
    )]
    pub status: u16,

    /// A human-readable explanation of this occurrence that helps the client correct the problem.
    /// Use extension members for structured information.
    #[cfg_attr(
        any(feature = "serde", feature = "schemars"),
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "deserialize_optional_cow"
        )
    )]
    #[cfg_attr(
        feature = "schemars",
        schemars(required, example = "This operation requires a machine actor.")
    )]
    pub detail: Option<Cow<'a, str>>,

    /// A URI reference identifying this occurrence. It may identify the occurrence without
    /// resolving to further information.
    #[cfg_attr(
        any(feature = "serde", feature = "schemars"),
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "deserialize_optional_cow"
        )
    )]
    #[cfg_attr(
        feature = "schemars",
        schemars(
            required,
            extend("format" = "uri-reference"),
            example = "https://example.com/problem-occurrences/42"
        )
    )]
    pub instance: Option<Cow<'a, str>>,

    /// Problem-specific members included alongside the standard fields.
    ///
    /// Serialization fails for non-object values or top-level members named `type`, `title`,
    /// `status`, `detail`, or `instance`. Nested members may use these names. Errors from the
    /// extension serializer propagate. The extension type must support Serde flattening for
    /// deserialization.
    #[cfg_attr(
        any(feature = "serde", feature = "schemars"),
        serde(
            flatten,
            serialize_with = "serialize_extensions",
            bound(serialize = "E: Serialize")
        )
    )]
    pub extensions: E,
}
