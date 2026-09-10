//! `POST /v1/atlas/locate/{generation}/{variant}`.
//!
//! The source entity's ego-graph - its edges and the partners they connect - as `SALTILEL` bytes.

use alloc::sync::Arc;
use core::panic::AssertUnwindSafe;

use aide::transform::TransformOperation;
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse as _, Response},
};
use type_system::ontology::id::VersionedUrl;

use super::{
    AppState, clause,
    extract::{Body, Generation, VariantPath},
    problem::{Problem, ProblemType, reject_variant},
    saltile::{DocumentResponse, Saltile, spawn},
    translate,
    visibility::Visibility,
};
use crate::{
    identity::NodeRowId,
    postgres::id::ArchivedOntologyTypeUuid,
    serve::{
        codec::EncodedRowId,
        document::{
            Document as _, LocateDocument, LocateDocumentError, LocateDocumentOptions, LocateSource,
        },
        membership::OntologySelection,
    },
};

/// The operation's description.
const DESCRIPTION: &str =
    "Returns one entity's ego-graph: the source point, every neighbour it links to, and the edges \
     joining them, as a `SALTILEL` binary envelope.

The JSON body is required and names the source in exactly one of two fields: `entityId` (the \
     upstream `webId~entityUuid` id a search result or deep link carries) or `row` (a row id a \
     tile's `ROW_IDS` column delivered - if you hold one, no translate round trip is needed). A \
     body carrying both or neither answers `invalid-source`. Either field reaches identical \
     geometry bytes for the same source.

A source may also name an entity placed since the generation was fitted: it resolves through the \
     captured publication in either field form, with its recorded coordinate, display and visible \
     incident links. Such row ids expire with the delta lifetime, as translate describes.

The source is delivered first, partners follow ascending by row id, and edges are ordered \
     ascending by link-entity identity bytes (the `EDGE_IDS` column: each edge's 32-byte entity \
     id, web uuid then entity uuid). The manifest's `limits.locate.edges` caps the edge set; \
     under truncation the response keeps the edges whose partners lie nearest the source, the \
     HEAD's `complete` key reads `false`, and a partner whose every edge was truncated is not \
     delivered.

The HEAD also carries the source's first visible zoom and its tile there (the fly-to target), the \
     source's entity id as 32 raw bytes, and two completeness flags: `typeIdsComplete` (the \
     request's `coloredTypeIds` cover every direct type of the source) and `propertiesComplete` \
     (the trailer's source property map is the entity's whole deliverable set - every property no \
     protection withholds from the requesting actor). `coloredTypeIds` behaves exactly as on the \
     tile route, with the cap in `limits.locate.coloredTypeIds`.

The response always carries the detail trailer. Labels use the captured publication and appear \
     only when the request-time store read resolves the corresponding entity. The store also \
     supplies each node's representative type, the source's properties capped by \
     `limits.locate.properties`, and each edge's direct types and properties capped by \
     `limits.locate.linkTypeIds` and `limits.locate.linkProperties`. Each edge cap has a \
     completeness flag. Type and property references are integer indexes into the trailer's two \
     sorted URL tables.

A source that does not name a visible node answers `unknown-entity`: nonexistent, inaccessible, \
     unparsable, and out-of-range `row` values are indistinguishable by design.

Filtering binds at the manifest. This body has no `filter` field, and an unknown member is \
     rejected as `invalid-body`.
";

/// The POST body of one locate read.
///
/// Exactly one of `entityId` and `row` names the subject; [`handler`] rejects both and neither
/// with `invalid-source` before any assembly runs.
#[derive(Debug, Clone, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct LocateRequest {
    /// The source entity id, in the node identity domain.
    ///
    /// Exactly one of this and `row` names the source.
    #[serde(default)]
    pub entity_id: Option<String>,
    /// The source as a wire node row id - the value a tile's `ROW_IDS` column delivered.
    ///
    /// Exactly one of this and `entityId` names the source.
    #[serde(default)]
    pub row: Option<EncodedRowId<NodeRowId>>,
    /// Versioned type URLs conditioning the `TYPE_MASK` column. Absent or empty omits it.
    ///
    /// Also the `typeIdsComplete` reference set: the flag reads `true` exactly when these ids
    /// cover the source's direct types. Entries parse at the transport boundary: a malformed URL
    /// rejects the body, while a well-formed URL this generation never ingested is legal and
    /// reads zero bits.
    #[serde(default)]
    #[schemars(with = "Vec<String>")]
    pub colored_type_ids: Vec<VersionedUrl>,
}

/// `POST /v1/atlas/locate/{generation}/{variant}`.
///
/// The required body names exactly one source, by entity id or row id.
pub(super) async fn handler<R>(
    State(state): State<AppState<R>>,
    visibility: Visibility,
    Generation(VariantPath { variant, .. }): Generation<VariantPath>,
    Body(LocateRequest {
        entity_id,
        row,
        colored_type_ids,
    }): Body<LocateRequest>,
) -> Result<Response, Problem<'static>> {
    reject_variant(&variant)?;

    // Both/neither is the caller's own malformed request, `invalid-source`. A malformed
    // `entityId` string collapses into `unknown-entity` exactly as an unresolvable one does, since
    // an id that cannot name an entity is an entity that does not exist. An out-of-domain `row`
    // reaches the same answer from inside `LocateDocument::new`.
    let source = match (entity_id.as_deref(), row) {
        (Some(id), None) => match translate::parse_entity_id(id) {
            Some(entity_id) => LocateSource::Key(entity_id),
            None => return Err(unknown_entity()),
        },
        (None, Some(row)) => LocateSource::Row(row),
        (entity, row) => {
            return Err(Problem::new(
                StatusCode::BAD_REQUEST,
                ProblemType::InvalidSource,
                format!(
                    "the request carries {} source fields where exactly one of entityId and row \
                     names the subject",
                    usize::from(entity.is_some()) + usize::from(row.is_some()),
                ),
            ));
        }
    };

    let limits = state.limits.locate;
    let resolver = Arc::clone(&state.remote);

    // The whole pipeline is one synchronous call on a rayon worker, construction, hydration, and
    // encoding all three. `LocateDocument` borrows the scene `visibility.scene()` resolves. None
    // of them can outlive this closure. `AssertUnwindSafe` covers the resolver's connection pool
    // handle, the same reason the legacy channel-backed store needed it here.
    let (bytes, content_type) = spawn(AssertUnwindSafe(
        move || -> Result<(Vec<u8>, &'static str), Problem<'static>> {
            let ontology: Vec<ArchivedOntologyTypeUuid> = colored_type_ids
                .iter()
                .map(ArchivedOntologyTypeUuid::from_url)
                .collect();
            let types = OntologySelection::new(&ontology);

            let scene = visibility.scene()?;
            let document = LocateDocument::new(
                scene,
                source,
                &LocateDocumentOptions {
                    types,
                    limits,
                    resolver,
                },
            )
            .map_err(|report| locate_problem(report.current_context()))?;

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

/// The uniform refusal for a source that does not name a visible node.
///
/// Nonexistent, inaccessible, unparsable, and out-of-range values are indistinguishable by design:
/// missing equals denied, and an id that cannot name an entity is an entity that does not exist.
fn unknown_entity() -> Problem<'static> {
    Problem::new(
        StatusCode::NOT_FOUND,
        ProblemType::UnknownEntity,
        "the source does not name a visible node",
    )
}

/// `LocateDocumentError` <=> `Problem`
///
/// [`LocateDocumentError::Types`] is the caller's own oversize request: `too-many-types`.
/// [`LocateDocumentError::UnknownEntity`] is [`unknown_entity`]. [`LocateDocumentError::Node`],
/// [`LocateDocumentError::NodeDisplay`], and [`LocateDocumentError::LinkDisplay`] name a delivered
/// row the captured scene cannot back with identity, position, or display data - a producer defect
/// rather than a request one - and [`LocateDocumentError::Hydrate`] names a failed store read;
/// both answer the sanitized internal problem.
fn locate_problem(error: &LocateDocumentError) -> Problem<'static> {
    match error {
        LocateDocumentError::Types { .. } => Problem::new(
            StatusCode::BAD_REQUEST,
            ProblemType::TooManyTypes,
            error.to_string(),
        ),
        LocateDocumentError::UnknownEntity => unknown_entity(),
        LocateDocumentError::Node { .. }
        | LocateDocumentError::NodeDisplay { .. }
        | LocateDocumentError::LinkDisplay { .. } => Problem::internal(
            error,
            "the locate assembly could not read a delivered row's captured data",
        ),
        LocateDocumentError::Hydrate => Problem::internal(error, "the detail hydration failed"),
    }
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
                 `invalid-body` (a body that is not JSON)",
            )
        })
        .with(clause::invalid_body_data)
        .with(clause::unauthorized)
        .response_with::<404, Problem<'static>, _>(|response| {
            response.description(
                "`unknown-generation`, `unknown-variant`, or `unknown-entity` (identical for \
                 nonexistent, inaccessible, unparsable, and out-of-range sources)",
            )
        })
        .with(clause::any_problem)
}
