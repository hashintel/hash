use std::collections::HashSet;

use uuid::Uuid;

use super::ActorGroupEntityUuid;
use crate::{knowledge::entity::id::EntityUuid, principal::role::WebRoleId};

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
pub struct WebId(
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(type = "Brand<ActorEntityUuid | ActorGroupEntityUuid, \"WebId\">")
    )]
    ActorGroupEntityUuid,
);

impl WebId {
    #[must_use]
    pub fn new(actor_group_entity_uuid: impl Into<Uuid>) -> Self {
        Self(ActorGroupEntityUuid::new(actor_group_entity_uuid))
    }
}

impl From<WebId> for ActorGroupEntityUuid {
    fn from(web_id: WebId) -> Self {
        web_id.0
    }
}

impl From<WebId> for EntityUuid {
    fn from(web_id: WebId) -> Self {
        web_id.0.into()
    }
}

impl From<WebId> for Uuid {
    fn from(web_id: WebId) -> Self {
        web_id.0.into()
    }
}

#[derive(Debug)]
pub struct Web {
    pub id: WebId,
    pub roles: HashSet<WebRoleId>,
}
