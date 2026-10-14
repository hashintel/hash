//! `GET /{entityId}`: one entity by its ID.

use alloc::borrow::Cow;
use core::error::Error;

use aide::{axum::ApiRouter, transform::TransformOperation};
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

use crate::rest::{
    ApiState,
    credentials::Actor,
    extract::{Json, Path},
    public::Credentials,
    routing,
};

/// The path of one entity.
#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct EntityPath {
    /// The ID of the entity to read.
    entity_id: EntityId,
}

/// An entity the caller may view.
#[derive(Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct Entity {
    /// The ID of the entity.
    entity_id: EntityId,
}

/// The entity does not exist, or the caller may not view it.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("No entity `{entity_id}` is visible to the caller.")]
struct EntityNotFound {
    #[serde(skip)]
    entity_id: EntityId,
}

impl ProblemVariant for EntityNotFound {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Not Found"),
        status: StatusCode::NOT_FOUND,
    };

    fn example() -> Option<Self> {
        Some(Self {
            entity_id: EntityId {
                web_id: WebId::new(Uuid::from_u128(0x8D86_C8C3_D66D_43D1_859B_676C_3BCA_EADC)),
                entity_uuid: EntityUuid::new(Uuid::from_u128(
                    0xBE2C_5B2F_E3E1_4F26_A0C4_0F8B_5E9C_4A1D,
                )),
                draft_id: None,
            },
        })
    }
}

/// The ways `GET /{entityId}` refuses a request.
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
    NotFound(EntityId),
    #[display("no store could be acquired")]
    Unavailable,
    #[display("the store could not be read")]
    Store,
}

impl Error for GetEntityError {}

impl Expose<GetEntityProblem> for Report<GetEntityError> {
    fn expose(&self) -> Answer<'_, GetEntityProblem> {
        match self.current_context() {
            GetEntityError::NotFound(entity_id) => Answer::new(EntityNotFound {
                entity_id: *entity_id,
            }),
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
    let store = state
        .acquire()
        .await
        .change_context(GetEntityError::Unavailable)?;
    let entity = store
        .get_entity_by_id(Some(actor.into()), entity_id, None, None)
        .await
        .change_context(GetEntityError::Store)?
        .ok_or_else(|| Report::new(GetEntityError::NotFound(entity_id)))?;

    Ok(Json(Entity {
        entity_id: entity.metadata.record_id.entity_id,
    }))
}

fn document_get_entity(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation
        .id("getEntity")
        .summary("Get an entity")
        .description(
            "Returns the current edition of the entity, or of the draft the ID names. Answers \
             `404` both when the entity does not exist and when the caller may not view it.",
        )
}

pub(super) fn routes<S>() -> ApiRouter<ApiState<S>>
where
    S: StorePool + Send + Sync + 'static,
{
    ApiRouter::new()
        .api_route(
            "/{entityId}",
            routing::get(get_entity::<S>, document_get_entity),
        )
        .with_path_items(|path| path.tag("Entity"))
}
