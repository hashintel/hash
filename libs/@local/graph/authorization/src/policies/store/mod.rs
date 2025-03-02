use core::error::Error;
use std::collections::{
    HashSet,
    hash_map::{Entry, HashMap},
};

use hash_graph_types::owned_by_id::OwnedById;
use uuid::Uuid;

use super::{
    ContextBuilder,
    principal::{
        ActorId,
        machine::{Machine, MachineId},
        role::RoleId,
        team::{Team, TeamId, TeamRoleId},
        user::{User, UserId},
        web::{Web, WebRoleId, WebTeam, WebTeamId, WebTeamRoleId},
    },
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

pub enum RoleCreationParameter {
    Web {
        web_id: OwnedById,
    },
    Team {
        team_id: TeamId,
    },
    WebTeam {
        web_id: OwnedById,
        team_id: WebTeamId,
    },
}

pub trait PrincipalStore {
    fn create_web(&mut self) -> OwnedById;

    fn create_user(&mut self, web_id: OwnedById) -> UserId;

    fn create_machine(&mut self, web_id: OwnedById) -> MachineId;

    fn create_team(&mut self) -> TeamId;

    fn create_web_team(&mut self, web_id: OwnedById) -> WebTeamId;

    fn create_web_role(&mut self, web_id: OwnedById) -> WebRoleId;

    fn create_team_role(&mut self, team_id: TeamId) -> TeamRoleId;

    fn create_web_team_role(&mut self, web_id: OwnedById, team_id: WebTeamId) -> WebTeamRoleId;

    fn assign_role(&mut self, actor: ActorId, role: RoleId) -> Result<(), PolicyStoreError>;

    fn extend_context(&self, context: &mut ContextBuilder, actor: ActorId);
}

#[derive(Debug)]
enum Actor {
    User(User),
    Machine(Machine),
}

#[derive(Debug)]
pub enum Role {
    Web {
        web_id: OwnedById,
    },
    Team {
        team_id: TeamId,
    },
    WebTeam {
        web_id: OwnedById,
        team_id: WebTeamId,
    },
}

#[derive(Debug, Default)]
pub struct MemoryPrincipalStore {
    webs: HashMap<OwnedById, Web>,
    teams: HashMap<TeamId, Team>,
    actors: HashMap<ActorId, Actor>,
    roles: HashMap<RoleId, Role>,
}

impl PrincipalStore for MemoryPrincipalStore {
    fn create_web(&mut self) -> OwnedById {
        let web_id = OwnedById::new(Uuid::new_v4());
        self.webs.insert(
            web_id,
            Web {
                id: web_id,
                roles: HashSet::new(),
                teams: HashMap::new(),
            },
        );
        web_id
    }

    fn create_user(&mut self, web_id: OwnedById) -> UserId {
        if !self.webs.contains_key(&web_id) {
            todo!("Implement user creation error handling")
        }

        let user_id = UserId::new(web_id.into_uuid());
        let Entry::Vacant(entry) = self.actors.entry(ActorId::User(user_id)) else {
            todo!("Implement user creation error handling")
        };

        entry.insert(Actor::User(User {
            id: user_id,
            roles: HashSet::new(),
        }));
        user_id
    }

    fn create_machine(&mut self, web_id: OwnedById) -> MachineId {
        if !self.webs.contains_key(&web_id) {
            todo!("Implement machine creation error handling")
        }

        let machine_id = MachineId::new(Uuid::new_v4());
        let Entry::Vacant(entry) = self.actors.entry(ActorId::Machine(machine_id)) else {
            todo!("Implement machine creation error handling")
        };

        entry.insert(Actor::Machine(Machine {
            id: machine_id,
            roles: HashSet::new(),
        }));
        machine_id
    }

    fn create_team(&mut self) -> TeamId {
        loop {
            let team_id = TeamId::new(Uuid::new_v4());
            if let Entry::Vacant(entry) = self.teams.entry(team_id) {
                entry.insert(Team {
                    id: team_id,
                    roles: HashSet::new(),
                });
                break team_id;
            }
        }
    }

    fn create_web_team(&mut self, web_id: OwnedById) -> WebTeamId {
        let Some(web) = self.webs.get_mut(&web_id) else {
            todo!("Implement role creation error handling")
        };

        loop {
            let team_id = WebTeamId::new(Uuid::new_v4());
            if let Entry::Vacant(entry) = web.teams.entry(team_id) {
                entry.insert(WebTeam {
                    id: team_id,
                    web_id,
                    roles: HashSet::new(),
                });
                break team_id;
            }
        }
    }

    fn create_web_role(&mut self, web_id: OwnedById) -> WebRoleId {
        let Some(web) = self.webs.get_mut(&web_id) else {
            todo!("Implement role creation error handling")
        };

        loop {
            let role_id = WebRoleId::new(Uuid::new_v4());
            if web.roles.insert(role_id) {
                self.roles
                    .insert(RoleId::Web(role_id), Role::Web { web_id });
                break role_id;
            }
        }
    }

    fn create_team_role(&mut self, team_id: TeamId) -> TeamRoleId {
        let Some(team) = self.teams.get_mut(&team_id) else {
            todo!("Implement role creation error handling")
        };

        loop {
            let role_id = TeamRoleId::new(Uuid::new_v4());
            if team.roles.insert(role_id) {
                self.roles
                    .insert(RoleId::Team(role_id), Role::Team { team_id });
                break role_id;
            }
        }
    }

    fn create_web_team_role(&mut self, web_id: OwnedById, team_id: WebTeamId) -> WebTeamRoleId {
        let Some(web) = self.webs.get_mut(&web_id) else {
            todo!("Implement role creation error handling")
        };

        let Some(team) = web.teams.get_mut(&team_id) else {
            todo!("Implement role creation error handling")
        };

        loop {
            let role_id = WebTeamRoleId::new(Uuid::new_v4());
            if team.roles.insert(role_id) {
                self.roles
                    .insert(RoleId::WebTeam(role_id), Role::WebTeam { web_id, team_id });
                break role_id;
            }
        }
    }

    fn assign_role(&mut self, actor: ActorId, role: RoleId) -> Result<(), PolicyStoreError> {
        let Some(actor) = self.actors.get_mut(&actor) else {
            todo!("Implement role assignment error handling")
        };

        match actor {
            Actor::User(user) => {
                user.roles.insert(role);
            }
            Actor::Machine(machine) => {
                machine.roles.insert(role);
            }
        }
        Ok(())
    }

    fn extend_context(&self, context: &mut ContextBuilder, actor: ActorId) {
        let Some(actor) = self.actors.get(&actor) else {
            todo!("Implement context creation error handling")
        };

        match actor {
            Actor::User(user) => {
                context.add_user(user);
            }
            Actor::Machine(machine) => {
                context.add_machine(machine);
            }
        }
    }
}
