//! `POST /v1/atlas/locate/{generation}/{variant}`: the source entity
//! and its nearest neighbours with the edges among them, as
//! `SALTILEL` bytes.

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
    "Spotlights one entity: resolves the source to its dot, delivers it first with its nearest \
     neighbours ascending by (distance, node row id), and rides the edges among the delivered set \
     ascending by edge row id.

The JSON body is required and names the source in EXACTLY ONE of two domains: `entityId` (the \
     upstream id a search result or deep link carries) XOR `row` (the wire node row id a rendered \
     tile delivered in `ROW_IDS` - the natural click-to-spotlight loop, no translate detour). A \
     body carrying both or neither answers `invalid-source` (400). The same source yields \
     byte-identical responses through either domain.

`neighbours` is a budget: values over the manifest's `limits.locateNeighbours` CLAMP (visible in \
     `HEAD.count`), and absent means the cap itself. The subgraph's edges cap at \
     `limits.locateEdges`; truncation keeps the edges whose worse endpoint ranks best with \
     source-incident edges protected to the end, and the HEAD's `complete` key reads `false`.

The HEAD carries the source's first visible zoom and its tile there - the client's fly-to target. \
     `coloredTypeIds` rides `TYPE_MASK` exactly as on tiles.

`includeDetailedData` DEFAULTS TRUE - locate is a detail view. The trailer hydrates LIVE from the \
     store for every delivered node (label, icon, capped simple-value properties keyed into the \
     interned name table) and every delivered edge (the four link detail arrays).

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
    /// The fitted variant name; the manifest lists what this
    /// generation serves.
    variant: String,
}

/// `POST /v1/atlas/locate/{generation}/{variant}`: the source's
/// spotlight subgraph, as `SALTILEL` bytes. The source id is the
/// request's subject, so the body is required.
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

    let Some(Json(request)) = body else {
        return Err(Problem::new(
            StatusCode::BAD_REQUEST,
            ProblemType::MissingBody,
            "a locate request names its source in a JSON body",
        ));
    };

    let detailed = request.include_detailed_data;

    // Assembly and encoding are CPU-bound and ride rayon; hydration
    // awaits the store between them - the trailer is the envelope's
    // last section by design, so the columns never wait on Postgres.
    let atlas = Arc::clone(&state.atlas);
    let caps = state.caps;
    let assembled = spawn(move || {
        atlas.assemble_locate(&request, caps).map(|document| {
            let entities = detailed.then(|| {
                (
                    atlas.locate_node_entities(&document),
                    atlas.locate_link_entities(&document),
                )
            });
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

    let details = match entities {
        Some((nodes, links)) => {
            let internal = |error: crate::serve::DetailError| {
                Problem::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    ProblemType::InternalError,
                    error.to_string(),
                )
            };
            let node_details = state
                .details
                .locate_details(&nodes, state.caps.locate.properties)
                .in_current_span()
                .await
                .map_err(internal)?;
            let link_details = state
                .details
                .link_details(&links)
                .in_current_span()
                .await
                .map_err(internal)?;

            Some((node_details, link_details))
        }
        None => None,
    };

    let atlas = Arc::clone(&state.atlas);
    let bytes = spawn(move || {
        atlas.encode_locate(
            &document,
            details.as_ref().map(|(nodes, links)| (nodes, links)),
        )
    })
    .await?;
    Ok(Saltile::new(bytes))
}

/// Documents the operation.
pub(super) fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("locate")
        .summary("The source entity's spotlight subgraph, as SALTILEL envelope bytes")
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
                "a `SALTILEL` envelope: the source first, its neighbours, and the edges among them",
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
