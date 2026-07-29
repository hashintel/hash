//! `GET /v1/atlas/generation/{generation}/manifest`.
//!
//! Immutable bootstrap data: configuration and snapshot provenance, no corpus-derived aggregates.

use aide::{axum::IntoApiResponse, transform::TransformOperation};
use axum::{Json, extract::State, http::header};

use super::{
    AppState,
    extract::Generation,
    headers,
    problem::{Problem, reject_generation},
    visibility::Visibility,
};
use crate::serve::{GenerationId, Manifest};

/// The operation's description.
const DESCRIPTION: &str = "Returns the bootstrap document for one generation: everything a client \
                           needs before its first tile.

The wire version the binary envelopes speak, the served variant names, the bucket schedule the \
                           tile grid follows, the serving limits the handlers enforce, and the \
                           snapshot's decision-time point when the source data carried one. The \
                           document is immutable: cache it for as long as you hold the generation.";

/// The route's path parameters.
///
/// Extracted through [`Generation`]: a malformed generation id answers the `invalid-generation`
/// problem before the handler runs.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub(super) struct GenerationPath {
    /// The sha256 generation id, as returned by `current`.
    generation: GenerationId,
}

/// `GET /v1/atlas/generation/{generation}/manifest`.
///
/// Immutable bootstrap data: configuration and snapshot provenance, no corpus-derived aggregates.
///
/// The document is the same for every caller, and fetching it resolves the caller's scope: a client
/// bootstraps here, so the resolution lands on the request that expects to wait rather than on the
/// first tile.
pub(super) async fn handler(
    State(state): State<AppState>,
    _visibility: Visibility,
    Generation(GenerationPath { generation }): Generation<GenerationPath>,
) -> Result<impl IntoApiResponse, Problem<'static>> {
    reject_generation(&state, generation)?;

    Ok((
        [(header::CACHE_CONTROL, headers::IMMUTABLE)],
        Json(state.atlas.manifest(state.limits.manifest_limits())),
    ))
}

/// Documents the operation.
pub(super) fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("manifest")
        .summary("The generation's bootstrap manifest")
        .description(DESCRIPTION)
        .response_with::<200, Json<Manifest>, _>(|mut response| {
            response.inner().headers.insert(
                "Cache-Control".to_owned(),
                headers::cache_control(
                    headers::IMMUTABLE,
                    "the generation id in the path names frozen bytes",
                ),
            );
            response.description("the manifest; immutable, cacheable for the generation's lifetime")
        })
        .response_with::<400, Problem<'static>, _>(|response| {
            response.description("`invalid-generation`: a malformed generation id")
        })
        .response_with::<404, Problem<'static>, _>(|response| {
            response.description("`unknown-generation`: re-read `current` and retry")
        })
}
