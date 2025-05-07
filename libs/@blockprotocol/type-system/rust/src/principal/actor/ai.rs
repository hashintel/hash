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
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::ToSql, postgres_types::FromSql),
    postgres(transparent)
)]
#[repr(transparent)]
pub struct AiId(ActorEntityUuid);

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

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Ai {
    pub id: AiId,
    pub identifier: String,
    pub roles: HashSet<RoleId>,
}
