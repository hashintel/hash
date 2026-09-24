use alloc::borrow::Cow;
use core::marker::Destruct;

use ::serde::{Deserialize, Serialize};

use crate::{
    StatusCode,
    serde::{deserialize_optional_cow, deserialize_status, serialize_extensions, serialize_status},
};

const fn default_type_uri() -> Cow<'static, str> {
    Cow::Borrowed("about:blank")
}

/// An integer without bounds: each documented response fixes the status as a constant.
fn status_schema(_generator: &mut schemars::SchemaGenerator) -> schemars::Schema {
    schemars::json_schema!({ "type": "integer" })
}

/// An RFC 9457 problem details object with problem-specific extension members.
///
/// Serialization includes `type`, `title`, and `status`, plus `detail` and `instance` when
/// supplied.
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[schemars(title = "Problem Details")]
pub struct ProblemDetails<'a, E = ()> {
    /// A URI reference identifying the problem type. Use `about:blank` when the HTTP status code
    /// fully describes the problem type. If `type` is omitted during deserialization, it defaults
    /// to `about:blank`.
    #[serde(rename = "type", borrow, default = "default_type_uri")]
    #[schemars(extend("format" = "uri-reference"))]
    pub type_uri: Cow<'a, str>,

    /// A short, human-readable summary of the problem type. Keep it the same across occurrences,
    /// except for localization.
    #[serde(borrow)]
    pub title: Cow<'a, str>,

    /// The HTTP status code sent with this occurrence.
    #[serde(
        serialize_with = "serialize_status",
        deserialize_with = "deserialize_status"
    )]
    #[schemars(schema_with = "status_schema")]
    pub status: StatusCode,

    /// A human-readable explanation of this occurrence that helps the client correct the problem.
    /// Use extension members for structured information.
    #[serde(
        borrow,
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_optional_cow"
    )]
    #[schemars(required)]
    pub detail: Option<Cow<'a, str>>,

    /// A URI reference identifying this occurrence. It may identify the occurrence without
    /// resolving to further information.
    #[serde(
        borrow,
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_optional_cow"
    )]
    #[schemars(required, extend("format" = "uri-reference"))]
    pub instance: Option<Cow<'a, str>>,

    /// Problem-specific members included alongside the standard fields.
    ///
    /// Serialization fails for values other than an object, a unit or `None`, and for top-level
    /// members named `type`, `title`, `status`, `detail`, or `instance`. Nested members may use
    /// these names. Errors from the
    /// extension serializer propagate. The extension type must support Serde flattening for
    /// deserialization.
    #[serde(
        flatten,
        serialize_with = "serialize_extensions",
        bound(serialize = "E: Serialize")
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
