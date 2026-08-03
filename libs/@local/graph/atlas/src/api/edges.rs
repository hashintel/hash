//! `POST /v1/atlas/edges/{generation}/{variant}`.
//!
//! The edges among the listed tiles' delivered rows, as `SALTILEE` bytes.

use alloc::sync::Arc;

use aide::transform::TransformOperation;
use axum::{extract::State, http::StatusCode};
use tracing::Instrument as _;

use super::{
    AppState,
    extract::{Body, Generation},
    problem::{Problem, ProblemType, reject_generation, reject_variant},
    saltile::{Saltile, spawn},
    visibility::Visibility,
};
use crate::serve::{EdgesError, EdgesRequest, GenerationId};

/// The operation's description.
const DESCRIPTION: &str =
    "Returns the edges among the points the listed tiles deliver, as a `SALTILEE` binary envelope.

An edge is included exactly when both of its endpoints lie in the union of the listed tiles' \
     delivered sets, so one request listing the whole viewport also returns the edges that cross \
     between its tiles. Delivery is the tile route's level-of-detail delivery, not spatial \
     containment: an edge is absent while either endpoint sits below the listed zoom's cut, and \
     appears once the viewport or zoom reaches that endpoint.

The JSON body is required; the manifest's `limits.edgesTiles` caps the tile list.

The response's three columns - sources, targets, and `EDGE_IDS` (each edge's 32-byte link entity \
     id, web uuid then entity uuid) - are ordered ascending by identity bytes, independent of the \
     tile list's order: identical requests yield identical geometry bytes, and the order is \
     verifiable from the `EDGE_IDS` column alone. Edges have no row id of their own; the entity \
     id is an edge's identity on every route.

When the server's edge cap truncates the set, the response keeps the edges whose worse endpoint \
     ranks best, and the HEAD's `complete` key reads `false`.

`includeDetailedData` adds the detail trailer, read from the store at request time: a sorted \
     type-URL table and, per edge, a label and a first direct type as an integer index into the \
     table.

The `filter` field is reserved: a request that carries one is rejected with `unsupported-feature` \
     rather than answered with bytes that silently ignore it.
";

/// The generation/variant pair addressing one fitted layout.
///
/// Extracted through [`Generation`]: a malformed generation id answers the `invalid-generation`
/// problem before the handler runs.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub(super) struct VariantPath {
    /// The sha256 generation id, as returned by `current`.
    generation: GenerationId,
    /// The fitted variant name.
    ///
    /// The manifest lists what this generation serves.
    variant: String,
}

/// `POST /v1/atlas/edges/{generation}/{variant}`.
///
/// The edges among the listed tiles' delivered rows, as `SALTILEE` bytes. The tiles list is the
/// request's subject, so the route requires the body.
pub(super) async fn handler(
    State(state): State<AppState>,
    visibility: Visibility,
    Generation(VariantPath {
        generation,
        variant,
    }): Generation<VariantPath>,
    Body(request): Body<EdgesRequest>,
) -> Result<Saltile, Problem<'static>> {
    reject_generation(&state, generation)?;
    reject_variant(&variant)?;

    let detailed = request.include_detailed_data;

    // Assembly and encoding are CPU-bound and ride rayon; hydration
    // awaits the store between them - the trailer is the envelope's
    // last section by design, so the columns never wait on Postgres.
    let atlas = Arc::clone(&state.atlas);
    let limits = state.limits.edges;
    let assembled = spawn(move || {
        let view = visibility.view(&atlas)?;

        Ok(atlas
            .assemble_edges(&request, limits, &view)
            .map(|document| {
                let entities = detailed.then(|| atlas.delivered_edge_entities(&document));
                (document, entities)
            }))
    })
    .await??;

    let (document, entities) = match assembled {
        Ok(assembled) => assembled,
        Err(error @ EdgesError::Tiles { .. }) => {
            return Err(Problem::new(
                StatusCode::BAD_REQUEST,
                ProblemType::TooManyTiles,
                error.to_string(),
            ));
        }
        Err(error @ (EdgesError::Depth { .. } | EdgesError::Grid { .. })) => {
            return Err(Problem::new(
                StatusCode::BAD_REQUEST,
                ProblemType::InvalidCoordinate,
                error.to_string(),
            ));
        }
        Err(error @ EdgesError::Unsupported(_)) => {
            return Err(Problem::new(
                StatusCode::NOT_IMPLEMENTED,
                ProblemType::UnsupportedFeature,
                error.to_string(),
            ));
        }
        // Only the self-binding convenience path answers this; the handler binds through
        // `Visibility::view`, which reports a refused cut as the internal problem itself.
        Err(error @ EdgesError::View(_)) => {
            return Err(Problem::internal(
                error,
                "edges delivery refused its schedule",
            ));
        }
    };

    let details = match entities {
        Some(entities) => Some(
            state
                .remote
                .link_details(&entities)
                .in_current_span()
                .await
                .map_err(|error| Problem::internal(error, "the detail hydration failed"))?,
        ),
        None => None,
    };

    let atlas = Arc::clone(&state.atlas);
    let bytes = spawn(move || atlas.encode_edges(&document, details.as_ref())).await?;
    Ok(Saltile::new(bytes))
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
            response.description(
                "a `SALTILEE` envelope: the qualifying edges, ascending by link-entity identity",
            )
        })
        .response_with::<400, Problem<'static>, _>(|response| {
            response.description(
                "`too-many-tiles`, `invalid-generation`, `missing-body`, `invalid-body`, or \
                 `invalid-coordinate`",
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
