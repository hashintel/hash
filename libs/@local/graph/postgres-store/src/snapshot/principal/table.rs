use postgres_types::ToSql;
use type_system::principal::{
    PrincipalType,
    actor::{ActorEntityUuid, AiId, MachineId, UserId},
    actor_group::{ActorGroupEntityUuid, TeamId, WebId},
    role::RoleName,
};
use uuid::Uuid;

#[derive(Debug)]
pub struct UserActorRow {
    pub id: UserId,
}

#[derive(Debug)]
pub struct MachineActorRow {
    pub id: MachineId,
    pub identifier: String,
}

#[derive(Debug)]
pub struct AiActorRow {
    pub id: AiId,
    pub identifier: String,
}

#[derive(Debug)]
pub struct WebRow {
    pub id: WebId,
    pub shortname: Option<String>,
}

#[derive(Debug)]
pub struct TeamRow {
    pub id: TeamId,
    pub parent_id: ActorGroupEntityUuid,
    pub name: String,
}

#[derive(Debug)]
pub struct RoleRow {
    pub id: Uuid,
    pub principal_type: PrincipalType,
    pub actor_group_id: ActorGroupEntityUuid,
    pub name: RoleName,
}

#[derive(Debug)]
pub struct ActorRoleRow {
    pub actor_id: ActorEntityUuid,
    pub role_id: Uuid,
}

use crate::store::postgres::query::{
    PostgresType, Table, TableName, rows::PostgresRow, table::DatabaseColumn,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum UserActor {
    Id,
}

impl DatabaseColumn for UserActor {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Id => "id",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Id => PostgresType::Uuid,
        }
    }
}

impl PostgresRow for UserActorRow {
    type Column = UserActor;

    fn table() -> TableName<'static> {
        Table::UserActor.into()
    }

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(UserActor, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut ids = Vec::with_capacity(rows.len());
        for Self { id } in rows {
            ids.push(id);
        }
        vec![(UserActor::Id, Box::new(ids))]
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum MachineActor {
    Id,
    Identifier,
}

impl DatabaseColumn for MachineActor {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Id => "id",
            Self::Identifier => "identifier",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Id => PostgresType::Uuid,
            Self::Identifier => PostgresType::Text,
        }
    }
}

impl PostgresRow for MachineActorRow {
    type Column = MachineActor;

    fn table() -> TableName<'static> {
        Table::MachineActor.into()
    }

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(MachineActor, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut ids = Vec::with_capacity(rows.len());
        let mut identifiers = Vec::with_capacity(rows.len());
        for Self { id, identifier } in rows {
            ids.push(id);
            identifiers.push(identifier);
        }
        vec![
            (MachineActor::Id, Box::new(ids)),
            (MachineActor::Identifier, Box::new(identifiers)),
        ]
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum AiActor {
    Id,
    Identifier,
}

impl DatabaseColumn for AiActor {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Id => "id",
            Self::Identifier => "identifier",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Id => PostgresType::Uuid,
            Self::Identifier => PostgresType::Text,
        }
    }
}

impl PostgresRow for AiActorRow {
    type Column = AiActor;

    fn table() -> TableName<'static> {
        Table::AiActor.into()
    }

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(AiActor, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut ids = Vec::with_capacity(rows.len());
        let mut identifiers = Vec::with_capacity(rows.len());
        for Self { id, identifier } in rows {
            ids.push(id);
            identifiers.push(identifier);
        }
        vec![
            (AiActor::Id, Box::new(ids)),
            (AiActor::Identifier, Box::new(identifiers)),
        ]
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Web {
    Id,
    Shortname,
}

impl DatabaseColumn for Web {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Id => "id",
            Self::Shortname => "shortname",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Id => PostgresType::Uuid,
            Self::Shortname => PostgresType::Text,
        }
    }
}

impl PostgresRow for WebRow {
    type Column = Web;

    fn table() -> TableName<'static> {
        Table::Web.into()
    }

    fn columnar_parameters<'r>(rows: &'r [Self]) -> Vec<(Web, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut ids = Vec::with_capacity(rows.len());
        let mut shortnames = Vec::with_capacity(rows.len());
        for Self { id, shortname } in rows {
            ids.push(id);
            shortnames.push(shortname);
        }
        vec![
            (Web::Id, Box::new(ids)),
            (Web::Shortname, Box::new(shortnames)),
        ]
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Team {
    Id,
    ParentId,
    Name,
}

impl DatabaseColumn for Team {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Id => "id",
            Self::ParentId => "parent_id",
            Self::Name => "name",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Id | Self::ParentId => PostgresType::Uuid,
            Self::Name => PostgresType::Text,
        }
    }
}

impl PostgresRow for TeamRow {
    type Column = Team;

    fn table() -> TableName<'static> {
        Table::Team.into()
    }

    fn columnar_parameters<'r>(rows: &'r [Self]) -> Vec<(Team, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut ids = Vec::with_capacity(rows.len());
        let mut parent_ids = Vec::with_capacity(rows.len());
        let mut names = Vec::with_capacity(rows.len());
        for Self {
            id,
            parent_id,
            name,
        } in rows
        {
            ids.push(id);
            parent_ids.push(parent_id);
            names.push(name);
        }
        vec![
            (Team::Id, Box::new(ids)),
            (Team::ParentId, Box::new(parent_ids)),
            (Team::Name, Box::new(names)),
        ]
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Role {
    Id,
    PrincipalType,
    ActorGroupId,
    Name,
}

impl DatabaseColumn for Role {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Id => "id",
            Self::PrincipalType => "principal_type",
            Self::ActorGroupId => "actor_group_id",
            Self::Name => "name",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Id | Self::ActorGroupId => PostgresType::Uuid,
            Self::PrincipalType => PostgresType::PrincipalType,
            Self::Name => PostgresType::Text,
        }
    }
}

impl PostgresRow for RoleRow {
    type Column = Role;

    fn table() -> TableName<'static> {
        Table::Role.into()
    }

    fn columnar_parameters<'r>(rows: &'r [Self]) -> Vec<(Role, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut ids = Vec::with_capacity(rows.len());
        let mut principal_types = Vec::with_capacity(rows.len());
        let mut actor_group_ids = Vec::with_capacity(rows.len());
        let mut names = Vec::with_capacity(rows.len());
        for Self {
            id,
            principal_type,
            actor_group_id,
            name,
        } in rows
        {
            ids.push(id);
            principal_types.push(principal_type);
            actor_group_ids.push(actor_group_id);
            names.push(name);
        }
        vec![
            (Role::Id, Box::new(ids)),
            (Role::PrincipalType, Box::new(principal_types)),
            (Role::ActorGroupId, Box::new(actor_group_ids)),
            (Role::Name, Box::new(names)),
        ]
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ActorRole {
    ActorId,
    RoleId,
}

impl DatabaseColumn for ActorRole {
    fn as_str(&self) -> &'static str {
        match self {
            Self::ActorId => "actor_id",
            Self::RoleId => "role_id",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::ActorId | Self::RoleId => PostgresType::Uuid,
        }
    }
}

impl PostgresRow for ActorRoleRow {
    type Column = ActorRole;

    fn table() -> TableName<'static> {
        Table::ActorRole.into()
    }

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(ActorRole, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut actor_ids = Vec::with_capacity(rows.len());
        let mut role_ids = Vec::with_capacity(rows.len());
        for Self { actor_id, role_id } in rows {
            actor_ids.push(actor_id);
            role_ids.push(role_id);
        }
        vec![
            (ActorRole::ActorId, Box::new(actor_ids)),
            (ActorRole::RoleId, Box::new(role_ids)),
        ]
    }
}
