use core::error::Error;
use std::collections::{
    HashSet,
    hash_map::{Entry, HashMap},
};

use either::Either;
use hash_graph_types::owned_by_id::OwnedById;
use uuid::Uuid;

use super::{
    ContextBuilder, Policy, PolicyId,
    principal::{
        ActorId, PrincipalConstraint,
        machine::{Machine, MachineId, MachinePrincipalConstraint},
        role::RoleId,
        team::{Team, TeamId, TeamPrincipalConstraint, TeamRoleId},
        user::{User, UserId, UserPrincipalConstraint},
        web::{Web, WebPrincipalConstraint, WebRoleId, WebTeam, WebTeamId, WebTeamRoleId},
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

pub trait PolicyStore {
    fn create_web(&mut self) -> OwnedById;

    fn create_user(&mut self, web_id: OwnedById) -> UserId;

    fn create_machine(&mut self, web_id: OwnedById) -> MachineId;

    fn create_team(&mut self) -> TeamId;

    fn create_web_team(&mut self, web_id: OwnedById) -> WebTeamId;

    fn create_web_role(&mut self, web_id: OwnedById) -> WebRoleId;

    fn create_team_role(&mut self, team_id: TeamId) -> TeamRoleId;

    fn create_web_team_role(&mut self, web_id: OwnedById, team_id: WebTeamId) -> WebTeamRoleId;

    fn assign_role(&mut self, actor: ActorId, role: RoleId) -> Result<(), PolicyStoreError>;

    fn unassign_role(&mut self, actor: ActorId, role: &RoleId) -> Result<(), PolicyStoreError>;

    fn extend_context(&self, context: &mut ContextBuilder, actor: ActorId);

    fn create_policy(&mut self, policy: Policy);

    /// Returns a set of policies that apply to the given actor.
    ///
    /// The returned set can be used to determine whether the actor has access to the resources
    /// they are trying to access. However, it may include policies that apply to any actor, but
    /// not to the given actor. This means that not all policies in the returned set are relevant
    /// to the actor.
    ///
    /// This includes:
    /// - Unspecified policies that apply to all actors
    /// - Policies specific to this actor
    /// - Policies for any roles the actor has
    /// - Policies for any webs/teams the actor has access to through their roles
    ///
    /// # Errors
    ///
    /// Returns an error if the actor is not known to
    fn get_policies(&self, actor: ActorId) -> impl Iterator<Item = &Policy>;
}

#[derive(Debug)]
enum Actor {
    User(User),
    Machine(Machine),
}

impl Actor {
    fn roles(&self) -> impl Iterator<Item = &RoleId> {
        match self {
            Self::User(user) => user.roles.iter(),
            Self::Machine(machine) => machine.roles.iter(),
        }
    }
}

#[derive(Debug)]
pub enum Role {
    Web {
        id: WebRoleId,
        web_id: OwnedById,
    },
    Team {
        id: TeamRoleId,
        team_id: TeamId,
    },
    WebTeam {
        id: WebTeamRoleId,
        web_id: OwnedById,
        team_id: WebTeamId,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum PrincipalIndex {
    Unspecified,
    Actor(ActorId),
    Role(RoleId),
    Web(OwnedById),
    Team(TeamId),
    WebTeam(WebTeamId),
}

impl From<&WebPrincipalConstraint> for PrincipalIndex {
    fn from(constraint: &WebPrincipalConstraint) -> Self {
        match constraint {
            WebPrincipalConstraint::InWeb { id: Some(id) } => Self::Web(*id),
            WebPrincipalConstraint::InRole {
                role_id: Some(role_id),
            } => Self::Role(RoleId::Web(*role_id)),
            WebPrincipalConstraint::InTeam {
                team_id: Some(team_id),
            } => Self::WebTeam(*team_id),
            WebPrincipalConstraint::InTeamRole {
                team_role_id: Some(team_role_id),
            } => Self::Role(RoleId::WebTeam(*team_role_id)),
            WebPrincipalConstraint::InWeb { id: None }
            | WebPrincipalConstraint::InRole { role_id: None }
            | WebPrincipalConstraint::InTeam { team_id: None }
            | WebPrincipalConstraint::InTeamRole { team_role_id: None } => Self::Unspecified,
        }
    }
}

impl From<&TeamPrincipalConstraint> for PrincipalIndex {
    fn from(constraint: &TeamPrincipalConstraint) -> Self {
        match constraint {
            TeamPrincipalConstraint::InTeam { id: Some(id) } => Self::Team(*id),
            TeamPrincipalConstraint::InRole {
                role_id: Some(role_id),
            } => Self::Role(RoleId::Team(*role_id)),
            TeamPrincipalConstraint::InTeam { id: None }
            | TeamPrincipalConstraint::InRole { role_id: None } => Self::Unspecified,
        }
    }
}

impl From<&UserPrincipalConstraint> for PrincipalIndex {
    fn from(constraint: &UserPrincipalConstraint) -> Self {
        match constraint {
            UserPrincipalConstraint::Exact {
                user_id: Some(user_id),
            } => Self::Actor(ActorId::User(*user_id)),
            UserPrincipalConstraint::Web(web) => Self::from(web),
            UserPrincipalConstraint::Team(team) => Self::from(team),
            UserPrincipalConstraint::Any {} | UserPrincipalConstraint::Exact { user_id: None } => {
                Self::Unspecified
            }
        }
    }
}

impl From<&MachinePrincipalConstraint> for PrincipalIndex {
    fn from(constraint: &MachinePrincipalConstraint) -> Self {
        match constraint {
            MachinePrincipalConstraint::Exact {
                machine_id: Some(machine_id),
            } => Self::Actor(ActorId::Machine(*machine_id)),
            MachinePrincipalConstraint::Web(web) => Self::from(web),
            MachinePrincipalConstraint::Team(team) => Self::from(team),
            MachinePrincipalConstraint::Any {}
            | MachinePrincipalConstraint::Exact { machine_id: None } => Self::Unspecified,
        }
    }
}

impl From<&PrincipalConstraint> for PrincipalIndex {
    fn from(constraint: &PrincipalConstraint) -> Self {
        match constraint {
            PrincipalConstraint::Public {} => Self::Unspecified,
            PrincipalConstraint::User(user) => Self::from(user),
            PrincipalConstraint::Machine(machine) => Self::from(machine),
            PrincipalConstraint::Web(web) => Self::from(web),
            PrincipalConstraint::Team(team) => Self::from(team),
        }
    }
}

#[derive(Debug, Default)]
pub struct MemoryPolicyStore {
    webs: HashMap<OwnedById, Web>,
    teams: HashMap<TeamId, Team>,
    actors: HashMap<ActorId, Actor>,
    roles: HashMap<RoleId, Role>,
    policies: HashMap<PrincipalIndex, HashMap<PolicyId, Policy>>,
}

impl PolicyStore for MemoryPolicyStore {
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
                self.roles.insert(
                    RoleId::Web(role_id),
                    Role::Web {
                        id: role_id,
                        web_id,
                    },
                );
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
                self.roles.insert(
                    RoleId::Team(role_id),
                    Role::Team {
                        id: role_id,
                        team_id,
                    },
                );
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
                self.roles.insert(
                    RoleId::WebTeam(role_id),
                    Role::WebTeam {
                        id: role_id,
                        web_id,
                        team_id,
                    },
                );
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

    fn unassign_role(&mut self, actor: ActorId, role: &RoleId) -> Result<(), PolicyStoreError> {
        let Some(actor) = self.actors.get_mut(&actor) else {
            todo!("Implement role unassignment error handling")
        };

        match actor {
            Actor::User(user) => {
                user.roles.remove(role);
            }
            Actor::Machine(machine) => {
                machine.roles.remove(role);
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

    fn create_policy(&mut self, policy: Policy) {
        let principal = PrincipalIndex::from(&policy.principal);
        self.policies
            .entry(principal)
            .or_default()
            .insert(policy.id, policy);
    }

    fn get_policies(&self, actor: ActorId) -> impl Iterator<Item = &Policy> {
        [PrincipalIndex::Unspecified, PrincipalIndex::Actor(actor)]
            .into_iter()
            .chain(
                self.actors
                    .get(&actor)
                    .unwrap_or_else(|| todo!("Implement actor not found error handling"))
                    .roles()
                    .flat_map(|role_id| match &self.roles[role_id] {
                        Role::Team { id, team_id } => Either::Left(
                            [
                                PrincipalIndex::Role(RoleId::Team(*id)),
                                PrincipalIndex::Team(*team_id),
                            ]
                            .into_iter(),
                        ),
                        Role::Web { id, web_id } => Either::Left(
                            [
                                PrincipalIndex::Role(RoleId::Web(*id)),
                                PrincipalIndex::Web(*web_id),
                            ]
                            .into_iter(),
                        ),
                        Role::WebTeam {
                            id,
                            web_id,
                            team_id,
                        } => Either::Right(
                            [
                                PrincipalIndex::Role(RoleId::WebTeam(*id)),
                                PrincipalIndex::WebTeam(*team_id),
                                PrincipalIndex::Web(*web_id),
                            ]
                            .into_iter(),
                        ),
                    }),
            )
            .flat_map(|principal_index| {
                self.policies
                    .get(&principal_index)
                    .into_iter()
                    .flat_map(HashMap::values)
            })
    }
}
