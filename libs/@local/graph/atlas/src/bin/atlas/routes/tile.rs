//! `POST /v1/atlas/tile/{generation}/{variant}/{z}/{x}/{y}`: one
//! tile as `SALTILET` bytes.

use alloc::sync::Arc;

use aide::transform::TransformOperation;
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use hash_graph_atlas::serve::{GenerationId, TileCoordinate, TileError, TileQuery, TileRequest};

use super::{
    AppState,
    problem::{Problem, ProblemType, reject_generation, reject_variant},
    saltile::{Saltile, spawn},
};

/// The operation's description.
const DESCRIPTION: &str = "Assembles the tile at `z/x/y` for the requested delivery context.

The JSON body is optional; an absent body reads as the all-defaults query. `mode` selects `delta` \
                           (the tile's own bucket cut - the default) or `total` (ancestor buckets \
                           accumulated, so the tile stands alone).

The response is a `SALTILET` envelope: positions, row ids, the type mask, and the children bitmap, \
                           plus a detail trailer when requested.

Version 0 rejects `filter` and `includeDetailedData` with an `unsupported-feature` problem.";

/// The tile address: a fitted layout plus the `z/x/y` grid cell.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub(super) struct TilePath {
    /// The sha256 generation id, as bootstrapped from `current`.
    //
    // A string for the same reason as the manifest route's
    // `generation`: an unparsable id must answer the 404 problem.
    #[schemars(with = "GenerationId")]
    generation: String,
    /// The fitted variant name; the manifest lists what this
    /// generation serves.
    variant: String,
    /// The zoom: a subdivision depth; `0` addresses the root.
    z: u8,
    /// The cell's `x` index on the `2^z` grid.
    x: u32,
    /// The cell's `y` index on the `2^z` grid.
    y: u32,
}

/// `POST /v1/atlas/tile/{generation}/{variant}/{z}/{x}/{y}`: one tile
/// as `SALTILET` bytes. An absent body reads as the all-defaults
/// query.
pub(super) async fn handler(
    State(state): State<AppState>,
    Path(TilePath {
        generation,
        variant,
        z,
        x,
        y,
    }): Path<TilePath>,
    query: Option<Json<TileQuery>>,
) -> Result<Saltile, Problem<'static>> {
    reject_generation(&state, &generation)?;
    reject_variant(&variant)?;

    let request = TileRequest {
        coordinate: TileCoordinate { z, x, y },
        query: query.map_or_else(TileQuery::default, |Json(query)| query),
    };

    let atlas = Arc::clone(&state.atlas);
    match spawn(move || atlas.tile(&request)).await? {
        Ok(bytes) => Ok(Saltile::new(bytes)),
        Err(error @ (TileError::Depth { .. } | TileError::Grid { .. })) => Err(Problem::new(
            StatusCode::BAD_REQUEST,
            ProblemType::InvalidCoordinate,
            error.to_string(),
        )),
        Err(error @ TileError::Unsupported(_)) => Err(Problem::new(
            StatusCode::NOT_IMPLEMENTED,
            ProblemType::UnsupportedFeature,
            error.to_string(),
        )),
    }
}

/// Documents the operation.
pub(super) fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("tile")
        .summary("One tile as SALTILET envelope bytes")
        .description(DESCRIPTION)
        .with(|mut operation| {
            // `Option<Json<...>>` documents as a required body; the
            // tile body is not.
            if let Some(body) = operation
                .inner_mut()
                .request_body
                .as_mut()
                .and_then(|body| body.as_item_mut())
            {
                body.required = false;
                body.description =
                    Some("the query context; absent reads as the all-defaults query".to_owned());
            }
            operation
        })
        .response_with::<200, Saltile, _>(|response| {
            response.description("a `SALTILET` envelope: the tile's delivered geometry")
        })
        .response_with::<400, Problem<'static>, _>(|response| {
            response.description(
                "`invalid-coordinate`: the zoom exceeds the deepest cut, or `x`/`y` fall off the \
                 `2^z` grid",
            )
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
