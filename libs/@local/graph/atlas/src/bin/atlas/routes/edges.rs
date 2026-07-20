//! `POST /v1/atlas/edges/{generation}/{variant}`: the edges among
//! the listed tiles' delivered rows, as `SALTILEE` bytes.

use alloc::sync::Arc;

use aide::transform::TransformOperation;
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use hash_graph_atlas::serve::{EdgesCaps, EdgesError, EdgesRequest, GenerationId};

use super::{
    AppState,
    problem::{Problem, ProblemType, reject_generation, reject_variant},
    saltile::{Saltile, spawn},
};

/// The operation's description.
const DESCRIPTION: &str =
    "Assembles the edges among the nodes delivered for the listed tiles: an edge ships iff BOTH \
     of its endpoints are delivered (the union of the tiles' delivered sets).

The JSON body is required; the manifest's `limits.edgesTiles` caps the tile list. The response is \
     a `SALTILEE` envelope whose three columns (sources, targets, edge row ids) ride ascending by \
     edge row id, independent of the tile list - identical requests yield identical bytes.

When the edge cap truncates the set, the rank-ordered truncation keeps the edges whose worse \
     endpoint ranks best, and the HEAD's `complete` key reads `false`.

Version 0 rejects `filter` and `includeDetailedData` with an `unsupported-feature` problem.";

/// The generation/variant pair addressing one fitted layout.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub(super) struct VariantPath {
    /// The sha256 generation id, as bootstrapped from `current`.
    //
    // A string for the same reason as the manifest route's
    // `generation`: an unparsable id must answer the 404 problem.
    #[schemars(with = "GenerationId")]
    generation: String,
    /// The fitted variant name; the manifest lists what this
    /// generation serves.
    variant: String,
}

/// `POST /v1/atlas/edges/{generation}/{variant}`: the edges among the
/// listed tiles' delivered rows, as `SALTILEE` bytes. The tiles list
/// is the request's subject, so the body is required.
pub(super) async fn handler(
    State(state): State<AppState>,
    Path(VariantPath {
        generation,
        variant,
    }): Path<VariantPath>,
    body: Option<Json<EdgesRequest>>,
) -> Result<Saltile, Problem<'static>> {
    reject_generation(&state, &generation)?;
    reject_variant(&variant)?;

    let Some(Json(request)) = body else {
        return Err(Problem::new(
            StatusCode::BAD_REQUEST,
            ProblemType::MissingBody,
            "an edges request lists its tiles in a JSON body",
        ));
    };

    let atlas = Arc::clone(&state.atlas);
    match spawn(move || atlas.edges(&request, EdgesCaps::default())).await? {
        Ok(bytes) => Ok(Saltile::new(bytes)),
        Err(error @ EdgesError::Tiles { .. }) => Err(Problem::new(
            StatusCode::BAD_REQUEST,
            ProblemType::TooManyTiles,
            error.to_string(),
        )),
        Err(error @ (EdgesError::Depth { .. } | EdgesError::Grid { .. })) => Err(Problem::new(
            StatusCode::BAD_REQUEST,
            ProblemType::InvalidCoordinate,
            error.to_string(),
        )),
        Err(error @ EdgesError::Unsupported(_)) => Err(Problem::new(
            StatusCode::NOT_IMPLEMENTED,
            ProblemType::UnsupportedFeature,
            error.to_string(),
        )),
    }
}

/// Documents the operation.
pub(super) fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("edges")
        .summary("The edges among the listed tiles' delivered rows, as SALTILEE envelope bytes")
        .description(DESCRIPTION)
        .with(|mut operation| {
            if let Some(body) = operation
                .inner_mut()
                .request_body
                .as_mut()
                .and_then(|body| body.as_item_mut())
            {
                body.description =
                    Some("the edges request; the `tiles` list is the request's subject".to_owned());
            }
            operation
        })
        .response_with::<200, Saltile, _>(|response| {
            response
                .description("a `SALTILEE` envelope: the qualifying edges, ascending by edge row")
        })
        .response_with::<400, Problem<'static>, _>(|response| {
            response.description("`too-many-tiles`, `missing-body`, or `invalid-coordinate`")
        })
        .response_with::<404, Problem<'static>, _>(|response| {
            response.description(
                "`unknown-generation` or `unknown-variant`: re-bootstrap through `current`",
            )
        })
        .response_with::<501, Problem<'static>, _>(|response| {
            response.description(
                "`unsupported-feature`: the request names a surface the contract pins but version \
                 0 does not serve",
            )
        })
        .default_response_with::<Problem<'static>, _>(|response| {
            response
                .description("any other problem; `internal` marks a server-side assembly failure")
        })
}
