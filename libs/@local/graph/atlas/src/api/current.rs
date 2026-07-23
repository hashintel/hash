//! `GET /v1/atlas/current`: the one mutable read.

use aide::{axum::IntoApiResponse, transform::TransformOperation};
use axum::{Json, extract::State, http::header};

use super::AppState;
use crate::serve::GenerationId;

/// The operation's description.
const DESCRIPTION: &str = "The generation this process serves, pinned at startup. Re-read it \
                           whenever any route answers an `unknown-generation` problem; every \
                           other route is immutable per generation.";

/// The `current` document: the one mutable read.
#[derive(
    Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, schemars::JsonSchema,
)]
struct CurrentResponse {
    /// The active generation's sha256 identity.
    generation: GenerationId,
}

/// `GET /v1/atlas/current`: the one mutable read.
pub(super) async fn handler(State(state): State<AppState>) -> impl IntoApiResponse {
    (
        [(header::CACHE_CONTROL, "private, no-cache")],
        Json(CurrentResponse {
            generation: state.atlas.generation(),
        }),
    )
}

/// Documents the operation.
pub(super) fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    // NOTE: shouldn't we also document the headers we respond with? or is that not a thing?
    operation
        .id("current")
        .summary("The active generation")
        .description(DESCRIPTION)
        .response_with::<200, Json<CurrentResponse>, _>(|response| {
            response.description("the generation this process serves")
        })
}
