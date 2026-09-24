//! `GET /v1/atlas/current`: the generation currently promoted for new requests.

use aide::transform::TransformOperation;
use axum::{
    Json,
    extract::State,
    http::{HeaderValue, header},
    response::{IntoResponse as _, Response},
};

use super::{AppState, headers, problem::Problem, saltile::DocumentResponse};
use crate::serve::document::{CurrentDocument, Document as _};

/// Answers with the generation currently promoted for new requests.
///
/// Serves `GET /v1/atlas/current`.
///
/// # Errors
///
/// Answers `visibility-unavailable` (503) before initial publication and after admission closes,
/// and `internal` where the one-field document fails to serialize.
pub(super) async fn handler<R>(
    State(state): State<AppState<R>>,
) -> Result<Response, Problem<'static>> {
    let observation = state.registry.observe(None)?;

    let document = CurrentDocument::new(observation.present().epoch().generation());
    let mut bytes = Vec::new();
    let envelope = document
        .encode(&mut bytes)
        .map_err(|error| Problem::internal(&error, "encoding the current generation failed"))?;

    let mut response = DocumentResponse::new(bytes, envelope.content_type()).into_response();
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static(headers::REVALIDATE),
    );
    Ok(response)
}

/// Documents the operation.
pub(super) fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("current")
        .summary("The active generation")
        .description(
            "Returns the successfully initialized generation currently promoted for new requests. \
             Re-read this pointer after an unknown-generation response. Before initial \
             publication, or after admission closes, the request answers 503.",
        )
        .response_with::<200, Json<CurrentDocument>, _>(|mut response| {
            response.inner().headers.insert(
                "Cache-Control".to_owned(),
                headers::cache_control(
                    headers::REVALIDATE,
                    "the promoted generation can change between requests",
                ),
            );
            response.description("the generation this process serves")
        })
        .response_with::<503, Problem<'static>, _>(|response| {
            response.description("no generation is ready to serve requests")
        })
}
