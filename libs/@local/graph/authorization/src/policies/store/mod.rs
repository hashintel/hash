pub mod error;

use core::error::Error;
use std::collections::{
    HashSet,
    hash_map::{Entry, HashMap},
};

use error_stack::{Report, bail, ensure};
use type_system::{
    knowledge::entity::id::EntityUuid,
    provenance::{ActorEntityUuid, ActorId, ActorType, MachineId, UserId},
    web::OwnedById,
};
use uuid::Uuid;

use self::error::{
    ActorCreationError, ContextCreationError, GetPoliciesError, PolicyStoreError,
    RoleAssignmentError, SubteamCreationError, SubteamRoleCreationError, WebCreationError,
    WebRoleCreationError,
};
use super::{
    ContextBuilder, Policy, PolicyId,
    principal::{
        Actor, PrincipalConstraint,
        actor::Machine,
        role::{Role, RoleId, SubteamRole, SubteamRoleId, WebRole, WebRoleId},
        team::{Subteam, SubteamId, Team, TeamId, Web},
    },
};
use crate::policies::principal::actor::User;

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
    Web { web_id: OwnedById },
    Subteam { web_id: OwnedById, parent: TeamId },
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

    /// Creates a new machine and returns its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`StoreError`]: ActorCreationError::StoreError
    fn create_machine(&mut self) -> Result<MachineId, Report<ActorCreationError>>;

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

    /// Creates a new team and returns its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`StoreError`]: SubteamCreationError::StoreError
    fn create_subteam(&mut self, parent: TeamId)
    -> Result<SubteamId, Report<SubteamCreationError>>;

    /// Creates a new team role within the given team and returns its ID.
    ///
    /// # Errors
    ///
    /// - [`SubteamNotFound`] if the subteam does not exist
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`SubteamNotFound`]: SubteamRoleCreationError::SubteamNotFound
    /// [`StoreError`]: SubteamRoleCreationError::StoreError
    fn create_subteam_role(
        &mut self,
        subteam_id: SubteamId,
    ) -> Result<SubteamRoleId, Report<SubteamRoleCreationError>>;

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

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum PrincipalIndex {
    Unspecified,
    Actor(ActorId),
    ActorType(ActorType),
    Role(RoleId),
    Team(TeamId),
}

impl From<&PrincipalConstraint> for PrincipalIndex {
    fn from(constraint: &PrincipalConstraint) -> Self {
        match constraint {
            PrincipalConstraint::Actor { actor } => Self::Actor(*actor),
            PrincipalConstraint::ActorType { actor_type } => Self::ActorType(*actor_type),
            PrincipalConstraint::Team {
                team,
                actor_type: _,
            } => Self::Team(*team),
            PrincipalConstraint::Role {
                role,
                actor_type: _,
            } => Self::Role(*role),
        }
    }
}

#[derive(Debug, Default)]
pub struct MemoryPolicyStore {
    teams: HashMap<TeamId, Team>,
    actors: HashMap<ActorId, Actor>,
    roles: HashMap<RoleId, Role>,
    policies: HashMap<PrincipalIndex, HashMap<PolicyId, Policy>>,
}

impl PolicyStore for MemoryPolicyStore {
    fn create_user(&mut self, web_id: OwnedById) -> Result<UserId, Report<ActorCreationError>> {
        ensure!(
            self.teams.contains_key(&TeamId::Web(web_id)),
            ActorCreationError::WebNotFound { web_id }
        );

        let user_id = UserId::new(ActorEntityUuid::new(EntityUuid::new(web_id.into_uuid())));
        let Entry::Vacant(entry) = self.actors.entry(ActorId::User(user_id)) else {
            bail!(ActorCreationError::WebOccupied { web_id })
        };

        entry.insert(Actor::User(User {
            id: user_id,
            roles: HashSet::new(),
        }));

        Ok(user_id)
    }

    fn create_machine(&mut self) -> Result<MachineId, Report<ActorCreationError>> {
        let machine_id = MachineId::new(ActorEntityUuid::new(EntityUuid::new(Uuid::new_v4())));
        self.actors.insert(
            ActorId::Machine(machine_id),
            Actor::Machine(Machine {
                id: machine_id,
                roles: HashSet::new(),
            }),
        );

        Ok(machine_id)
    }

    fn create_web(&mut self) -> Result<OwnedById, Report<WebCreationError>> {
        let web_id = OwnedById::new(Uuid::new_v4());
        self.teams.insert(
            TeamId::Web(web_id),
            Team::Web(Web {
                id: web_id,
                roles: HashSet::new(),
            }),
        );
        Ok(web_id)
    }

    fn create_web_role(
        &mut self,
        web_id: OwnedById,
    ) -> Result<WebRoleId, Report<WebRoleCreationError>> {
        let Some(Team::Web(web)) = self.teams.get_mut(&TeamId::Web(web_id)) else {
            bail!(WebRoleCreationError::WebNotFound { web_id })
        };

        let role_id = WebRoleId::new(Uuid::new_v4());
        web.roles.insert(role_id);
        self.roles.insert(
            RoleId::Web(role_id),
            Role::Web(WebRole {
                id: role_id,
                web_id,
            }),
        );

        Ok(role_id)
    }

    fn create_subteam(
        &mut self,
        parent: TeamId,
    ) -> Result<SubteamId, Report<SubteamCreationError>> {
        let team_id = SubteamId::new(Uuid::new_v4());
        self.teams.insert(
            TeamId::Subteam(team_id),
            Team::Subteam(Subteam {
                id: team_id,
                parents: vec![parent],
                roles: HashSet::new(),
            }),
        );
        Ok(team_id)
    }

    fn create_subteam_role(
        &mut self,
        subteam_id: SubteamId,
    ) -> Result<SubteamRoleId, Report<SubteamRoleCreationError>> {
        let Some(Team::Subteam(subteam)) = self.teams.get_mut(&TeamId::Subteam(subteam_id)) else {
            bail!(SubteamRoleCreationError::SubteamNotFound { subteam_id })
        };

        let role_id = SubteamRoleId::new(Uuid::new_v4());
        subteam.roles.insert(role_id);
        self.roles.insert(
            RoleId::Subteam(role_id),
            Role::Subteam(SubteamRole {
                id: role_id,
                subteam_id,
            }),
        );

        Ok(role_id)
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
            Actor::Ai(ai) => {
                ai.roles.insert(role_id);
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
            Actor::Ai(ai) => {
                ai.roles.remove(&role_id);
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

        context.add_actor(actor);
        for role in actor.roles() {
            context.add_role(&self.roles[&role]);
        }

        Ok(())
    }

    fn store_policy(&mut self, policy: Policy) -> Result<(), Report<PolicyStoreError>> {
        let principal = policy
            .principal
            .as_ref()
            .map_or(PrincipalIndex::Unspecified, PrincipalIndex::from);
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
                .chain(
                    actor
                        .roles()
                        .flat_map(|role_id| match &self.roles[&role_id] {
                            Role::Web(WebRole { id, web_id }) => [
                                PrincipalIndex::Role(RoleId::Web(*id)),
                                PrincipalIndex::Team(TeamId::Web(*web_id)),
                            ],
                            Role::Subteam(SubteamRole { id, subteam_id }) => [
                                PrincipalIndex::Role(RoleId::Subteam(*id)),
                                PrincipalIndex::Team(TeamId::Subteam(*subteam_id)),
                            ],
                        }),
                )
                .flat_map(|principal_index| {
                    self.policies
                        .get(&principal_index)
                        .into_iter()
                        .flat_map(HashMap::values)
                }),
        )
    }
}
