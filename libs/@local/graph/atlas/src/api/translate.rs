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
    extract::Body,
    headers,
    problem::{Problem, ProblemType},
    saltile::{DocumentResponse, spawn},
    visibility::Visibility,
};
use crate::serve::document::{Document as _, TranslateDocument};

/// The operation's description.
const DESCRIPTION: &str =
    "Translates upstream entity ids (`webId~entityUuid`) into the row ids and positions the \
     binary routes speak.

Use it to place entities fetched elsewhere onto the map. A resolved node answers its row id (the \
     `ROW_IDS` value every binary response uses) plus its position in the map's coordinate frame. \
     A resolved edge answers its two endpoints' row ids. Edges have no row id of their own - \
     binary responses identify an edge by its link entity id, which the requester already holds.

Row ids are opaque per-generation values, sparse in the full 32-bit range: consistent across every \
     route of one generation, issued by a keyed permutation whose design target is that id values \
     carry no ordering, adjacency, or count information, and not stable across generations - \
     re-translate after a generation change. That hiding is the construction's target rather than \
     a demonstrated boundary, and it covers the values alone: a response still shows how many ids \
     resolved, and a repeated id is visibly a repeat. An id can also name an entity placed since \
     the generation was fitted, and such an id is an assignment within one delta lifetime - the \
     lifetime a serving process draws when it opens the generation, and draws afresh when it \
     reopens it.

Two separate checks stand between a held authority token and an answer. The token opens only under \
     the key the answering process derived at startup, from the deployment secret and a salt \
     drawn then, so a token sealed under a different key does not open. An opened token must then \
     name the delta lifetime the request is reading, and a token naming a different one is \
     refused. A serving process draws that lifetime afresh whenever it reopens the generation. \
     Either check refuses uniformly, and the remedy is the same: re-bootstrap through the \
     manifest, then re-translate the ids you hold.

The response is two maps - `nodes` and `edges` - keyed by the resolved entity's canonical id \
     (`webId~entityUuid`), not the requested string, so which map answers carries the kind and \
     two request strings naming the same entity resolve to the one key. An id that resolves to \
     nothing is an absent key, never an error and never a null entry: nonexistent ids, malformed \
     ids, draft ids, and entities the caller cannot see are indistinguishable.

The `edges` map answers a link id when the caller may see the link row and both of its endpoints. \
     Otherwise the id is absent, indistinguishable from an id belonging to neither domain.

The JSON body is required. The manifest's `limits.translate.entityIds` caps the id list, read \
     against the request's own count before any id is parsed or dropped. Duplicates are legal and \
     collapse, aliases of the same entity included.";

fn deserialize_entity_ids<'de, D: serde::de::Deserializer<'de>>(
    deserializer: D,
) -> Result<Vec<EntityId>, D::Error> {
    let values: Vec<EntityId> = serde::de::Deserialize::deserialize(deserializer)?;
    for value in &values {
        if value.draft_id.is_some() {
            return Err(serde::de::Error::custom("draft ids are not supported"));
        }
    }

    Ok(values)
}

/// The POST body of one translate read.
#[derive(Debug, Clone, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct TranslateRequest {
    /// The upstream entity ids to translate, in the `webId~entityUuid` form.
    ///
    /// Required: the body has no default for it. Duplicates are legal and collapse.
    #[schemars(with = "Vec<String>")]
    #[serde(deserialize_with = "deserialize_entity_ids")]
    pub entity_ids: Vec<EntityId>,
}

/// Resolves upstream entity ids to atlas row ids, with wire-frame positions for nodes.
///
/// Serves `POST /v1/atlas/translate/{generation}/{variant}`. The required body lists the entity
/// ids to resolve.
///
/// # Errors
///
/// Answers `too-many-entity-ids` where the request's own list exceeds the published cap, counted
/// before parsing or dropping any id, `unauthorized` where the request's authority offset cannot
/// bind its delivery schedule, and `internal` where the response fails to serialize or the
/// assembly worker panics.
pub(super) async fn handler<R>(
    State(state): State<AppState<R>>,
    visibility: Visibility,
    Body(request): Body<TranslateRequest>,
) -> Result<Response, Problem<'static>> {
    let limits = state.limits.translate;
    if request.entity_ids.len() > limits.entity_ids as usize {
        return Err(too_many_entity_ids(
            request.entity_ids.len(),
            limits.entity_ids,
        ));
    }

    // The whole pipeline is one synchronous call on a rayon worker, construction and encoding
    // both. `TranslateDocument` borrows the scene `visibility.scene()` resolves. Neither can
    // outlive this closure.
    let (bytes, content_type) = spawn(
        move || -> Result<(Vec<u8>, &'static str), Problem<'static>> {
            let scene = visibility.scene()?;
            let document = TranslateDocument::new(scene, request.entity_ids, limits)?;

            let mut buffer = Vec::new();
            let envelope = document.encode(&mut buffer).map_err(|report| {
                Problem::internal(&report, "the translate response failed to encode")
            })?;

            Ok((buffer, envelope.content_type()))
        },
    )
    .await??;

    Ok(DocumentResponse::new(bytes, content_type).into_response())
}

/// Builds the `too-many-entity-ids` problem for a request past the configured cap.
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
                    "the response keys on the request body, which shared caches cannot see. The \
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
