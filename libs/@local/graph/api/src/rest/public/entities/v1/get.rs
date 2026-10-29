//! `GET /{entityId}`: one entity by its ID.

use alloc::borrow::Cow;
use core::error::Error;

use aide::transform::TransformOperation;
use axum::extract::State;
use error_stack::{Report, ResultExt as _};
use hash_graph_store::{entity::EntityStore as _, pool::StorePool};
use hash_middleware::problem::{InternalServerError, ServiceUnavailable};
use http::StatusCode;
use problematic::{Answer, Expose, Problem, ProblemType, ProblemVariant, Rejection, Variant};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use type_system::{
    knowledge::entity::{EntityId, id::EntityUuid},
    principal::actor_group::WebId,
};
use uuid::Uuid;

use super::entity::{Entity, LiveEntityId};
use crate::rest::{
    ApiState,
    credentials::Actor,
    extract::{Json, Path},
    public::Credentials,
    routing::{self, Route},
};

/// The path of one entity.
#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct EntityPath {
    /// The ID of the entity to read. An ID that names a draft is answered with `400`.
    entity_id: LiveEntityId,
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
                WebId::new(Uuid::from_u128(0x8D86C8C3_D66D_43D1_859B_676C3BCAEADC)),
                EntityUuid::new(Uuid::from_u128(0xBE2C5B2F_E3E1_4F26_A0C4_0F8B5E9C4A1D)),
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

    Ok(Json(Entity::new(entity_id, entity)))
}

fn document_get_entity(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("getEntity")
        .summary("Get an entity")
        .description(
            "Returns the entity's ID, the entity types, the provenance, and the properties with \
             the data types and provenance of their values, of its current edition. \
             `propertyMetadata` leaves out a value without a stored data type, and a list that \
             contains one.",
        )
}

pub(super) fn route<S>() -> Route<ApiState<S>>
where
    S: StorePool + Send + Sync + 'static,
{
    routing::get(get_entity::<S>, document_get_entity)
}
