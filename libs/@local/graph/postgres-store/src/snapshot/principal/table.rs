use postgres_types::ToSql;
use type_system::principal::{
    PrincipalType,
    actor::{ActorEntityUuid, AiId, MachineId, UserId},
    actor_group::{ActorGroupEntityUuid, TeamId, WebId},
    role::RoleName,
};
use uuid::Uuid;

#[derive(Debug, ToSql)]
#[postgres(name = "user_actor")]
pub struct UserActorRow {
    pub id: UserId,
}

#[derive(Debug, ToSql)]
#[postgres(name = "machine_actor")]
pub struct MachineActorRow {
    pub id: MachineId,
    pub identifier: String,
}

#[derive(Debug, ToSql)]
#[postgres(name = "ai_actor")]
pub struct AiActorRow {
    pub id: AiId,
    pub identifier: String,
}

#[derive(Debug, ToSql)]
#[postgres(name = "web")]
pub struct WebRow {
    pub id: WebId,
    pub shortname: Option<String>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "team")]
pub struct TeamRow {
    pub id: TeamId,
    pub parent_id: ActorGroupEntityUuid,
    pub name: String,
}

#[derive(Debug, ToSql)]
#[postgres(name = "role")]
pub struct RoleRow {
    pub id: Uuid,
    pub principal_type: PrincipalType,
    pub actor_group_id: ActorGroupEntityUuid,
    pub name: RoleName,
}

#[derive(Debug, ToSql)]
#[postgres(name = "actor_role")]
pub struct ActorRoleRow {
    pub actor_id: ActorEntityUuid,
    pub role_id: Uuid,
}
