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
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::ToSql, postgres_types::FromSql),
    postgres(transparent)
)]
#[repr(transparent)]
pub struct WebId(ActorGroupEntityUuid);

impl WebId {
    /// Creates an ID from an existing UUID.
    #[must_use]
    pub const fn from_uuid(uuid: Uuid) -> Self {
        Self(ActorGroupEntityUuid::from_uuid(uuid))
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

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Web {
    pub id: WebId,
    pub shortname: Option<String>,
    #[cfg_attr(feature = "codegen", specta(skip))]
    pub roles: HashSet<WebRoleId>,
}
