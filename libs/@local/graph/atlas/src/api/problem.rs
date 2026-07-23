//! RFC 9457 problem documents: the error surface of every handler.
//!
//! The `type` member carries Surface v1's stable root-relative URIs, the body ships as
//! `application/problem+json`, and the shared rejections - foreign generation, foreign variant -
//! live here beside the document they produce. Requests the framework's extractors reject before
//! a handler runs - malformed bodies, unparsable paths, wrong content types - answer the
//! framework's plain rejections instead.

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
    /// A surface the contract pins but this build does not serve.
    #[serde(rename = "/problems/atlas/unsupported-feature")]
    UnsupportedFeature,
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
    pub(super) fn internal(source: impl core::fmt::Display, detail: &'static str) -> Self {
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
/// An unparsable id and a foreign id answer the same rejection: both name a generation this process
/// does not serve, and the client's recovery - re-bootstrap through `current` - is identical.
pub(super) fn reject_generation(
    state: &AppState,
    generation: &str,
) -> Result<(), Problem<'static>> {
    let known = generation
        .parse::<GenerationId>()
        .is_ok_and(|id| id == state.atlas.generation());
    if known {
        return Ok(());
    }

    Err(Problem::new(
        StatusCode::NOT_FOUND,
        ProblemType::UnknownGeneration,
        format!("generation {generation} is not served; re-bootstrap via /v1/atlas/current"),
    ))
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

    use super::{Problem, ProblemType};

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
