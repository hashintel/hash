use core::error::Error;
use std::collections::{
    HashSet,
    hash_map::{Entry, HashMap},
};

use hash_graph_types::owned_by_id::OwnedById;

use super::{
    principal::{
        machine::Machine, role::RoleId, team::TeamId, user::{User, UserId}, web::{WebRoleId, WebTeamId}, ActorId
    },
    resource::EntityResource,
};

#[derive(Debug, derive_more::Display)]
#[display("Actor with ID `{actor}` already exists")]
pub struct ActorInsertionError {
    actor: ActorId,
}

impl Error for ActorInsertionError {}

#[derive(Debug, derive_more::Display)]
#[display("Role with ID `{role}` already exists")]
pub struct RoleInsertionError {
    role: RoleId,
}

impl Error for RoleInsertionError {}

#[derive(Debug, derive_more::Display)]
pub enum PolicyStoreError {
    #[display("User with ID `{_0}` not found")]
    UserNotFound(UserId),

    #[display("Role with ID `{_0}` already assigned to user `{_1}`")]
    RoleAlreadyAssigned(RoleId, UserId),
}

impl Error for PolicyStoreError {}

pub trait PolicyStore {
    fn add_actor(
        &mut self,
        actor: ActorId,
        entity: EntityResource<'static>,
    ) -> Result<(), ActorInsertionError>;

    fn create_role(&mut self, role: RoleId) -> Result<(), RoleInsertionError>;

    fn assign_role(&mut self, actor: ActorId, role: RoleId) -> Result<(), PolicyStoreError>;
}

#[derive(Debug)]
struct Actor {
    roles: HashSet<RoleId>,
    entity: EntityResource<'static>,
}

#[derive(Debug)]
pub enum Role {
    Web { web_id: OwnedById},
    Team{ team_id: TeamId },
    WebTeam { web_id: OwnedById, team_id: TeamId },
}

#[derive(Debug)]
struct Web {
    roles: HashSet<WebRoleId>,
    teams: HashMap<WebTeamId, WebTeam>,
}

#[derive(Debug)]
struct Team {
    roles: HashSet<TeamRoleId>,
}

#[derive(Debug)]
struct WebTeam {
    roles: HashSet<WebTeamRoleId>,
}

#[derive(Debug, Default)]
pub struct MemoryPolicyStore {
    webs: HashMap<OwnedById, Web>,
    teams: HashMap<TeamId, Team>,
    actors: HashMap<ActorId, Actor>,
    roles: HashMap<RoleId, Role>,
}

impl PolicyStore for MemoryPolicyStore {
    fn add_actor(
        &mut self,
        actor: ActorId,
        entity: EntityResource<'static>,
    ) -> Result<(), ActorInsertionError> {
        match self.actors.entry(actor) {
            Entry::Occupied(_) => Err(ActorInsertionError { actor }),
            Entry::Vacant(entry) => {
                entry.insert(Actor {
                    roles: HashSet::new(),
                    entity,
                });
                Ok(())
            }
        }
    }

    fn create_role(&mut self, role: RoleId) -> Result<(), RoleInsertionError> {
        match self.roles.entry(role) {
            Entry::Occupied(_) => Err(RoleInsertionError { role }),
            Entry::Vacant(entry) => {
                entry.insert(Role {});
                Ok(())
            }
        }
    }

    fn assign_role(&mut self, actor: ActorId, role: RoleId) -> Result<(), PolicyStoreError> {
        match self.actors.entry(actor) {
            Entry::Occupied(_) => Err(ActorInsertionError { actor }),
            Entry::Vacant(entry) => {
                entry.insert(Actor {
                        roles: HashSet::new(),

}
