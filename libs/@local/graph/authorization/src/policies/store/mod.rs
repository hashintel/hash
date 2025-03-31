pub mod error;

use core::error::Error;
use std::collections::{
    HashSet,
    hash_map::{Entry, HashMap},
};

use either::Either;
use error_stack::{Report, bail, ensure};
use type_system::web::OwnedById;
use uuid::Uuid;

use self::error::{
    ActorCreationError, ContextCreationError, GetPoliciesError, PolicyStoreError,
    RoleAssignmentError, TeamCreationError, TeamRoleCreationError, WebCreationError,
    WebRoleCreationError,
};
use super::{
    ContextBuilder, Policy, PolicyId,
    principal::{
        ActorId, PrincipalConstraint,
        machine::{Machine, MachineId, MachinePrincipalConstraint},
        role::RoleId,
        team::{
            StandaloneTeam, StandaloneTeamId, StandaloneTeamRole, StandaloneTeamRoleId,
            TeamPrincipalConstraint,
        },
        user::{User, UserId, UserPrincipalConstraint},
        web::{Web, WebPrincipalConstraint, WebRole, WebRoleId, WebTeamId, WebTeamRole},
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

pub enum RoleCreationParameter {
    Web {
        web_id: OwnedById,
    },
    Team {
        team_id: StandaloneTeamId,
    },
    WebTeam {
        web_id: OwnedById,
        team_id: WebTeamId,
    },
}

pub trait PolicyStore {
    /// Creates a new user within the given web and returns its ID.
    ///
    /// # Errors
    ///
    /// - [`WebNotFound`] if the web does not exist
    /// - [`WebOccupied`] if the web is already assigned
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`WebNotFound`]: ActorCreationError::WebNotFound
    /// [`WebOccupied`]: ActorCreationError::WebOccupied
    /// [`StoreError`]: ActorCreationError::StoreError
    fn create_user(&mut self, web_id: OwnedById) -> Result<UserId, Report<ActorCreationError>>;

    /// Creates a new machine within the given web and returns its ID.
    ///
    /// # Errors
    ///
    /// - [`WebNotFound`] if the web does not exist
    /// - [`WebOccupied`] if the web is already assigned
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`WebNotFound`]: ActorCreationError::WebNotFound
    /// [`WebOccupied`]: ActorCreationError::WebOccupied
    /// [`StoreError`]: ActorCreationError::StoreError
    fn create_machine(
        &mut self,
        web_id: OwnedById,
    ) -> Result<MachineId, Report<ActorCreationError>>;

    /// Creates a new team and returns its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`StoreError`]: TeamCreationError::StoreError
    fn create_team(&mut self) -> Result<StandaloneTeamId, Report<TeamCreationError>>;

    /// Creates a new team role within the given team and returns its ID.
    ///
    /// # Errors
    ///
    /// - [`TeamNotFound`] if the team does not exist
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`TeamNotFound`]: TeamRoleCreationError::TeamNotFound
    /// [`StoreError`]: TeamRoleCreationError::StoreError
    fn create_team_role(
        &mut self,
        team_id: StandaloneTeamId,
    ) -> Result<StandaloneTeamRoleId, Report<TeamRoleCreationError>>;

    /// Creates a new web and returns its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`StoreError`]: WebCreationError::StoreError
    fn create_web(&mut self) -> Result<OwnedById, Report<WebCreationError>>;

    /// Creates a new web role within the given web and returns its ID.
    ///
    /// # Errors
    ///
    /// - [`WebNotFound`] if the web does not exist
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`WebNotFound`]: WebRoleCreationError::WebNotFound
    /// [`StoreError`]: WebRoleCreationError::StoreError
    fn create_web_role(
        &mut self,
        web_id: OwnedById,
    ) -> Result<WebRoleId, Report<WebRoleCreationError>>;

    /// Assigns a role to an actor.
    ///
    /// # Errors
    ///
    /// - [`ActorNotFound`] if the actor does not exist
    /// - [`RoleNotFound`] if the role does not exist
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`ActorNotFound`]: RoleAssignmentError::ActorNotFound
    /// [`RoleNotFound`]: RoleAssignmentError::RoleNotFound
    /// [`StoreError`]: RoleAssignmentError::StoreError
    fn assign_role(
        &mut self,
        actor_id: ActorId,
        role_id: RoleId,
    ) -> Result<(), Report<RoleAssignmentError>>;

    /// Unassigns a role from an actor.
    ///
    /// # Errors
    ///
    /// - [`ActorNotFound`] if the actor does not exist
    /// - [`RoleNotFound`] if the role does not exist
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`ActorNotFound`]: RoleAssignmentError::ActorNotFound
    /// [`RoleNotFound`]: RoleAssignmentError::RoleNotFound
    /// [`StoreError`]: RoleAssignmentError::StoreError
    fn unassign_role(
        &mut self,
        actor_id: ActorId,
        role_id: RoleId,
    ) -> Result<(), Report<RoleAssignmentError>>;

    /// Extends the context by the actor and its assigned roles.
    ///
    /// # Errors
    ///
    /// - [`ActorNotFound`] if the actor does not exist
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`ActorNotFound`]: ContextCreationError::ActorNotFound
    /// [`StoreError`]: ContextCreationError::StoreError
    fn extend_context(
        &self,
        context: &mut ContextBuilder,
        actor_id: ActorId,
    ) -> Result<(), Report<ContextCreationError>>;

    /// Stores a policy.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`StoreError`]: PolicyStoreError::StoreError
    fn store_policy(&mut self, policy: Policy) -> Result<(), Report<PolicyStoreError>>;

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
    /// - [`ActorNotFound`] if the actor does not exist
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`ActorNotFound`]: GetPoliciesError::ActorNotFound
    /// [`StoreError`]: GetPoliciesError::StoreError
    fn get_policies(
        &self,
        actor_id: ActorId,
    ) -> Result<impl Iterator<Item = &Policy>, Report<GetPoliciesError>>;
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
    Web(WebRole),
    Team(StandaloneTeamRole),
    WebTeam(WebTeamRole),
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum PrincipalIndex {
    Unspecified,
    Actor(ActorId),
    Role(RoleId),
    Web(OwnedById),
    Team(StandaloneTeamId),
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
            } => Self::Role(RoleId::Subteam(*team_role_id)),
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
            } => Self::Role(RoleId::Standalone(*role_id)),
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
    teams: HashMap<StandaloneTeamId, StandaloneTeam>,
    actors: HashMap<ActorId, Actor>,
    roles: HashMap<RoleId, Role>,
    policies: HashMap<PrincipalIndex, HashMap<PolicyId, Policy>>,
}

impl PolicyStore for MemoryPolicyStore {
    fn create_user(&mut self, web_id: OwnedById) -> Result<UserId, Report<ActorCreationError>> {
        ensure!(
            self.webs.contains_key(&web_id),
            ActorCreationError::WebNotFound { web_id }
        );

        let user_id = UserId::new(web_id.into_uuid());
        let Entry::Vacant(entry) = self.actors.entry(ActorId::User(user_id)) else {
            bail!(ActorCreationError::WebOccupied { web_id })
        };

        entry.insert(Actor::User(User {
            id: user_id,
            roles: HashSet::new(),
        }));

        Ok(user_id)
    }

    fn create_machine(
        &mut self,
        web_id: OwnedById,
    ) -> Result<MachineId, Report<ActorCreationError>> {
        ensure!(
            self.webs.contains_key(&web_id),
            ActorCreationError::WebNotFound { web_id }
        );

        let machine_id = MachineId::new(Uuid::new_v4());
        let Entry::Vacant(entry) = self.actors.entry(ActorId::Machine(machine_id)) else {
            bail!(ActorCreationError::WebOccupied { web_id })
        };

        entry.insert(Actor::Machine(Machine {
            id: machine_id,
            roles: HashSet::new(),
        }));

        Ok(machine_id)
    }

    fn create_team(&mut self) -> Result<StandaloneTeamId, Report<TeamCreationError>> {
        loop {
            let team_id = StandaloneTeamId::new(Uuid::new_v4());
            if let Entry::Vacant(entry) = self.teams.entry(team_id) {
                entry.insert(StandaloneTeam {
                    id: team_id,
                    roles: HashSet::new(),
                });
                break Ok(team_id);
            }
        }
    }

    fn create_team_role(
        &mut self,
        team_id: StandaloneTeamId,
    ) -> Result<StandaloneTeamRoleId, Report<TeamRoleCreationError>> {
        let Some(team) = self.teams.get_mut(&team_id) else {
            bail!(TeamRoleCreationError::TeamNotFound { team_id })
        };

        loop {
            let role_id = StandaloneTeamRoleId::new(Uuid::new_v4());
            if team.roles.insert(role_id) {
                self.roles.insert(
                    RoleId::Standalone(role_id),
                    Role::Team(StandaloneTeamRole {
                        id: role_id,
                        team_id,
                    }),
                );
                break Ok(role_id);
            }
        }
    }

    fn create_web(&mut self) -> Result<OwnedById, Report<WebCreationError>> {
        let web_id = OwnedById::new(Uuid::new_v4());
        self.webs.insert(
            web_id,
            Web {
                id: web_id,
                roles: HashSet::new(),
            },
        );
        Ok(web_id)
    }

    fn create_web_role(
        &mut self,
        web_id: OwnedById,
    ) -> Result<WebRoleId, Report<WebRoleCreationError>> {
        let Some(web) = self.webs.get_mut(&web_id) else {
            bail!(WebRoleCreationError::WebNotFound { web_id })
        };

        loop {
            let role_id = WebRoleId::new(Uuid::new_v4());
            if web.roles.insert(role_id) {
                self.roles.insert(
                    RoleId::Web(role_id),
                    Role::Web(WebRole {
                        id: role_id,
                        web_id,
                    }),
                );
                break Ok(role_id);
            }
        }
    }

    fn assign_role(
        &mut self,
        actor_id: ActorId,
        role_id: RoleId,
    ) -> Result<(), Report<RoleAssignmentError>> {
        let Some(actor) = self.actors.get_mut(&actor_id) else {
            bail!(RoleAssignmentError::ActorNotFound { actor_id })
        };
        ensure!(
            self.roles.contains_key(&role_id),
            RoleAssignmentError::RoleNotFound { role_id }
        );

        match actor {
            Actor::User(user) => {
                user.roles.insert(role_id);
            }
            Actor::Machine(machine) => {
                machine.roles.insert(role_id);
            }
        }
        Ok(())
    }

    fn unassign_role(
        &mut self,
        actor_id: ActorId,
        role_id: RoleId,
    ) -> Result<(), Report<RoleAssignmentError>> {
        let Some(actor) = self.actors.get_mut(&actor_id) else {
            bail!(RoleAssignmentError::ActorNotFound { actor_id })
        };
        ensure!(
            self.roles.contains_key(&role_id),
            RoleAssignmentError::RoleNotFound { role_id }
        );

        match actor {
            Actor::User(user) => {
                user.roles.remove(&role_id);
            }
            Actor::Machine(machine) => {
                machine.roles.remove(&role_id);
            }
        }
        Ok(())
    }

    fn extend_context(
        &self,
        context: &mut ContextBuilder,
        actor_id: ActorId,
    ) -> Result<(), Report<ContextCreationError>> {
        let Some(actor) = self.actors.get(&actor_id) else {
            bail!(ContextCreationError::ActorNotFound { actor_id })
        };

        match actor {
            Actor::User(user) => {
                context.add_user(user);
            }
            Actor::Machine(machine) => {
                context.add_machine(machine);
            }
        }

        for role in actor.roles() {
            context.add_role(&self.roles[role]);
        }

        Ok(())
    }

    fn store_policy(&mut self, policy: Policy) -> Result<(), Report<PolicyStoreError>> {
        let principal = PrincipalIndex::from(&policy.principal);
        self.policies
            .entry(principal)
            .or_default()
            .insert(policy.id, policy);

        Ok(())
    }

    fn get_policies(
        &self,
        actor_id: ActorId,
    ) -> Result<impl Iterator<Item = &Policy>, Report<GetPoliciesError>> {
        let actor = self
            .actors
            .get(&actor_id)
            .ok_or(GetPoliciesError::ActorNotFound { actor_id })?;

        Ok(
            [PrincipalIndex::Unspecified, PrincipalIndex::Actor(actor_id)]
                .into_iter()
                .chain(actor.roles().flat_map(|role_id| {
                    match &self.roles[role_id] {
                        Role::Team(StandaloneTeamRole { id, team_id }) => Either::Left(
                            [
                                PrincipalIndex::Role(RoleId::Standalone(*id)),
                                PrincipalIndex::Team(*team_id),
                            ]
                            .into_iter(),
                        ),
                        Role::Web(WebRole { id, web_id }) => Either::Left(
                            [
                                PrincipalIndex::Role(RoleId::Web(*id)),
                                PrincipalIndex::Web(*web_id),
                            ]
                            .into_iter(),
                        ),
                        Role::WebTeam(WebTeamRole {
                            id,
                            web_id,
                            team_id,
                        }) => Either::Right(
                            [
                                PrincipalIndex::Role(RoleId::Subteam(*id)),
                                PrincipalIndex::WebTeam(*team_id),
                                PrincipalIndex::Web(*web_id),
                            ]
                            .into_iter(),
                        ),
                    }
                }))
                .flat_map(|principal_index| {
                    self.policies
                        .get(&principal_index)
                        .into_iter()
                        .flat_map(HashMap::values)
                }),
        )
    }
}
