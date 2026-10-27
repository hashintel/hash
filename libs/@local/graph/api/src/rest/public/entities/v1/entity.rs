//! `GET /{entityId}`: one entity by its ID.

use alloc::{borrow::Cow, collections::BTreeSet};
use core::error::Error;

use aide::transform::TransformOperation;
use axum::extract::State;
use error_stack::{Report, ResultExt as _};
use hash_graph_store::{entity::EntityStore as _, pool::StorePool};
use hash_middleware::problem::{InternalServerError, ServiceUnavailable};
use http::StatusCode;
use problematic::{Answer, Expose, Problem, ProblemType, ProblemVariant, Rejection, Variant};
use schemars::{JsonSchema, Schema, SchemaGenerator, json_schema};
use serde::{Deserialize, Serialize};
use type_system::{
    knowledge::entity::{EntityId, id::EntityUuid},
    ontology::VersionedUrl,
    principal::actor_group::WebId,
};
use uuid::Uuid;

use crate::rest::{
    ApiState,
    credentials::Actor,
    extract::{Json, Path},
    public::Credentials,
    routing::{self, Routes},
};

/// An entity's web ID and UUID, joined by `~`.
///
/// Unlike [`EntityId`], it never names a draft.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, derive_more::Display)]
#[serde(try_from = "EntityId", into = "EntityId")]
struct LiveEntityId(EntityId);

impl LiveEntityId {
    const fn new(web_id: WebId, entity_uuid: EntityUuid) -> Self {
        Self(EntityId {
            web_id,
            entity_uuid,
            draft_id: None,
        })
    }
}

/// The entity ID names a draft.
#[derive(Debug, derive_more::Display)]
#[display("the entity ID names a draft")]
struct DraftEntityIdError;

impl TryFrom<EntityId> for LiveEntityId {
    type Error = DraftEntityIdError;

    fn try_from(entity_id: EntityId) -> Result<Self, Self::Error> {
        if entity_id.draft_id.is_some() {
            return Err(DraftEntityIdError);
        }
        Ok(Self(entity_id))
    }
}

impl From<LiveEntityId> for EntityId {
    fn from(entity_id: LiveEntityId) -> Self {
        entity_id.0
    }
}

impl JsonSchema for LiveEntityId {
    fn schema_name() -> Cow<'static, str> {
        Cow::Borrowed("EntityId")
    }

    fn json_schema(_: &mut SchemaGenerator) -> Schema {
        json_schema!({
            "type": "string",
            "description": "An entity's web ID and UUID, joined by `~`.",
            "examples": [
                "8d86c8c3-d66d-43d1-859b-676c3bcaeadc~be2c5b2f-e3e1-4f26-a0c4-0f8b5e9c4a1d",
            ],
        })
    }
}

/// The path of one entity.
#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct EntityPath {
    /// The ID of the entity to read. An ID that names a draft is answered with `400`.
    entity_id: LiveEntityId,
}

/// An entity the caller may view.
#[derive(Serialize, JsonSchema)]
struct Entity {
    /// What identifies and classifies the entity.
    metadata: EntityMetadata,
}

/// What identifies and classifies an entity.
#[derive(Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct EntityMetadata {
    /// The ID of the entity.
    entity_id: LiveEntityId,
    /// The entity types the entity is an instance of, without the types they inherit from.
    entity_type_ids: BTreeSet<VersionedUrl>,
}

/// The entity does not exist, is archived, or the caller may not view it.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("No entity `{entity_id}` is visible to the caller.")]
struct EntityNotFound {
    #[serde(skip)]
    entity_id: LiveEntityId,
}

impl ProblemVariant for EntityNotFound {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Not Found"),
        status: StatusCode::NOT_FOUND,
    };

    fn example() -> Option<Self> {
        Some(Self {
            entity_id: LiveEntityId::new(
                WebId::from_uuid(Uuid::from_u128(0x8D86C8C3_D66D_43D1_859B_676C3BCAEADC)),
                EntityUuid::from_uuid(Uuid::from_u128(0xBE2C5B2F_E3E1_4F26_A0C4_0F8B5E9C4A1D)),
            ),
        })
    }
}

/// The ways [`get_entity`] refuses a request its extractors accept.
struct GetEntityProblem;

impl Problem for GetEntityProblem {
    const VARIANTS: &'static [Variant] = &[
        Variant::of::<EntityNotFound>(),
        Variant::of::<ServiceUnavailable>(),
        Variant::of::<InternalServerError>(),
    ];
}

#[derive(Debug, derive_more::Display)]
enum GetEntityError {
    #[display("no entity `{_0}` is visible to the caller")]
    NotFound(LiveEntityId),
    #[display("entity `{_0}` is archived")]
    Archived(LiveEntityId),
    #[display("no store could be acquired")]
    Unavailable,
    #[display("the store could not be read")]
    Store,
}

impl Error for GetEntityError {}

impl Expose<GetEntityProblem> for Report<GetEntityError> {
    fn expose(&self) -> Answer<'_, GetEntityProblem> {
        match self.current_context() {
            GetEntityError::NotFound(entity_id) | GetEntityError::Archived(entity_id) => {
                Answer::new(EntityNotFound {
                    entity_id: *entity_id,
                })
            }
            GetEntityError::Unavailable => Answer::new(ServiceUnavailable),
            GetEntityError::Store => Answer::new(InternalServerError),
        }
    }
}

async fn get_entity<S>(
    State(state): State<ApiState<S>>,
    actor: Actor<Credentials>,
    Path(EntityPath { entity_id }): Path<EntityPath>,
) -> Result<Json<Entity>, Rejection<GetEntityProblem>>
where
    S: StorePool + Send + Sync + 'static,
{
    let mut store = state
        .acquire()
        .await
        .change_context(GetEntityError::Unavailable)?;
    let entity = store
        .get_entity_by_id(Some(actor.into()), EntityId::from(entity_id), None, None)
        .await
        .change_context(GetEntityError::Store)?
        .ok_or_else(|| Report::new(GetEntityError::NotFound(entity_id)))?;
    if entity.metadata.archived {
        return Err(Report::new(GetEntityError::Archived(entity_id)).into());
    }

    Ok(Json(Entity {
        metadata: EntityMetadata {
            entity_id,
            entity_type_ids: entity.metadata.entity_type_ids.into_iter().collect(),
        },
    }))
}

fn document_get_entity(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("getEntity")
        .summary("Get an entity")
        .description("Returns the entity's ID and the entity types of its current edition.")
}

pub(super) fn routes<S>() -> Routes<ApiState<S>>
where
    S: StorePool + Send + Sync + 'static,
{
    Routes::new()
        .route(
            "/{entityId}",
            routing::get(get_entity::<S>, document_get_entity),
        )
        .tag("Entity")
}
