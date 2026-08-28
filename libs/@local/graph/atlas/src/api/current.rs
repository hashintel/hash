//! `GET /v1/atlas/current`: the one mutable read.

use aide::{axum::IntoApiResponse, transform::TransformOperation};
use axum::{Json, extract::State, http::header};

use super::{AppState, headers};
use crate::file::generation::GenerationId;

/// The operation's description.
const DESCRIPTION: &str = "Returns the generation this server serves, pinned at startup.

Every other route's geometry and configuration are pinned per generation. Detail provenance varies \
                           by route: tile detail is generation-local, while edges and locate \
                           combine generation payloads with request-time store state. This \
                           pointer is the only generation read that changes. Re-read it whenever \
                           any route answers `unknown-generation`, then retry against the \
                           returned generation.";

/// The `current` document: the one mutable read.
#[derive(
    Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, schemars::JsonSchema,
)]
struct CurrentResponse {
    /// The active generation's sha256 identity.
    generation: GenerationId,
}

/// `GET /v1/atlas/current`: the one mutable read.
pub(super) async fn handler<R>(State(state): State<AppState<R>>) -> impl IntoApiResponse {
    (
        [(header::CACHE_CONTROL, headers::REVALIDATE)],
        Json(CurrentResponse {
            generation: state.atlas.generation(),
        }),
    )
}

/// Documents the operation.
pub(super) fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("current")
        .summary("The active generation")
        .description(DESCRIPTION)
        .response_with::<200, Json<CurrentResponse>, _>(|mut response| {
            response.inner().headers.insert(
                "Cache-Control".to_owned(),
                headers::cache_control(
                    headers::REVALIDATE,
                    "the one mutable read revalidates on every use - a stale pointer is exactly \
                     the failure this route exists to prevent",
                ),
            );
            response.description("the generation this process serves")
        })
}
