use type_system::principal::{
    PrincipalType,
    actor::{ActorEntityUuid, AiId, MachineId, UserId},
    actor_group::{ActorGroupEntityUuid, TeamId, WebId},
    role::RoleName,
};
use uuid::Uuid;

use crate::store::postgres::query::{
    ColumnName, PostgresType, Table, TableName,
    rows::{ColumnParameters, PostgresRow},
    table::DatabaseColumn,
};

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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum UserActor {
    Id,
}

impl DatabaseColumn<'_> for UserActor {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Id => "id".into(),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(UserActor, ColumnParameters<'_>)> {
        let mut ids = Vec::with_capacity(rows.len());
        for Self { id } in rows {
            ids.push(id);
        }
        vec![(UserActor::Id, ids.into())]
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum MachineActor {
    Id,
    Identifier,
}

impl DatabaseColumn<'_> for MachineActor {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Id => "id".into(),
            Self::Identifier => "identifier".into(),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(MachineActor, ColumnParameters<'_>)> {
        let mut ids = Vec::with_capacity(rows.len());
        let mut identifiers = Vec::with_capacity(rows.len());
        for Self { id, identifier } in rows {
            ids.push(id);
            identifiers.push(identifier);
        }
        vec![
            (MachineActor::Id, ids.into()),
            (MachineActor::Identifier, identifiers.into()),
        ]
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum AiActor {
    Id,
    Identifier,
}

impl DatabaseColumn<'_> for AiActor {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Id => "id".into(),
            Self::Identifier => "identifier".into(),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(AiActor, ColumnParameters<'_>)> {
        let mut ids = Vec::with_capacity(rows.len());
        let mut identifiers = Vec::with_capacity(rows.len());
        for Self { id, identifier } in rows {
            ids.push(id);
            identifiers.push(identifier);
        }
        vec![
            (AiActor::Id, ids.into()),
            (AiActor::Identifier, identifiers.into()),
        ]
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Web {
    Id,
    Shortname,
}

impl DatabaseColumn<'_> for Web {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Id => "id".into(),
            Self::Shortname => "shortname".into(),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(Web, ColumnParameters<'_>)> {
        let mut ids = Vec::with_capacity(rows.len());
        let mut shortnames = Vec::with_capacity(rows.len());
        for Self { id, shortname } in rows {
            ids.push(id);
            shortnames.push(shortname);
        }
        vec![(Web::Id, ids.into()), (Web::Shortname, shortnames.into())]
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Team {
    Id,
    ParentId,
    Name,
}

impl DatabaseColumn<'_> for Team {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Id => "id".into(),
            Self::ParentId => "parent_id".into(),
            Self::Name => "name".into(),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(Team, ColumnParameters<'_>)> {
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
            (Team::Id, ids.into()),
            (Team::ParentId, parent_ids.into()),
            (Team::Name, names.into()),
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

impl DatabaseColumn<'_> for Role {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Id => "id".into(),
            Self::PrincipalType => "principal_type".into(),
            Self::ActorGroupId => "actor_group_id".into(),
            Self::Name => "name".into(),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(Role, ColumnParameters<'_>)> {
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
            (Role::Id, ids.into()),
            (Role::PrincipalType, principal_types.into()),
            (Role::ActorGroupId, actor_group_ids.into()),
            (Role::Name, names.into()),
        ]
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ActorRole {
    ActorId,
    RoleId,
}

impl DatabaseColumn<'_> for ActorRole {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::ActorId => "actor_id".into(),
            Self::RoleId => "role_id".into(),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(ActorRole, ColumnParameters<'_>)> {
        let mut actor_ids = Vec::with_capacity(rows.len());
        let mut role_ids = Vec::with_capacity(rows.len());
        for Self { actor_id, role_id } in rows {
            actor_ids.push(actor_id);
            role_ids.push(role_id);
        }
        vec![
            (ActorRole::ActorId, actor_ids.into()),
            (ActorRole::RoleId, role_ids.into()),
        ]
    }
}
