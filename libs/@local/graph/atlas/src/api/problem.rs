//! RFC 9457 problem documents: the error surface of every handler.
//!
//! The `type` member carries Surface v1's stable root-relative URIs, the body ships as
//! `application/problem+json`, and the shared rejections - foreign generation, foreign variant -
//! live here beside the document they produce. Requests that fail before a handler runs -
//! malformed bodies, wrong content types, unparsable tile addresses - route through
//! [`super::extract`]'s wrappers and answer problem documents too; only the router's own
//! rejections (an unmatched route, a wrong method) stay plain.

use alloc::borrow::Cow;

use aide::{OperationOutput, generate::GenContext, openapi};
use axum::{
    Json,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};

use super::AppState;
use crate::serve::{GenerationId, VARIANTS};

/// The `type` member of one problem document: Surface v1's stable root-relative URIs.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, schemars::JsonSchema)]
pub(super) enum ProblemType {
    /// A producer bug surfacing as a 500: the assembly panicked or its worker vanished.
    #[serde(rename = "/problems/atlas/internal")]
    InternalError,
    /// The route names a generation this process does not serve.
    #[serde(rename = "/problems/atlas/unknown-generation")]
    UnknownGeneration,
    /// The route names a variant outside the manifest's list.
    #[serde(rename = "/problems/atlas/unknown-variant")]
    UnknownVariant,
    /// A tile coordinate outside the zoom range or off its grid.
    #[serde(rename = "/problems/atlas/invalid-coordinate")]
    InvalidCoordinate,
    /// A generation path segment that is not a sha256 generation id.
    #[serde(rename = "/problems/atlas/invalid-generation")]
    InvalidGeneration,
    /// A surface the contract pins but this build does not serve.
    #[serde(rename = "/problems/atlas/unsupported-feature")]
    UnsupportedFeature,
    /// A surface outside the reach of the caller's scope.
    #[serde(rename = "/problems/atlas/unavailable-in-scope")]
    UnavailableInScope,
    /// An edges body listing more tiles than the manifest's cap.
    #[serde(rename = "/problems/atlas/too-many-tiles")]
    TooManyTiles,
    /// A tile body carrying more `coloredTypeIds` than the manifest's cap.
    #[serde(rename = "/problems/atlas/too-many-types")]
    TooManyTypes,
    /// A translate body listing more entity ids than the manifest's cap.
    #[serde(rename = "/problems/atlas/too-many-entity-ids")]
    TooManyEntityIds,
    /// A locate source id that does not name a visible node.
    ///
    /// Nonexistent, denied, and unparsable answer identically (missing = denied).
    #[serde(rename = "/problems/atlas/unknown-entity")]
    UnknownEntity,
    /// A locate body that does not name exactly one source: `entityId` XOR `row`.
    #[serde(rename = "/problems/atlas/invalid-source")]
    InvalidSource,
    /// A required request body that did not arrive.
    #[serde(rename = "/problems/atlas/missing-body")]
    MissingBody,
    /// A request body that is not the operation's JSON: wrong content type, syntax error, shape
    /// mismatch, or oversize.
    #[serde(rename = "/problems/atlas/invalid-body")]
    InvalidBody,
}

/// One RFC 9457 problem document.
#[derive(Debug, serde::Serialize, schemars::JsonSchema)]
pub(super) struct Problem<'content> {
    r#type: ProblemType,
    title: Cow<'content, str>,
    #[serde(serialize_with = "status_as_u16")]
    #[schemars(with = "u16")]
    status: StatusCode,
    detail: Cow<'content, str>,
}

/// Serializes the problem's `status` member as its integer form.
#[expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "serde's serialize_with contract passes fields by reference"
)]
fn status_as_u16<S: serde::Serializer>(
    status: &StatusCode,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    serializer.serialize_u16(status.as_u16())
}

impl<'content> Problem<'content> {
    pub(super) fn new(
        status: StatusCode,
        r#type: ProblemType,
        detail: impl Into<Cow<'content, str>>,
    ) -> Self {
        Self {
            r#type,
            title: Cow::Borrowed(status.canonical_reason().unwrap_or("error")),
            status,
            detail: detail.into(),
        }
    }

    /// A 500 whose source stays in the server log.
    ///
    /// The document carries only the static `detail`; `source` is recorded at
    /// error level. Driver errors and panic payloads are log material and
    /// never reach a client.
    pub(super) fn internal(
        source: impl core::fmt::Display,
        detail: impl Into<Cow<'content, str>>,
    ) -> Self {
        let detail = detail.into();
        tracing::error!(source = %source, "{detail}");
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            ProblemType::InternalError,
            detail,
        )
    }
}

impl IntoResponse for Problem<'_> {
    fn into_response(self) -> Response {
        (
            self.status,
            [(header::CONTENT_TYPE, "application/problem+json")],
            Json(self),
        )
            .into_response()
    }
}

impl OperationOutput for Problem<'_> {
    type Inner = Self;

    fn operation_response(
        ctx: &mut GenContext,
        _operation: &mut openapi::Operation,
    ) -> Option<openapi::Response> {
        let json_schema = ctx.schema.subschema_for::<Problem<'static>>();
        let mut response = openapi::Response {
            description: "an RFC 9457 problem document".into(),
            ..Default::default()
        };
        response.content.insert(
            "application/problem+json".into(),
            openapi::MediaType {
                schema: Some(openapi::SchemaObject {
                    json_schema,
                    example: None,
                    external_docs: None,
                }),
                ..Default::default()
            },
        );

        Some(response)
    }

    fn inferred_responses(
        ctx: &mut GenContext,
        operation: &mut openapi::Operation,
    ) -> Vec<(Option<openapi::StatusCode>, openapi::Response)> {
        // The default response: a problem carries its own status.
        Self::operation_response(ctx, operation)
            .map(|response| vec![(None, response)])
            .unwrap_or_default()
    }
}

/// Rejects a route whose generation echo does not name the pinned generation.
///
/// A well-formed id names a resource, so an id this process does not serve is a 404; the
/// client's recovery is to re-read `current` and retry. A malformed id never reaches here - the
/// path extractor answers `invalid-generation` (400) first.
pub(super) fn reject_generation(
    state: &AppState,
    generation: GenerationId,
) -> Result<(), Problem<'static>> {
    if generation == state.atlas.generation() {
        return Ok(());
    }

    Err(Problem::new(
        StatusCode::NOT_FOUND,
        ProblemType::UnknownGeneration,
        format!("generation {generation} is not served; re-read /v1/atlas/current and retry"),
    ))
}

/// The problem a link-bearing surface answers outside the reach of the bound scope.
///
/// The refusal itself is the serving layer's: [`Atlas::assemble_edges`] and
/// [`Atlas::assemble_locate`] take the reach as an argument and answer `OutOfScope` before they
/// read the request, so this function decides nothing - it maps that answer onto the transport's
/// vocabulary, and the handlers' rejection order is the serving layer's rejection order.
///
/// The status is the 404 an unregistered route answers, so a deployment that refuses a surface by
/// scope and one that omits it from the route table are answered alike; the `type` member names
/// the scope as the ground.
///
/// [`Atlas::assemble_edges`]: crate::serve::Atlas::assemble_edges
/// [`Atlas::assemble_locate`]: crate::serve::Atlas::assemble_locate
pub(super) fn out_of_scope() -> Problem<'static> {
    Problem::new(
        StatusCode::NOT_FOUND,
        ProblemType::UnavailableInScope,
        "this surface is not served in the caller's scope",
    )
}

/// Rejects a route naming a variant this generation does not serve.
pub(super) fn reject_variant(variant: &str) -> Result<(), Problem<'static>> {
    if VARIANTS.contains(&variant) {
        return Ok(());
    }

    Err(Problem::new(
        StatusCode::NOT_FOUND,
        ProblemType::UnknownVariant,
        format!("variant {variant} is not served; the manifest lists {VARIANTS:?}"),
    ))
}

#[cfg(test)]
mod tests {
    use axum::http::StatusCode;

    use super::{Problem, ProblemType, out_of_scope};

    #[test]
    fn the_type_member_is_a_root_relative_uri() {
        let problem = Problem::new(
            StatusCode::NOT_FOUND,
            ProblemType::UnknownGeneration,
            "re-bootstrap via /v1/atlas/current",
        );
        let document = serde_json::to_value(&problem).expect("problem documents serialize");

        assert_eq!(document["type"], "/problems/atlas/unknown-generation");
        assert_eq!(document["status"], 404);
    }

    /// The serving layer's out-of-scope answer maps onto the status an absent route answers.
    ///
    /// Which scopes reach which surfaces is the serving layer's statement and is witnessed there;
    /// this pins the transport's half of it - the status and the type member a refused caller
    /// reads.
    #[test]
    fn an_out_of_scope_surface_refuses_with_a_404_problem() {
        let document = serde_json::to_value(out_of_scope()).expect("problem documents serialize");

        assert_eq!(document["type"], "/problems/atlas/unavailable-in-scope");
        assert_eq!(document["status"], 404);
    }

    #[test]
    fn internal_problems_redact_their_source() {
        let problem = Problem::internal(
            "connection refused: db=secret host=10.0.0.7",
            "the detail hydration failed",
        );
        let document = serde_json::to_value(&problem).expect("problem documents serialize");

        assert_eq!(document["type"], "/problems/atlas/internal");
        assert_eq!(document["detail"], "the detail hydration failed");
        assert!(
            !document.to_string().contains("10.0.0.7"),
            "the source error must stay out of the document"
        );
    }
}
