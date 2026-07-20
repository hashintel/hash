//! `GET /v1/atlas/generation/{generation}/manifest`: immutable
//! configuration-derived bootstrap data.

use aide::{axum::IntoApiResponse, transform::TransformOperation};
use axum::{
    Json,
    extract::{Path, State},
    http::header,
};
use hash_graph_atlas::serve::{GenerationId, Manifest};

use super::{
    AppState,
    problem::{Problem, reject_generation},
};

/// The operation's description.
const DESCRIPTION: &str = "Immutable bootstrap configuration, derived from the generation alone: \
                           the wire version the envelopes speak, the served variants, the bucket \
                           schedule the tile grid follows, the per-request caps, and the \
                           snapshot's decision-time point when the source carried temporal axes. \
                           Cacheable for the generation's lifetime.";

/// The route's path parameters.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub(super) struct GenerationPath {
    /// The sha256 generation id, as bootstrapped from `current`.
    // Extracted as a string, not a `GenerationId`: an unparsable id
    // must reach `reject_generation` and answer the same 404 problem
    // as a foreign id, never a transport-level rejection. The schema
    // still documents the real format.
    #[schemars(with = "GenerationId")]
    generation: String,
}

/// `GET /v1/atlas/generation/{generation}/manifest`: immutable
/// configuration-derived bootstrap data.
pub(super) async fn handler(
    State(state): State<AppState>,
    Path(GenerationPath { generation }): Path<GenerationPath>,
) -> Result<impl IntoApiResponse, Problem<'static>> {
    reject_generation(&state, &generation)?;

    Ok((
        [(
            header::CACHE_CONTROL,
            "private, max-age=31536000, immutable",
        )],
        Json(state.atlas.manifest(state.limits)),
    ))
}

/// Documents the operation.
pub(super) fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("manifest")
        .summary("The generation's bootstrap manifest")
        .description(DESCRIPTION)
        .response_with::<200, Json<Manifest>, _>(|response| {
            response.description("the manifest; immutable, cacheable for the generation's lifetime")
        })
        .response_with::<404, Problem<'static>, _>(|response| {
            response.description("`unknown-generation`: re-bootstrap through `current`")
        })
}
