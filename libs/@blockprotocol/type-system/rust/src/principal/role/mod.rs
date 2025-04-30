mod team;
mod web;

use uuid::Uuid;

pub use self::{
    team::{TeamRole, TeamRoleId},
    web::{WebRole, WebRoleId},
};
use super::actor_group::ActorGroupId;

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
    specta::Type,
)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "kebab-case")]
pub enum RoleName {
    Administrator,
    Member,
}

#[cfg(feature = "postgres")]
impl postgres_types::ToSql for RoleName {
    postgres_types::accepts!(TEXT);

    postgres_types::to_sql_checked!();

    fn to_sql(
        &self,
        ty: &postgres_types::Type,
        out: &mut bytes::BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn core::error::Error + Sync + Send>>
    where
        Self: Sized,
    {
        match self {
            Self::Administrator => "Administrator".to_sql(ty, out),
            Self::Member => "Member".to_sql(ty, out),
        }
    }
}

#[cfg(feature = "postgres")]
impl<'a> postgres_types::FromSql<'a> for RoleName {
    postgres_types::accepts!(TEXT);

    fn from_sql(
        ty: &postgres_types::Type,
        raw: &'a [u8],
    ) -> Result<Self, Box<dyn core::error::Error + Sync + Send>> {
        match <&str>::from_sql(ty, raw)? {
            "Administrator" => Ok(Self::Administrator),
            "Member" => Ok(Self::Member),
            unknown => Err(format!("Unknown RoleName variant: {unknown}").into()),
        }
    }
}

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize, specta::Type,
)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(deny_unknown_fields, rename_all = "kebab-case")]
pub enum RoleType {
    Web,
    Team,
}

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
    derive_more::From,
    specta::Type,
)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "roleType", content = "id", rename_all = "camelCase")]
pub enum RoleId {
    Web(WebRoleId),
    Team(TeamRoleId),
}
impl RoleId {
    #[must_use]
    pub fn new(uuid: impl Into<Uuid>, role_type: RoleType) -> Self {
        match role_type {
            RoleType::Team => Self::Team(TeamRoleId::new(uuid)),
            RoleType::Web => Self::Web(WebRoleId::new(uuid)),
        }
    }

    #[must_use]
    pub const fn role_type(&self) -> RoleType {
        match self {
            Self::Team(_) => RoleType::Team,
            Self::Web(_) => RoleType::Web,
        }
    }
}

impl From<RoleId> for Uuid {
    fn from(actor_group: RoleId) -> Self {
        match actor_group {
            RoleId::Team(id) => id.into(),
            RoleId::Web(id) => id.into(),
        }
    }
}

#[cfg(feature = "postgres")]
impl postgres_types::ToSql for RoleId {
    postgres_types::accepts!(UUID);

    postgres_types::to_sql_checked!();

    fn to_sql(
        &self,
        ty: &postgres_types::Type,
        out: &mut bytes::BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn core::error::Error + Sync + Send>>
    where
        Self: Sized,
    {
        match self {
            Self::Team(team_id) => team_id.to_sql(ty, out),
            Self::Web(web_id) => web_id.to_sql(ty, out),
        }
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize, derive_more::From, specta::Type)]
#[cfg_attr(target_arch = "wasm32", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(tag = "roleType", rename_all = "camelCase")]
pub enum Role {
    Web(WebRole),
    Team(TeamRole),
}

impl Role {
    #[must_use]
    pub const fn id(&self) -> RoleId {
        match self {
            Self::Web(web_role) => RoleId::Web(web_role.id),
            Self::Team(team_role) => RoleId::Team(team_role.id),
        }
    }

    #[must_use]
    pub const fn actor_group_id(&self) -> ActorGroupId {
        match self {
            Self::Web(web_role) => ActorGroupId::Web(web_role.web_id),
            Self::Team(team_role) => ActorGroupId::Team(team_role.team_id),
        }
    }

    #[must_use]
    pub const fn name(&self) -> RoleName {
        match self {
            Self::Web(web_role) => web_role.name,
            Self::Team(team_role) => team_role.name,
        }
    }
}
