use alloc::borrow::Cow;
use core::marker::Destruct;

#[cfg(feature = "serde")]
use ::serde::{Deserialize, Serialize};

#[cfg(feature = "serde")]
use crate::serde::{deserialize_optional_cow, serialize_extensions, serialize_status};

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
pub struct ProblemDetails<'a, E = NoExtensions> {
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
        any(feature = "serde", feature = "schemars"),
        serde(serialize_with = "serialize_status")
    )]
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

impl<'a, E> ProblemDetails<'a, E> {
    /// Sets the human-readable explanation of this occurrence.
    ///
    /// # Examples
    ///
    /// Pass a reference to borrow an explanation assembled at runtime:
    ///
    /// ```
    /// use std::borrow::Cow;
    ///
    /// use problematic::{ProblemDetails, ProblemType, StatusCode};
    ///
    /// const INVALID_PARAMETERS: ProblemType = ProblemType {
    ///     type_uri: Cow::Borrowed("https://example.com/problems/invalid-parameters"),
    ///     title: Cow::Borrowed("Invalid parameters"),
    ///     status: StatusCode::BAD_REQUEST,
    /// };
    ///
    /// let parameter = "limit";
    /// let explanation = format!("The {parameter} parameter must be positive.");
    /// let details = ProblemDetails::from(&INVALID_PARAMETERS).detail(&explanation);
    ///
    /// assert_eq!(details.detail.as_deref(), Some(explanation.as_str()));
    /// # core::assert_matches!(details.detail, Some(Cow::Borrowed(_)));
    /// ```
    #[must_use]
    pub const fn detail(mut self, detail: impl [const] Into<Cow<'a, str>>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    /// Sets the URI reference identifying this occurrence.
    ///
    /// # Examples
    ///
    /// Move a URI built at runtime into the occurrence:
    ///
    /// ```
    /// use std::borrow::Cow;
    ///
    /// use problematic::{ProblemDetails, ProblemType, StatusCode};
    ///
    /// const WRONG_ACTOR_TYPE: ProblemType = ProblemType {
    ///     type_uri: Cow::Borrowed("https://example.com/problems/wrong-actor-type"),
    ///     title: Cow::Borrowed("Wrong actor type"),
    ///     status: StatusCode::FORBIDDEN,
    /// };
    ///
    /// let occurrence_id = 42;
    /// let details = ProblemDetails::from(&WRONG_ACTOR_TYPE)
    ///     .instance(format!("/problem-occurrences/{occurrence_id}"));
    ///
    /// assert_eq!(details.instance.as_deref(), Some("/problem-occurrences/42"));
    /// # core::assert_matches!(details.instance, Some(Cow::Owned(_)));
    /// ```
    #[must_use]
    pub const fn instance(mut self, instance: impl [const] Into<Cow<'a, str>>) -> Self {
        self.instance = Some(instance.into());
        self
    }

    /// Replaces the extension members, changing their type.
    ///
    /// # Examples
    ///
    /// Extension members serialize alongside the standard fields:
    ///
    /// ```
    /// use std::borrow::Cow;
    ///
    /// use problematic::{ProblemDetails, ProblemType, StatusCode};
    ///
    /// #[derive(serde::Serialize)]
    /// struct WrongActorType {
    ///     required_actor_type: &'static str,
    /// }
    ///
    /// const WRONG_ACTOR_TYPE: ProblemType = ProblemType {
    ///     type_uri: Cow::Borrowed("https://example.com/problems/wrong-actor-type"),
    ///     title: Cow::Borrowed("Wrong actor type"),
    ///     status: StatusCode::FORBIDDEN,
    /// };
    ///
    /// let details = ProblemDetails::from(&WRONG_ACTOR_TYPE)
    ///     .detail("This operation requires a machine actor.")
    ///     .extensions(WrongActorType {
    ///         required_actor_type: "machine",
    ///     });
    ///
    /// assert_eq!(serde_json::to_value(&details)?, serde_json::json!({
    ///     "type": "https://example.com/problems/wrong-actor-type",
    ///     "title": "Wrong actor type",
    ///     "status": 403,
    ///     "detail": "This operation requires a machine actor.",
    ///     "required_actor_type": "machine"
    /// }));
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    #[must_use]
    pub const fn extensions<F>(self, extensions: F) -> ProblemDetails<'a, F>
    where
        E: [const] Destruct,
    {
        ProblemDetails {
            type_uri: self.type_uri,
            title: self.title,
            status: self.status,
            detail: self.detail,
            instance: self.instance,
            extensions,
        }
    }
}
