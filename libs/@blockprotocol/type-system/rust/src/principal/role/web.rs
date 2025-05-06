use uuid::Uuid;

use super::RoleName;
use crate::principal::actor_group::WebId;

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
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::ToSql, postgres_types::FromSql),
    postgres(transparent)
)]
#[repr(transparent)]
pub struct WebRoleId(
    #[cfg_attr(target_arch = "wasm32", tsify(type = "Brand<string, \"WebRoleId\">"))] Uuid,
);

impl WebRoleId {
    #[must_use]
    pub fn new(uuid: impl Into<Uuid>) -> Self {
        Self(uuid.into())
    }
}

impl From<WebRoleId> for Uuid {
    fn from(web_role_id: WebRoleId) -> Self {
        web_role_id.0
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WebRole {
    pub id: WebRoleId,
    pub web_id: WebId,
    pub name: RoleName,
}
