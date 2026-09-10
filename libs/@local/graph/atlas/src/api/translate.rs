//! `POST /v1/atlas/translate/{generation}/{variant}`.
//!
//! Upstream entity ids to atlas row ids, plus wire-frame positions for nodes.

use aide::transform::TransformOperation;
use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse as _, Response},
};
use type_system::{
    knowledge::entity::{
        EntityId,
        id::{ENTITY_ID_DELIMITER, EntityUuid},
    },
    principal::actor_group::WebId,
};

use super::{
    AppState, clause,
    extract::{Body, Generation, VariantPath},
    headers,
    problem::{Problem, ProblemType, reject_variant},
    saltile::{DocumentResponse, spawn},
    visibility::Visibility,
};
use crate::serve::document::{Document as _, TranslateDocument, TranslateDocumentError};

/// The operation's description.
const DESCRIPTION: &str =
    "Translates upstream entity ids (`webId~entityUuid`) into the row ids and positions the \
     binary routes speak.

Use it to place entities fetched elsewhere onto the map. A resolved node answers its row id (the \
     `ROW_IDS` value every binary response uses) plus its position in the map's coordinate frame; \
     a resolved edge answers its two endpoints' row ids. Edges have no row id of their own - \
     binary responses identify an edge by its link entity id, which the requester already holds.

Row ids are opaque per-generation values, sparse in the full 32-bit range: consistent across every \
     route of one generation, carrying no ordering, adjacency, or count information, and not \
     stable across generations - re-translate after a generation change. An id can also name an \
     entity placed since the generation was fitted. Those ids die with the serving session that \
     minted them, and the uniform token refusal that follows a restart is the signal to \
     re-bootstrap and re-translate.

The response is two maps - `nodes` and `edges` - keyed by the resolved entity's canonical id \
     (`webId~entityUuid`), not the requested string, so which map answers carries the kind and \
     two request strings naming the same entity resolve to the one key. An id that resolves to \
     nothing is an absent key, never an error and never a null entry: nonexistent ids, malformed \
     ids, draft ids, and entities the caller cannot see are indistinguishable.

The `edges` map answers a link id when the caller may see the link row and both of its endpoints; \
     otherwise the id is absent, indistinguishable from an id belonging to neither domain.

The JSON body is required; the manifest's `limits.translate.entityIds` caps the id list, read \
     against the request's own count before any id is parsed or dropped. Duplicates are legal and \
     collapse, aliases of the same entity included.";

/// The POST body of one translate read.
#[derive(Debug, Clone, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct TranslateRequest {
    /// The upstream entity ids to translate, in the `webId~entityUuid` form.
    ///
    /// Duplicates are legal and collapse.
    pub entity_ids: Vec<String>,
}

/// `POST /v1/atlas/translate/{generation}/{variant}`: upstream entity ids to atlas identity.
///
/// The required body lists the entity ids to resolve.
pub(super) async fn handler<R>(
    State(state): State<AppState<R>>,
    visibility: Visibility,
    Generation(VariantPath { variant, .. }): Generation<VariantPath>,
    Body(request): Body<TranslateRequest>,
) -> Result<Response, Problem<'static>> {
    reject_variant(&variant)?;

    let limits = state.limits.translate;
    if request.entity_ids.len() > limits.entity_ids as usize {
        return Err(too_many_entity_ids(
            request.entity_ids.len(),
            limits.entity_ids,
        ));
    }

    // Malformed and unresolvable ids are indistinguishable and both omitted. The count check
    // above runs against the request's original list, before this filter drops anything. A
    // request cannot use dropped ids to pad its way past the cap.
    let ids: Vec<EntityId> = request
        .entity_ids
        .iter()
        .filter_map(|id| parse_entity_id(id))
        .collect();

    // The whole pipeline is one synchronous call on a rayon worker, construction and encoding
    // both. `TranslateDocument` borrows the scene `visibility.scene()` resolves. Neither can
    // outlive this closure.
    let (bytes, content_type) = spawn(
        move || -> Result<(Vec<u8>, &'static str), Problem<'static>> {
            let scene = visibility.scene()?;
            let document =
                TranslateDocument::new(scene, ids, limits).map_err(|report| {
                    match report.current_context() {
                        TranslateDocumentError::Ids { count, maximum } => {
                            too_many_entity_ids(*count, *maximum)
                        }
                    }
                })?;

            let mut buffer = Vec::new();
            let envelope = document.encode(&mut buffer).map_err(|report| {
                Problem::internal(
                    report.current_context(),
                    "the translate response failed to encode",
                )
            })?;

            Ok((buffer, envelope.content_type()))
        },
    )
    .await??;

    Ok(DocumentResponse::new(bytes, content_type).into_response())
}

/// The `too-many-entity-ids` problem for a request past the configured cap.
fn too_many_entity_ids(count: usize, maximum: u32) -> Problem<'static> {
    Problem::new(
        StatusCode::BAD_REQUEST,
        ProblemType::TooManyEntityIds,
        format!("the request lists {count} entity ids, exceeding the limit of {maximum}"),
    )
}

/// Parses one upstream entity id (`webId~entityUuid`) into its typed form.
///
/// A draft-suffixed id (`webId~entityUuid~draftId`) and anything else that is not exactly two
/// `~`-delimited uuids read unresolved by contract - the corpus indexes live entities - matching
/// [`TranslateDocument::new`](crate::serve::document::TranslateDocument::new)'s own draft-id
/// filter for any caller that reaches it another way.
pub(super) fn parse_entity_id(id: &str) -> Option<EntityId> {
    let (web_id, entity_uuid) = id.split_once(ENTITY_ID_DELIMITER)?;
    if entity_uuid.contains(ENTITY_ID_DELIMITER) {
        return None;
    }

    let web_id: uuid::Uuid = web_id.parse().ok()?;
    let entity_uuid: uuid::Uuid = entity_uuid.parse().ok()?;

    Some(EntityId {
        web_id: WebId::new(web_id),
        entity_uuid: EntityUuid::new(entity_uuid),
        draft_id: None,
    })
}

/// Documents the operation.
pub(super) fn document(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("translate")
        .summary("Upstream entity ids to atlas row ids and positions")
        .description(DESCRIPTION)
        .with(clause::describe_body(
            "the translate request; the `entityIds` list is the request's subject",
        ))
        .response_with::<200, Json<TranslateDocument>, _>(|mut response| {
            response.inner().headers.insert(
                "Cache-Control".to_owned(),
                headers::cache_control(
                    headers::NO_STORE,
                    "the response keys on the request body, which shared caches cannot see; the \
                     client's application-layer cache is the cache",
                ),
            );
            response.description(
                "two maps keyed by the resolved entity's canonical id; unresolvable and malformed \
                 ids are absent keys",
            )
        })
        .response_with::<400, Problem<'static>, _>(|response| {
            response.description(
                "`too-many-entity-ids`, `invalid-generation`, `missing-body`, or `invalid-body` \
                 (a body that is not JSON)",
            )
        })
        .with(clause::invalid_body_data)
        .with(clause::unauthorized)
        .response_with::<404, Problem<'static>, _>(|response| {
            response.description(
                "`unknown-generation` or `unknown-variant`: re-bootstrap through `current`",
            )
        })
        .default_response_with::<Problem<'static>, _>(|response| {
            response
                .description("any other problem; `internal` marks a server-side assembly failure")
        })
}
