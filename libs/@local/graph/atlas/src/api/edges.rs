//! `POST /v1/atlas/edges/{generation}/{variant}`.
//!
//! The edges among the listed tiles' delivered rows, as `SALTILEE` bytes.

use alloc::sync::Arc;
use core::panic::AssertUnwindSafe;

use aide::transform::TransformOperation;
use axum::{
    extract::State,
    response::{IntoResponse as _, Response},
};

use super::{
    AppState, clause,
    extract::Body,
    problem::Problem,
    saltile::{DocumentResponse, Saltile, spawn},
    visibility::Visibility,
};
use crate::{
    morton::MortonTile,
    serve::document::{
        Document as _, EdgesDocument, EdgesDocumentDetailLevel, EdgesDocumentOptions,
    },
};

/// The operation's description.
const DESCRIPTION: &str =
    "Returns the edges among the points the listed tiles deliver, as a `SALTILEE` binary envelope.

An edge is included exactly when both of its endpoints lie in the union of the listed tiles' \
     delivered sets, so one request listing the whole viewport also returns the edges that cross \
     between its tiles. Delivery is the tile route's level-of-detail delivery, not spatial \
     containment: an edge is absent while either endpoint sits below the listed zoom's cut, and \
     appears once the viewport or zoom reaches that endpoint.

The JSON body is required; the manifest's `limits.edges.tiles` caps the tile list.

The response's three columns - sources, targets, and `EDGE_IDS` (each edge's 32-byte link entity \
     id, web uuid then entity uuid) - are ordered ascending by identity bytes, independent of the \
     tile list's order: identical requests yield identical geometry bytes, and the order is \
     verifiable from the `EDGE_IDS` column alone. Edges have no row id of their own; the entity \
     id is an edge's identity on every route.

When the server's edge cap truncates the set, the response keeps the edges whose worse endpoint \
     ranks best, and the HEAD's `complete` key reads `false`.

`detail: \"auxiliary\"` adds the detail trailer (`\"minimal\"`, the default, sends the columns \
     alone). Labels use the request's captured publication. Type references read request-time \
     store state. A retained generation or stalled feed may lag current store state.

Entities and links that arrive after the serving generation's fit can also appear. A post-fit link \
     is an ordinary edge row wherever both of its endpoints deliver, merged into the same \
     identity order, and its label and representative type come from the display the server \
     captured at the link's currently served edition rather than the generation. An endpoint \
     placed since the fit takes a session-scoped row id, and such ids die with the serving \
     session that minted them, exactly as locate and translate describe.

Filtering binds at the manifest. This body has no `filter` field, and an unknown member is \
     rejected as `invalid-body`.
";

/// The requested edges detail level.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) enum EdgesDetail {
    #[default]
    Minimal,
    Auxiliary,
}

impl EdgesDetail {
    /// Converts the wire spelling into the document construction's own level.
    const fn into_document_level(self) -> EdgesDocumentDetailLevel {
        match self {
            Self::Minimal => EdgesDocumentDetailLevel::Minimal,
            Self::Auxiliary => EdgesDocumentDetailLevel::Auxiliary,
        }
    }
}

/// The POST body of one edges read.
#[derive(Debug, Clone, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct EdgesRequest {
    /// The tiles whose delivered rows bound the edge set.
    pub tiles: Vec<MortonTile>,
    /// Whether the response carries the detail trailer.
    #[serde(default)]
    pub detail: EdgesDetail,
}

/// `POST /v1/atlas/edges/{generation}/{variant}`.
///
/// The required body names the tiles whose delivered rows bound the edge set.
pub(super) async fn handler<R>(
    State(state): State<AppState<R>>,
    visibility: Visibility,
    Body(request): Body<EdgesRequest>,
) -> Result<Response, Problem<'static>> {
    let detail = request.detail.into_document_level();
    let limits = state.limits.edges;
    let resolver = Arc::clone(&state.type_urls);

    // The whole pipeline is one synchronous call on a rayon worker, construction and encoding
    // both. `EdgesDocument` borrows the scene `visibility.scene()` resolves. Neither can outlive
    // this closure. `AssertUnwindSafe` covers the cached resolver's interior mutability, the same
    // reason the legacy channel-backed store needed it here.
    let (bytes, content_type) = spawn(AssertUnwindSafe(
        move || -> Result<(Vec<u8>, &'static str), Problem<'static>> {
            let scene = visibility.scene()?;
            let document = EdgesDocument::new(
                scene,
                &request.tiles,
                &EdgesDocumentOptions {
                    detail,
                    limits,
                    resolver,
                },
            )?;

            let mut buffer = Vec::new();
            let envelope = document
                .encode(&mut buffer)
                .unwrap_or_else(|never| match never {});

            Ok((buffer, envelope.content_type()))
        },
    ))
    .await??;

    Ok(DocumentResponse::new(bytes, content_type).into_response())
}

/// Documents the operation.
pub(super) fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("edges")
        .summary("The edges among the listed tiles' delivered rows, as SALTILEE envelope bytes")
        .description(DESCRIPTION)
        .with(clause::describe_body(
            "the edges request; the `tiles` list is the request's subject",
        ))
        .response_with::<200, Saltile, _>(|response| {
            response.description(
                "a `SALTILEE` envelope: the qualifying edges, ascending by link-entity identity",
            )
        })
        .response_with::<400, Problem<'static>, _>(|response| {
            response.description(
                "`too-many-tiles`, `invalid-generation`, `missing-body`, `invalid-body` (a body \
                 that is not JSON), or `invalid-coordinate`",
            )
        })
        .with(clause::invalid_body_data)
        .with(clause::unauthorized)
        .response_with::<404, Problem<'static>, _>(|response| {
            response.description(
                "`unknown-generation` or `unknown-variant`: re-read `current` and retry",
            )
        })
        .with(clause::any_problem)
}
