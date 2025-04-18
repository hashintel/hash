use std::collections::HashSet;

use uuid::Uuid;

use super::ActorEntityUuid;
use crate::{knowledge::entity::id::EntityUuid, principal::role::RoleId};

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    serde::Serialize,
    serde::Deserialize,
    derive_more::Display,
)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::ToSql, postgres_types::FromSql),
    postgres(transparent)
)]
#[repr(transparent)]
pub struct AiId(
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "Brand<ActorEntityUuid, \"AiId\">")
    )]
    ActorEntityUuid,
);

impl AiId {
    #[must_use]
    pub fn new(actor_entity_uuid: impl Into<Uuid>) -> Self {
        Self(ActorEntityUuid::new(actor_entity_uuid))
    }
}

impl From<AiId> for ActorEntityUuid {
    fn from(ai_id: AiId) -> Self {
        ai_id.0
    }
}

impl From<AiId> for EntityUuid {
    fn from(ai_id: AiId) -> Self {
        ai_id.0.into()
    }
}

impl From<AiId> for Uuid {
    fn from(ai_id: AiId) -> Self {
        ai_id.0.into()
    }
}

#[derive(Debug)]
pub struct Ai {
    pub id: AiId,
    pub roles: HashSet<RoleId>,
}
