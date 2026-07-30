//! `POST /v1/atlas/tile/{generation}/{variant}/{z}/{x}/{y}`: one tile as `SALTILET` bytes.

use alloc::sync::Arc;

use aide::transform::TransformOperation;
use axum::{extract::State, http::StatusCode};
use tracing::Instrument as _;

use super::{
    AppState,
    extract::{Body, Coordinates, Generation},
    problem::{Problem, ProblemType, reject_generation, reject_variant},
    saltile::{Saltile, spawn},
    visibility::Visibility,
};
use crate::serve::{GenerationId, TileCoordinate, TileError, TileQuery, TileRequest};

/// The operation's description.
const DESCRIPTION: &str =
    "Returns one tile of the map: the points the generation's level-of-detail schedule delivers \
     at `z/x/y`, as a `SALTILET` binary envelope of positions, row ids, the optional type mask, \
     and the children bitmap.

The JSON body is optional; an absent body reads as the all-defaults query. `mode` selects `delta` \
     (this tile's own additions - the default) or `total` (every ancestor's delivery accumulated, \
     so the tile renders alone).

`coloredTypeIds` lists versioned type URLs and adds the `TYPE_MASK` column: bit `i` of a point's \
     mask is 1 exactly when the point carries the request's type `i` or one of its descendants. \
     An id that matches no type in this generation is legal and reads 0 in every mask. The \
     manifest's `limits.coloredTypeIds` caps the list.

`includeDetailedData` adds the detail trailer - per-point labels and icons, read from the store at \
     request time. Geometry sections are immutable per generation; the trailer is not, so cache \
     geometry and refetch detail.

The `filter` field is reserved: a request that carries one is rejected with `unsupported-feature` \
     rather than answered with bytes that silently ignore it.";

/// The generation/variant pair addressing one fitted layout.
///
/// Extracted through [`Generation`]: a malformed generation id answers the `invalid-generation`
/// problem before the handler runs.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub(super) struct VariantPath {
    /// The sha256 generation id, as returned by `current`.
    generation: GenerationId,
    /// The fitted variant name; the manifest lists what this generation serves.
    variant: String,
}

/// The `z/x/y` grid cell.
///
/// Extracted through [`Coordinates`]: an unparsable numeric segment answers the
/// `invalid-coordinate` problem, the same slug an out-of-range address earns from assembly.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub(super) struct CellPath {
    /// The zoom: a subdivision depth; `0` addresses the root.
    z: u8,
    /// The cell's `x` index on the `2^z` grid.
    x: u32,
    /// The cell's `y` index on the `2^z` grid.
    y: u32,
}

/// `POST /v1/atlas/tile/{generation}/{variant}/{z}/{x}/{y}`: one tile as `SALTILET` bytes.
///
/// An absent body reads as the all-defaults query.
pub(super) async fn handler(
    State(state): State<AppState>,
    visibility: Visibility,
    Generation(VariantPath {
        generation,
        variant,
    }): Generation<VariantPath>,
    Coordinates(CellPath { z, x, y }): Coordinates<CellPath>,
    query: Option<Body<TileQuery>>,
) -> Result<Saltile, Problem<'static>> {
    reject_generation(&state, generation)?;
    reject_variant(&variant)?;

    let request = TileRequest {
        coordinate: TileCoordinate { z, x, y },
        query: query.map_or_else(TileQuery::default, |Body(query)| query),
    };

    let detailed = request.query.include_detailed_data;

    // Assembly and encoding are CPU-bound and ride rayon; hydration
    // awaits the store between them - the trailer is the envelope's
    // last section by design, so geometry never waits on Postgres.
    let atlas = Arc::clone(&state.atlas);
    let limits = state.limits.tile;
    let proof = visibility.proof;
    let census = visibility.census;

    let assembled = spawn(move || {
        atlas
            .assemble_tile(&request, limits, &proof, census)
            .map(|document| {
                let entities = detailed.then(|| atlas.delivered_entities(&document));
                (document, entities)
            })
    })
    .await?;

    let (document, entities) = match assembled {
        Ok(assembled) => assembled,
        Err(error @ TileError::Types { .. }) => {
            return Err(Problem::new(
                StatusCode::BAD_REQUEST,
                ProblemType::TooManyTypes,
                error.to_string(),
            ));
        }
        Err(error @ (TileError::Depth { .. } | TileError::Grid { .. })) => {
            return Err(Problem::new(
                StatusCode::BAD_REQUEST,
                ProblemType::InvalidCoordinate,
                error.to_string(),
            ));
        }
        Err(error @ TileError::Unsupported(_)) => {
            return Err(Problem::new(
                StatusCode::NOT_IMPLEMENTED,
                ProblemType::UnsupportedFeature,
                error.to_string(),
            ));
        }
    };

    let details = match entities {
        Some(entities) => Some(
            state
                .remote
                .labels_and_icons(&entities)
                .in_current_span()
                .await
                .map_err(|error| Problem::internal(error, "the detail hydration failed"))?,
        ),
        None => None,
    };

    let atlas = Arc::clone(&state.atlas);
    let bytes = spawn(move || atlas.encode_tile(&document, details.as_ref())).await?;

    Ok(Saltile::new(bytes))
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
                "`invalid-coordinate` (an unparsable `z`/`x`/`y` segment, a zoom past the deepest \
                 cut, or `x`/`y` off the `2^z` grid), `invalid-generation` (a malformed \
                 generation id), `too-many-types` (`coloredTypeIds` exceeds the manifest's cap), \
                 or `invalid-body` (a body that is not this operation's JSON shape)",
            )
        })
        .response_with::<401, Problem<'static>, _>(|response| {
            response.description("`unauthorized`: no valid authority token; re-fetch the manifest")
        })
        .response_with::<404, Problem<'static>, _>(|response| {
            response.description(
                "`unknown-generation` or `unknown-variant`: re-read `current` and retry",
            )
        })
        .response_with::<501, Problem<'static>, _>(|response| {
            response.description(
                "`unsupported-feature`: the request carries a reserved field (`filter`) this \
                 server does not yet serve",
            )
        })
        .default_response_with::<Problem<'static>, _>(|response| {
            response
                .description("any other problem document; `internal` marks a server-side failure")
        })
}
