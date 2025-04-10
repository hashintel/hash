use uuid::Uuid;

use self::{
    actor::{Actor, ActorId, ActorType, AiId, MachineId, UserId},
    actor_group::{ActorGroup, ActorGroupId, ActorGroupType, TeamId, WebId},
    role::{Role, RoleId, RoleType, TeamRoleId, WebRoleId},
};

pub mod actor;
pub mod actor_group;
pub mod role;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, derive_more::Display)]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::FromSql, postgres_types::ToSql),
    postgres(name = "principal_type", rename_all = "snake_case")
)]
pub enum PrincipalType {
    User,
    Machine,
    Ai,
    Web,
    Team,
    WebRole,
    TeamRole,
}

impl From<ActorType> for PrincipalType {
    fn from(actor_type: ActorType) -> Self {
        match actor_type {
            ActorType::User => Self::User,
            ActorType::Machine => Self::Machine,
            ActorType::Ai => Self::Ai,
        }
    }
}

impl From<ActorGroupType> for PrincipalType {
    fn from(actor_group_type: ActorGroupType) -> Self {
        match actor_group_type {
            ActorGroupType::Web => Self::Web,
            ActorGroupType::Team => Self::Team,
        }
    }
}

impl From<RoleType> for PrincipalType {
    fn from(role_type: RoleType) -> Self {
        match role_type {
            RoleType::Web => Self::WebRole,
            RoleType::Team => Self::TeamRole,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, derive_more::Display, derive_more::From)]
pub enum PrincipalId {
    Actor(ActorId),
    ActorGroup(ActorGroupId),
    Role(RoleId),
}

impl PrincipalId {
    #[must_use]
    pub fn new(uuid: Uuid, principal_type: PrincipalType) -> Self {
        match principal_type {
            PrincipalType::User => Self::Actor(ActorId::User(UserId::new(uuid))),
            PrincipalType::Machine => Self::Actor(ActorId::Machine(MachineId::new(uuid))),
            PrincipalType::Ai => Self::Actor(ActorId::Ai(AiId::new(uuid))),
            PrincipalType::Web => Self::ActorGroup(ActorGroupId::Web(WebId::new(uuid))),
            PrincipalType::Team => Self::ActorGroup(ActorGroupId::Team(TeamId::new(uuid))),
            PrincipalType::WebRole => Self::Role(RoleId::Web(WebRoleId::new(uuid))),
            PrincipalType::TeamRole => Self::Role(RoleId::Team(TeamRoleId::new(uuid))),
        }
    }

    #[must_use]
    pub const fn principal_type(self) -> PrincipalType {
        match self {
            Self::Actor(ActorId::User(_)) => PrincipalType::User,
            Self::Actor(ActorId::Machine(_)) => PrincipalType::Machine,
            Self::Actor(ActorId::Ai(_)) => PrincipalType::Ai,
            Self::ActorGroup(ActorGroupId::Web(_)) => PrincipalType::Web,
            Self::ActorGroup(ActorGroupId::Team(_)) => PrincipalType::Team,
            Self::Role(RoleId::Web(_)) => PrincipalType::WebRole,
            Self::Role(RoleId::Team(_)) => PrincipalType::TeamRole,
        }
    }
}

impl From<PrincipalId> for Uuid {
    fn from(principal_id: PrincipalId) -> Self {
        match principal_id {
            PrincipalId::Actor(actor_id) => actor_id.into(),
            PrincipalId::ActorGroup(actor_group_id) => actor_group_id.into(),
            PrincipalId::Role(role_id) => role_id.into(),
        }
    }
}

#[cfg(feature = "postgres")]
impl postgres_types::ToSql for PrincipalId {
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
            Self::Actor(actor_id) => actor_id.to_sql(ty, out),
            Self::ActorGroup(actor_group_id) => actor_group_id.to_sql(ty, out),
            Self::Role(role_id) => role_id.to_sql(ty, out),
        }
    }
}

#[derive(Debug, derive_more::From)]
pub enum Principal {
    Actor(Actor),
    Team(ActorGroup),
    Role(Role),
}

impl Principal {
    #[must_use]
    pub const fn id(&self) -> PrincipalId {
        match self {
            Self::Actor(actor) => PrincipalId::Actor(actor.id()),
            Self::Team(actor_group) => PrincipalId::ActorGroup(actor_group.id()),
            Self::Role(role) => PrincipalId::Role(role.id()),
        }
    }
}
