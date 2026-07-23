//! `POST /v1/atlas/locate/{generation}/{variant}`.
//!
//! The source entity's ego-graph - its edges and the partners they connect - as `SALTILEL` bytes.

use alloc::sync::Arc;

use aide::transform::TransformOperation;
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use tracing::Instrument as _;

use super::{
    AppState,
    problem::{Problem, ProblemType, reject_generation, reject_variant},
    saltile::{Saltile, spawn},
};
use crate::serve::{GenerationId, LocateError, LocateRequest};

/// The operation's description.
const DESCRIPTION: &str =
    "Spotlights one entity's ego-graph: resolves the source to its dot, delivers it first with \
     every linked partner ascending by node row id, and rides the source's edges - both \
     directions - ascending by link-entity identity bytes (the `EDGE_IDS` column; edges carry no \
     wire id of their own).

The JSON body is required and names the source in EXACTLY ONE of two domains: `entityId` (the \
     upstream id a search result or deep link carries) XOR `row` (the wire node row id a rendered \
     tile delivered in `ROW_IDS` - the natural click-to-spotlight loop, no translate detour). A \
     body carrying both or neither answers `invalid-source` (400). The same source yields \
     identical geometry sections through either domain; the detail trailer reflects live store \
     state at hydration.

The edge set caps at `limits.locateEdges`; truncation keeps the edges whose partners lie nearest \
     the source, the HEAD's `complete` key reads `false`, and a partner whose every edge \
     truncated is not delivered.

The HEAD carries the source's first visible zoom and its tile there - the client's fly-to target - \
     the source's upstream entity id as 32 raw bytes (web uuid then entity uuid), and the \
     source's two completeness flags: `typeIdsComplete` (the request's `coloredTypeIds` cover \
     every direct type of the source) and `propertiesComplete` (the trailer's source property map \
     is the entity's whole set). `coloredTypeIds` rides `TYPE_MASK` exactly as on tiles.

Locate IS the detail view: the trailer always rides, hydrated LIVE from the store. Nodes carry a \
     label and a first direct type reference; the source additionally carries its capped \
     simple-value properties (`limits.locateProperties`). Edges carry a label, their direct types \
     capped at `limits.locateLinkTypeIds`, and their capped simple-value properties \
     (`limits.locateLinkProperties`), each cap paired with a per-edge completeness flag. Every \
     type and property reference is a uint index into the trailer's interned URL tables - the \
     client resolves display through its own type metadata.

A source that does not name a visible node answers `unknown-entity` (404): nonexistent, denied, \
     unparsable, and out-of-universe `row` values are identical - missing = denied.

Version 0 rejects `filter` with an `unsupported-feature` problem.";

/// The generation/variant pair addressing one fitted layout.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub(super) struct VariantPath {
    /// The sha256 generation id, as bootstrapped from `current`.
    //
    // A string for the same reason as the manifest route's
    // `generation`: an unparsable id must answer the 404 problem.
    #[schemars(with = "GenerationId")]
    generation: String,
    /// The fitted variant name; the manifest lists what this generation serves.
    variant: String,
}

/// `POST /v1/atlas/locate/{generation}/{variant}`.
///
/// The source's spotlight subgraph, as `SALTILEL` bytes. The source id is the request's subject, so
/// the body is required.
pub(super) async fn handler(
    State(state): State<AppState>,
    Path(VariantPath {
        generation,
        variant,
    }): Path<VariantPath>,
    body: Option<Json<LocateRequest>>,
) -> Result<Saltile, Problem<'static>> {
    reject_generation(&state, &generation)?;
    reject_variant(&variant)?;

    // NOTE: I feel like there's a better way to handle this here, instead of doing this `Option`
    // dance, a custom extractor over `Path` and `Json` maybe that would turn the response into a
    // problem? Because this is... well... not great ergonomics and defeats the purpose of using
    // axum/aide.
    let Some(Json(request)) = body else {
        return Err(Problem::new(
            StatusCode::BAD_REQUEST,
            ProblemType::MissingBody,
            "a locate request names its source in a JSON body",
        ));
    };

    // Assembly and encoding are CPU-bound and ride rayon; hydration
    // awaits the store between them - the trailer is the envelope's
    // last section by design, so the columns never wait on Postgres.
    let atlas = Arc::clone(&state.atlas);
    let caps = state.caps;
    let proof = Arc::clone(&state.proof);
    let assembled = spawn(move || {
        atlas
            .assemble_locate(&request, caps, &proof)
            .map(|document| {
                let entities = (
                    atlas.locate_node_entities(&document),
                    atlas.locate_link_entities(&document),
                );
                (document, entities)
            })
    })
    .await?;

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
        .locate_details(&nodes, state.caps.locate.properties)
        .in_current_span()
        .await
        .map_err(internal)?;
    let link_details = state
        .remote
        .locate_link_details(
            &links,
            state.caps.locate.link_type_ids,
            state.caps.locate.link_properties,
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
        .with(|mut operation| {
            if let Some(body) = operation
                .inner_mut()
                .request_body
                .as_mut()
                .and_then(|body| body.as_item_mut())
            {
                body.description = Some(
                    "the locate request; exactly one of `entityId` and `row` names the subject"
                        .to_owned(),
                );
            }

            operation
        })
        .response_with::<200, Saltile, _>(|response| {
            response.description(
                "a `SALTILEL` envelope: the source first, its linked partners, and the edges \
                 joining them",
            )
        })
        .response_with::<400, Problem<'static>, _>(|response| {
            response.description("`too-many-types`, `invalid-source`, or `missing-body`")
        })
        .response_with::<404, Problem<'static>, _>(|response| {
            response.description(
                "`unknown-generation`, `unknown-variant`, or `unknown-entity` (identical for \
                 nonexistent, denied, unparsable, and out-of-universe sources)",
            )
        })
        .response_with::<501, Problem<'static>, _>(|response| {
            response.description(
                "`unsupported-feature`: the request names a surface the contract pins but version \
                 0 does not serve (`filter`)",
            )
        })
        .default_response_with::<Problem<'static>, _>(|response| {
            response
                .description("any other problem; `internal` marks a server-side assembly failure")
        })
}
