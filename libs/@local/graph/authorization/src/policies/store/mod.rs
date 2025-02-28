use core::{error::Error, str::FromStr as _};
use std::{
    borrow::Cow,
    collections::{
        HashSet,
        hash_map::{Entry, HashMap},
        hash_set,
    },
    sync::LazyLock,
};

use hash_graph_types::{knowledge::entity::EntityUuid, owned_by_id::OwnedById};
use type_system::url::VersionedUrl;
use uuid::Uuid;

use super::{
    Context, ContextBuilder,
    principal::{
        ActorId,
        machine::{Machine, MachineId},
        role::RoleId,
        team::{TeamId, TeamRoleId},
        user::{User, UserId},
        web::{WebRoleId, WebTeamId, WebTeamRoleId},
    },
    resource::EntityResource,
};
use crate::policies::principal::user;

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

    fn create_user(&mut self, web: OwnedById) -> UserId;

    fn create_machine(&mut self, web: OwnedById) -> MachineId;

    fn create_team(&mut self, web: Option<OwnedById>) -> TeamId;

    fn create_role(&mut self, creation: RoleCreationParameter) -> RoleId;

    fn assign_role(&mut self, actor: ActorId, role: RoleId) -> Result<(), PolicyStoreError>;

    fn create_context(&mut self, actor: ActorId) -> Context;
}

#[derive(Debug)]
enum Actor {
    User(User),
    Machine(Machine),
}

impl Actor {
    fn roles(&self) -> impl Iterator<Item = &RoleId> {
        match self {
            Actor::User(user) => user.roles.iter(),
            Actor::Machine(machine) => machine.roles.iter(),
        }
    }
}

#[derive(Debug)]
pub enum Role {
    Web { web_id: OwnedById },
    Team { team_id: TeamId },
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
                roles: HashSet::new(),
                teams: HashMap::new(),
            },
        );
        web_id
    }

    fn create_user(&mut self, web_id: OwnedById) -> UserId {
        static ENTITY_TYPES: LazyLock<[VersionedUrl; 2]> = LazyLock::new(|| {
            [
                VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/user/v/6")
                    .expect("should be a valid URL"),
                VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/actor/v/2")
                    .expect("should be a valid URL"),
            ]
        });

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
            entity: EntityResource {
                id: EntityUuid::new(user_id.into_uuid()),
                web_id,
                entity_type: Cow::Borrowed(ENTITY_TYPES.as_slice()),
            },
        }));
        user_id
    }

    fn create_machine(&mut self, web_id: OwnedById) -> MachineId {
        static ENTITY_TYPES: LazyLock<[VersionedUrl; 2]> = LazyLock::new(|| {
            [
                VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/machine/v/2")
                    .expect("should be a valid URL"),
                VersionedUrl::from_str("https://hash.ai/@h/types/entity-type/actor/v/2")
                    .expect("should be a valid URL"),
            ]
        });

        if !self.webs.contains_key(&web_id) {
            todo!("Implement machine creation error handling")
        }

        let machine_id = MachineId::new(web_id.into_uuid());
        let Entry::Vacant(entry) = self.actors.entry(ActorId::Machine(machine_id)) else {
            todo!("Implement machine creation error handling")
        };

        entry.insert(Actor::Machine(Machine {
            id: machine_id,
            roles: HashSet::new(),
            entity: EntityResource {
                id: EntityUuid::new(machine_id.into_uuid()),
                web_id,
                entity_type: Cow::Borrowed(ENTITY_TYPES.as_slice()),
            },
        }));
        machine_id
    }

    fn create_team(&mut self, web_id: Option<OwnedById>) -> TeamId {
        if web_id.is_some() {
            todo!("Web-teams are not implemented yet");
        }

        loop {
            let team_id = TeamId::new(Uuid::new_v4());
            if let Entry::Vacant(entry) = self.teams.entry(team_id) {
                entry.insert(Team {
                    roles: HashSet::new(),
                });
                break team_id;
            }
        }
    }

    fn create_role(&mut self, creation: RoleCreationParameter) -> RoleId {
        match creation {
            RoleCreationParameter::Web { web_id } => {
                let Some(web) = self.webs.get_mut(&web_id) else {
                    todo!("Implement role creation error handling")
                };

                loop {
                    let role_id = WebRoleId::new(Uuid::new_v4());
                    if web.roles.insert(role_id) {
                        break RoleId::Web(role_id);
                    }
                }
            }
            RoleCreationParameter::Team { team_id } => {
                let Some(team) = self.teams.get_mut(&team_id) else {
                    todo!("Implement role creation error handling")
                };

                loop {
                    let role_id = TeamRoleId::new(Uuid::new_v4());
                    if team.roles.insert(role_id) {
                        break RoleId::Team(role_id);
                    }
                }
            }
            RoleCreationParameter::WebTeam { web_id, team_id } => {
                let Some(web) = self.webs.get_mut(&web_id) else {
                    todo!("Implement role creation error handling")
                };

                let Some(team) = web.teams.get_mut(&team_id) else {
                    todo!("Implement role creation error handling")
                };

                loop {
                    let role_id = WebTeamRoleId::new(Uuid::new_v4());
                    if team.roles.insert(role_id) {
                        break RoleId::WebTeam(role_id);
                    }
                }
            }
        }
    }

    fn assign_role(&mut self, actor: ActorId, role: RoleId) -> Result<(), PolicyStoreError> {
        let Some(actor) = self.actors.get_mut(&actor) else {
            todo!("Implement role assignment error handling")
        };

        actor.roles.insert(role);
        Ok(())
    }

    fn create_context(&mut self, actor: ActorId) -> Context {
        let Some(actor) = self.actors.get(&actor) else {
            todo!("Implement context creation error handling")
        };

        let mut context = ContextBuilder::default();

        for role_id in actor.roles() {
            match role_id {
                Role::Web { web_id } => {
                    context.add_web(web_id);
                }
                Role::Team { team_id } => todo!(),
                Role::WebTeam { web_id, team_id } => todo!(),
            }
        }

        match actor {
            Actor::User(user) => {
                context.add_user(&user);
            }
            Actor::Machine(machine) => {
                context.add_machine(&machine);
            }
        }

        context
            .build()
            .unwrap_or_else(|error| todo!("Implement context creation error handling: {error}"))
    }
}
