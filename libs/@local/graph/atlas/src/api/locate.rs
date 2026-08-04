//! `POST /v1/atlas/locate/{generation}/{variant}`.
//!
//! The source entity's ego-graph - its edges and the partners they connect - as `SALTILEL` bytes.

use alloc::sync::Arc;

use aide::transform::TransformOperation;
use axum::{extract::State, http::StatusCode};
use tracing::Instrument as _;

use super::{
    AppState, clause,
    extract::{Body, Generation, VariantPath},
    problem::{Problem, ProblemType, reject_generation, reject_variant},
    saltile::{Saltile, spawn},
    visibility::Visibility,
};
use crate::serve::{LocateError, LocateRequest};

/// The operation's description.
const DESCRIPTION: &str =
    "Returns one entity's ego-graph: the source point, every neighbour it links to, and the edges \
     joining them, as a `SALTILEL` binary envelope.

The JSON body is required and names the source in exactly one of two fields: `entityId` (the \
     upstream `webId~entityUuid` id a search result or deep link carries) or `row` (a row id a \
     tile's `ROW_IDS` column delivered - if you hold one, no translate round trip is needed). A \
     body carrying both or neither answers `invalid-source`. Either field reaches identical \
     geometry bytes for the same source.

The source is delivered first, partners follow ascending by row id, and edges are ordered \
     ascending by link-entity identity bytes (the `EDGE_IDS` column: each edge's 32-byte entity \
     id, web uuid then entity uuid). The manifest's `limits.locateEdges` caps the edge set; under \
     truncation the response keeps the edges whose partners lie nearest the source, the HEAD's \
     `complete` key reads `false`, and a partner whose every edge was truncated is not delivered.

The HEAD also carries the source's first visible zoom and its tile there (the fly-to target), the \
     source's entity id as 32 raw bytes, and two completeness flags: `typeIdsComplete` (the \
     request's `coloredTypeIds` cover every direct type of the source) and `propertiesComplete` \
     (the trailer's source property map is the entity's whole deliverable set - every property no \
     protection withholds). `coloredTypeIds` behaves exactly as on the tile route.

The response always carries the detail trailer, read from the store at request time. Every node \
     carries a label and a first direct type; the source additionally carries its properties, \
     capped by `limits.locateProperties`. Every edge carries a label, its direct types (capped by \
     `limits.locateLinkTypeIds`), and its properties (capped by `limits.locateLinkProperties`), \
     each cap paired with a per-edge completeness flag. Type and property references are integer \
     indexes into the trailer's two sorted URL tables.

A source that does not name a visible node answers `unknown-entity`: nonexistent, inaccessible, \
     unparsable, and out-of-range `row` values are indistinguishable by design.

The `filter` field is reserved: a request that carries one is rejected with `unsupported-feature` \
     rather than answered with bytes that silently ignore it.
";

/// `POST /v1/atlas/locate/{generation}/{variant}`.
///
/// The source's spotlight subgraph, as `SALTILEL` bytes. The source id is the request's subject, so
/// the route requires the body.
pub(super) async fn handler(
    State(state): State<AppState>,
    visibility: Visibility,
    Generation(VariantPath {
        generation,
        variant,
    }): Generation<VariantPath>,
    Body(request): Body<LocateRequest>,
) -> Result<Saltile, Problem<'static>> {
    reject_generation(&state, generation)?;
    reject_variant(&variant)?;

    // Assembly and encoding are CPU-bound and ride rayon; hydration
    // awaits the store between them - the trailer is the envelope's
    // last section by design, so the columns never wait on Postgres.
    let atlas = Arc::clone(&state.atlas);
    let limits = state.limits;
    let assembled = spawn(move || {
        let view = visibility.view(&atlas)?;

        Ok(atlas
            .assemble_locate(&request, limits, &view)
            .map(|document| {
                let entities = (
                    atlas.locate_node_entities(&document),
                    atlas.locate_link_entities(&document),
                );
                (document, entities)
            }))
    })
    .await??;

    let (document, entities) = match assembled {
        Ok(assembled) => assembled,
        Err(error @ LocateError::UnknownEntity) => {
            return Err(Problem::new(
                StatusCode::NOT_FOUND,
                ProblemType::UnknownEntity,
                error.to_string(),
            ));
        }
        Err(error @ LocateError::Types { .. }) => {
            return Err(Problem::new(
                StatusCode::BAD_REQUEST,
                ProblemType::TooManyTypes,
                error.to_string(),
            ));
        }
        Err(error @ LocateError::Source { .. }) => {
            return Err(Problem::new(
                StatusCode::BAD_REQUEST,
                ProblemType::InvalidSource,
                error.to_string(),
            ));
        }
        Err(error @ LocateError::Unsupported(_)) => {
            return Err(Problem::new(
                StatusCode::NOT_IMPLEMENTED,
                ProblemType::UnsupportedFeature,
                error.to_string(),
            ));
        }
    };

    let (nodes, links) = entities;
    let internal =
        |error: crate::serve::DetailError| Problem::internal(error, "the detail hydration failed");
    let node_details = state
        .remote
        .locate_details(&nodes, state.limits.locate.properties)
        .in_current_span()
        .await
        .map_err(internal)?;
    let link_details = state
        .remote
        .locate_link_details(
            &links,
            state.limits.locate.link_type_ids,
            state.limits.locate.link_properties,
        )
        .in_current_span()
        .await
        .map_err(internal)?;

    let atlas = Arc::clone(&state.atlas);
    let bytes = spawn(move || atlas.encode_locate(&document, &node_details, &link_details)).await?;
    Ok(Saltile::new(bytes))
}

/// Documents the operation.
pub(super) fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("locate")
        .summary("The source entity's ego-graph, as SALTILEL envelope bytes")
        .description(DESCRIPTION)
        .with(clause::describe_body(
            "the locate request; exactly one of `entityId` and `row` names the subject",
        ))
        .response_with::<200, Saltile, _>(|response| {
            response.description(
                "a `SALTILEL` envelope: the source first, its linked partners, and the edges \
                 joining them",
            )
        })
        .response_with::<400, Problem<'static>, _>(|response| {
            response.description(
                "`too-many-types`, `invalid-source`, `invalid-generation`, `missing-body`, or \
                 `invalid-body` (a body that is not this operation's JSON shape)",
            )
        })
        .with(clause::unauthorized)
        .response_with::<404, Problem<'static>, _>(|response| {
            response.description(
                "`unknown-generation`, `unknown-variant`, or `unknown-entity` (identical for \
                 nonexistent, inaccessible, unparsable, and out-of-range sources)",
            )
        })
        .with(clause::reserved_filter)
        .with(clause::any_problem)
}
