//! `POST /v1/atlas/tile/{generation}/{variant}/{z}/{x}/{y}`: one tile as `SALTILET` bytes.

use aide::transform::TransformOperation;
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse as _, Response},
};
use type_system::ontology::id::VersionedUrl;

use super::{
    AppState, clause,
    extract::{Body, Coordinates, Generation, VariantPath},
    problem::{Problem, ProblemType, reject_variant},
    saltile::{DocumentResponse, Saltile, spawn},
    visibility::Visibility,
};
use crate::{
    morton::{Depth, MortonTile},
    postgres::id::ArchivedOntologyTypeUuid,
    serve::{
        document::{
            Document as _, Mode, TileDocument, TileDocumentDetailLevel, TileDocumentError,
            TileDocumentOptions,
        },
        membership::OntologySelection,
    },
};

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
     manifest's `limits.tile.coloredTypeIds` caps the list.

`detail: \"auxiliary\"` adds the detail trailer - per-point labels and icons read from the \
     request's captured publication. `\"minimal\"`, the default, sends geometry alone. A client \
     must not retain a detailed response as an immutable generation tile. Cache geometry. Section \
     2 of the Atlas wire format defines the detail that clients refetch where request-time state \
     matters.

Filtering binds at the manifest. This body has no `filter` field, and an unknown member is \
     rejected as `invalid-body`.";

/// The `z/x/y` grid cell.
///
/// Extracted through [`Coordinates`]: an unparsable numeric segment answers the
/// `invalid-coordinate` problem, the same slug an out-of-range address earns from assembly.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub(super) struct CellPath {
    /// The zoom, a subdivision depth where `0` addresses the root.
    z: Depth,
    /// The cell's `x` index on the `2^z` grid.
    x: u32,
    /// The cell's `y` index on the `2^z` grid.
    y: u32,
}

/// The requested tile detail level.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) enum TileDetail {
    #[default]
    Minimal,
    Auxiliary,
}

impl TileDetail {
    /// Converts the wire spelling into the document construction's own level.
    const fn into_document_level(self) -> TileDocumentDetailLevel {
        match self {
            Self::Minimal => TileDocumentDetailLevel::Minimal,
            Self::Auxiliary => TileDocumentDetailLevel::Auxiliary,
        }
    }
}

/// The query context of one tile request: the ratified POST body, every field optional.
#[derive(Debug, Clone, Default, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct TileQuery {
    /// The delivery mode, defaulting to delta when the request names none.
    #[serde(default)]
    pub mode: Mode,
    /// Versioned type URLs conditioning the `TYPE_MASK` column, in request order.
    ///
    /// Entries parse at the transport boundary: a malformed URL rejects the body, while a
    /// well-formed URL this generation never ingested is legal and reads zero bits.
    #[serde(default)]
    #[schemars(with = "Vec<String>")]
    pub colored_type_ids: Vec<VersionedUrl>,
    /// Whether the response carries the detail trailer.
    #[serde(default)]
    pub detail: TileDetail,
}

/// `POST /v1/atlas/tile/{generation}/{variant}/{z}/{x}/{y}`: one tile as `SALTILET` bytes.
///
/// An absent body reads as the all-defaults query.
pub(super) async fn handler<R>(
    State(state): State<AppState<R>>,
    visibility: Visibility,
    Generation(VariantPath { variant, .. }): Generation<VariantPath>,
    Coordinates(CellPath { z, x, y }): Coordinates<CellPath>,
    query: Option<Body<TileQuery>>,
) -> Result<Response, Problem<'static>> {
    reject_variant(&variant)?;

    let TileQuery {
        mode,
        colored_type_ids,
        detail,
    } = query.map_or_else(TileQuery::default, |Body(query)| query);
    let coordinate = MortonTile { z, x, y };
    let detail = detail.into_document_level();
    let limits = state.limits.tile;

    // The whole pipeline is one synchronous call on a rayon worker, construction and encoding
    // both. `TileDocument` borrows the scene `visibility.scene()` resolves. Neither can outlive
    // this closure.
    let (bytes, content_type) = spawn(
        move || -> Result<(Vec<u8>, &'static str), Problem<'static>> {
            let ontology: Vec<ArchivedOntologyTypeUuid> = colored_type_ids
                .iter()
                .map(ArchivedOntologyTypeUuid::from_url)
                .collect();
            let types = OntologySelection::new(&ontology);

            let scene = visibility.scene()?;
            let document = TileDocument::new(
                scene,
                coordinate,
                &TileDocumentOptions {
                    mode,
                    detail,
                    types,
                    limits,
                },
            )
            .map_err(|report| tile_problem(report.current_context()))?;

            let mut buffer = Vec::new();
            let envelope = document
                .encode(&mut buffer)
                .unwrap_or_else(|never| match never {});

            Ok((buffer, envelope.content_type()))
        },
    )
    .await??;

    Ok(DocumentResponse::new(bytes, content_type).into_response())
}

/// Maps one construction failure onto the problem it earns.
///
/// [`TileDocumentError::Types`] is the caller's own oversize request: `too-many-types`.
/// [`TileDocumentError::Zoom`] and [`TileDocumentError::Coordinate`] are the caller's own
/// out-of-range address, both `invalid-coordinate` exactly as an unparsable segment answers from
/// [`Coordinates`]. [`TileDocumentError::Position`] and [`TileDocumentError::Display`] name a
/// delivered row the captured scene cannot back with a position or a display payload - a producer
/// defect rather than a request one - and answer the sanitized internal problem.
fn tile_problem(error: &TileDocumentError) -> Problem<'static> {
    match error {
        TileDocumentError::Types { .. } => Problem::new(
            StatusCode::BAD_REQUEST,
            ProblemType::TooManyTypes,
            error.to_string(),
        ),
        TileDocumentError::Zoom { .. } | TileDocumentError::Coordinate { .. } => Problem::new(
            StatusCode::BAD_REQUEST,
            ProblemType::InvalidCoordinate,
            error.to_string(),
        ),
        TileDocumentError::Position { .. } | TileDocumentError::Display { .. } => {
            Problem::internal(
                error,
                "the tile assembly could not read a delivered row's captured data",
            )
        }
    }
}

/// Documents the operation.
pub(super) fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("tile")
        .summary("One tile as SALTILET envelope bytes")
        .description(DESCRIPTION)
        .with(clause::optional_body)
        .with(clause::describe_body(
            "the query context; absent reads as the all-defaults query",
        ))
        .response_with::<200, Saltile, _>(|response| {
            response.description("a `SALTILET` envelope: the tile's delivered geometry")
        })
        .response_with::<400, Problem<'static>, _>(|response| {
            response.description(
                "`invalid-coordinate` (an unparsable `z`/`x`/`y` segment, a zoom past the deepest \
                 cut, or `x`/`y` off the `2^z` grid), `invalid-generation` (a malformed \
                 generation id), `too-many-types` (`coloredTypeIds` exceeds the manifest's cap), \
                 or `invalid-body` (a body that is not JSON)",
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
