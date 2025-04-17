pub mod error;

use core::error::Error;
use std::collections::{
    HashSet,
    hash_map::{Entry, HashMap},
};

use error_stack::{Report, bail, ensure};
use type_system::{
    knowledge::property::PropertyObjectWithMetadata,
    ontology::VersionedUrl,
    principal::{
        actor::{Actor, ActorEntityUuid, ActorId, ActorType, Machine, MachineId, User, UserId},
        actor_group::{ActorGroup, ActorGroupEntityUuid, ActorGroupId, Team, TeamId, Web, WebId},
        role::{Role, RoleId, RoleName, TeamRole, TeamRoleId, WebRole, WebRoleId},
    },
};
use uuid::Uuid;

use self::error::{
    ActorCreationError, ContextCreationError, EnsureSystemPoliciesError, GetPoliciesError,
    GetSystemAccountError, PolicyStoreError, RoleAssignmentError, TeamCreationError,
    TeamRoleCreationError, WebCreationError, WebRoleCreationError,
};
use super::{ContextBuilder, Policy, PolicyId, principal::PrincipalConstraint};

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
        web_id: WebId,
    },
    Team {
        team_id: TeamId,
        parent: ActorGroupId,
    },
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct CreateUserParameter {
    pub entity_type_id: VersionedUrl,
    pub properties: PropertyObjectWithMetadata,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct CreateWebParameter {
    pub id: Option<Uuid>,
    pub administrator: ActorId,
    pub shortname: Option<String>,
    pub is_actor_web: bool,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateWebResponse {
    pub web_id: WebId,
    pub machine_id: MachineId,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "kebab-case")]
pub enum RoleAssignmentStatus {
    NewlyAssigned,
    AlreadyAssigned,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "kebab-case")]
pub enum RoleUnassignmentStatus {
    Unassigned,
    NotAssigned,
}

#[trait_variant::make(PrincipalStore: Send)]
pub trait LocalPrincipalStore {
    /// Searches for the system account and returns its ID.
    ///
    /// If the system account does not exist, it is created. Calling this function
    /// also implies basic permissions on the system account, so it can be used to
    /// further configure the system.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`StoreError`]: GetSystemAccountError::StoreError
    async fn get_or_create_system_actor(
        &mut self,
        identifier: &str,
    ) -> Result<MachineId, Report<GetSystemAccountError>>;

    /// Ensures that the system actor policies are present.
    ///
    /// This includes:
    /// - Creating the system machine "h" if it does not exist
    /// - Ensuring that the necessary policies for the system actor are present
    ///
    /// # Errors
    ///
    /// - [`CreatingSystemMachineFailed`] if the system machine could not be created
    /// - [`SynchronizeActions`] if the actions could not be synchronized
    /// - [`ReadPoliciesFailed`] if the policies could not be read
    /// - [`AddRequiredPoliciesFailed`] if a required policies could not be added
    /// - [`RemoveOldPolicyFailed`] if an old policy could not be removed
    ///
    /// [`CreatingSystemMachineFailed`]: EnsureSystemPoliciesError::CreatingSystemMachineFailed
    /// [`SynchronizeActions`]: EnsureSystemPoliciesError::SynchronizeActions
    /// [`ReadPoliciesFailed`]: EnsureSystemPoliciesError::ReadPoliciesFailed
    /// [`AddRequiredPoliciesFailed`]: EnsureSystemPoliciesError::AddRequiredPoliciesFailed
    /// [`RemoveOldPolicyFailed`]: EnsureSystemPoliciesError::RemoveOldPolicyFailed
    async fn ensure_system_policies(&mut self) -> Result<(), Report<EnsureSystemPoliciesError>>;

    /// Creates a new web and returns its ID.
    ///
    /// # Errors
    ///
    /// - [`AlreadyExists`] if the web already exists
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`AlreadyExists`]: WebCreationError::AlreadyExists
    /// [`StoreError`]: WebCreationError::StoreError
    async fn create_web(
        &mut self,
        actor: ActorId,
        parameter: CreateWebParameter,
    ) -> Result<CreateWebResponse, Report<WebCreationError>>;

    /// Assigns an actor to a role.
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
    async fn assign_role(
        &mut self,
        actor: ActorEntityUuid,
        actor_to_assign: ActorEntityUuid,
        actor_group_id: ActorGroupEntityUuid,
        name: RoleName,
    ) -> Result<RoleAssignmentStatus, Report<RoleAssignmentError>>;

    /// Checks if the actor is assigned to a role within the specified actor group.
    ///
    /// If the actor has a role assigned, the [`RoleName`] is returned.
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
    async fn is_assigned(
        &mut self,
        actor_id: ActorId,
        actor_group_id: ActorGroupId,
    ) -> Result<Option<RoleName>, Report<RoleAssignmentError>>;

    /// Unassigns an actor from a role.
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
    async fn unassign_role(
        &mut self,
        actor: ActorEntityUuid,
        actor_to_unassign: ActorEntityUuid,
        actor_group_id: ActorGroupEntityUuid,
        name: RoleName,
    ) -> Result<RoleUnassignmentStatus, Report<RoleAssignmentError>>;
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
    fn create_user(&mut self, web_id: WebId) -> Result<UserId, Report<ActorCreationError>>;

    /// Creates a new machine and returns its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`StoreError`]: ActorCreationError::StoreError
    fn create_machine(
        &mut self,
        identifier: String,
    ) -> Result<MachineId, Report<ActorCreationError>>;

    /// Creates a new web and returns its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`StoreError`]: WebCreationError::StoreError
    fn create_web(&mut self, shortname: Option<String>) -> Result<WebId, Report<WebCreationError>>;

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
        web_id: WebId,
        name: RoleName,
    ) -> Result<WebRoleId, Report<WebRoleCreationError>>;

    /// Creates a new team and returns its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`StoreError`]: TeamCreationError::StoreError
    fn create_team(
        &mut self,
        parent_id: ActorGroupId,
        name: String,
    ) -> Result<TeamId, Report<TeamCreationError>>;

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
        team_id: TeamId,
        name: RoleName,
    ) -> Result<TeamRoleId, Report<TeamRoleCreationError>>;

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
        actor_group_id: ActorGroupId,
        name: RoleName,
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
        actor_group_id: ActorGroupId,
        name: RoleName,
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
    Team(ActorGroupId),
}

impl From<&PrincipalConstraint> for PrincipalIndex {
    fn from(constraint: &PrincipalConstraint) -> Self {
        match constraint {
            PrincipalConstraint::Actor { actor } => Self::Actor(*actor),
            PrincipalConstraint::ActorType { actor_type } => Self::ActorType(*actor_type),
            PrincipalConstraint::ActorGroup {
                actor_group: team,
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
    teams: HashMap<ActorGroupId, ActorGroup>,
    actors: HashMap<ActorId, Actor>,
    role_ids: HashMap<(ActorGroupId, RoleName), RoleId>,
    roles: HashMap<RoleId, Role>,
    policies: HashMap<PrincipalIndex, HashMap<PolicyId, Policy>>,
}

impl PolicyStore for MemoryPolicyStore {
    fn create_user(&mut self, web_id: WebId) -> Result<UserId, Report<ActorCreationError>> {
        ensure!(
            self.teams.contains_key(&ActorGroupId::Web(web_id)),
            ActorCreationError::WebNotFound { web_id }
        );

        let user_id = UserId::new(web_id);
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
        identifier: String,
    ) -> Result<MachineId, Report<ActorCreationError>> {
        let machine_id = MachineId::new(Uuid::new_v4());
        self.actors.insert(
            ActorId::Machine(machine_id),
            Actor::Machine(Machine {
                id: machine_id,
                identifier,
                roles: HashSet::new(),
            }),
        );

        Ok(machine_id)
    }

    fn create_web(&mut self, shortname: Option<String>) -> Result<WebId, Report<WebCreationError>> {
        let web_id = WebId::new(Uuid::new_v4());
        self.teams.insert(
            ActorGroupId::Web(web_id),
            ActorGroup::Web(Web {
                id: web_id,
                shortname,
                roles: HashSet::new(),
            }),
        );
        Ok(web_id)
    }

    fn create_web_role(
        &mut self,
        web_id: WebId,
        name: RoleName,
    ) -> Result<WebRoleId, Report<WebRoleCreationError>> {
        let Some(ActorGroup::Web(web)) = self.teams.get_mut(&ActorGroupId::Web(web_id)) else {
            bail!(WebRoleCreationError::WebNotFound { web_id })
        };

        let role_id = WebRoleId::new(Uuid::new_v4());
        web.roles.insert(role_id);
        self.role_ids
            .insert((ActorGroupId::Web(web_id), name), RoleId::Web(role_id));
        self.roles.insert(
            RoleId::Web(role_id),
            Role::Web(WebRole {
                id: role_id,
                web_id,
                name,
            }),
        );

        Ok(role_id)
    }

    fn create_team(
        &mut self,
        parent_id: ActorGroupId,
        name: String,
    ) -> Result<TeamId, Report<TeamCreationError>> {
        let team_id = TeamId::new(Uuid::new_v4());
        self.teams.insert(
            ActorGroupId::Team(team_id),
            ActorGroup::Team(Team {
                id: team_id,
                parent_id,
                roles: HashSet::new(),
                name,
            }),
        );
        Ok(team_id)
    }

    fn create_team_role(
        &mut self,
        team_id: TeamId,
        name: RoleName,
    ) -> Result<TeamRoleId, Report<TeamRoleCreationError>> {
        let Some(ActorGroup::Team(team)) = self.teams.get_mut(&ActorGroupId::Team(team_id)) else {
            bail!(TeamRoleCreationError::TeamNotFound { team_id })
        };

        let role_id = TeamRoleId::new(Uuid::new_v4());
        team.roles.insert(role_id);
        self.role_ids
            .insert((ActorGroupId::Team(team_id), name), RoleId::Team(role_id));
        self.roles.insert(
            RoleId::Team(role_id),
            Role::Team(TeamRole {
                id: role_id,
                team_id,
                name,
            }),
        );

        Ok(role_id)
    }

    fn assign_role(
        &mut self,
        actor_id: ActorId,
        actor_group_id: ActorGroupId,
        name: RoleName,
    ) -> Result<(), Report<RoleAssignmentError>> {
        let Some(actor) = self.actors.get_mut(&actor_id) else {
            bail!(RoleAssignmentError::ActorNotFound { actor_id })
        };
        let role_id = self.role_ids.get(&(actor_group_id, name)).ok_or(
            RoleAssignmentError::RoleNotFound {
                actor_group_id,
                name,
            },
        )?;

        match actor {
            Actor::User(user) => {
                user.roles.insert(*role_id);
            }
            Actor::Machine(machine) => {
                machine.roles.insert(*role_id);
            }
            Actor::Ai(ai) => {
                ai.roles.insert(*role_id);
            }
        }
        Ok(())
    }

    fn unassign_role(
        &mut self,
        actor_id: ActorId,
        actor_group_id: ActorGroupId,
        name: RoleName,
    ) -> Result<(), Report<RoleAssignmentError>> {
        let Some(actor) = self.actors.get_mut(&actor_id) else {
            bail!(RoleAssignmentError::ActorNotFound { actor_id })
        };
        let role_id = self.role_ids.get(&(actor_group_id, name)).ok_or(
            RoleAssignmentError::RoleNotFound {
                actor_group_id,
                name,
            },
        )?;

        match actor {
            Actor::User(user) => {
                user.roles.remove(role_id);
            }
            Actor::Machine(machine) => {
                machine.roles.remove(role_id);
            }
            Actor::Ai(ai) => {
                ai.roles.remove(role_id);
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
                            Role::Web(WebRole {
                                id,
                                web_id,
                                name: _,
                            }) => [
                                PrincipalIndex::Role(RoleId::Web(*id)),
                                PrincipalIndex::Team(ActorGroupId::Web(*web_id)),
                            ],
                            Role::Team(TeamRole {
                                id,
                                team_id,
                                name: _,
                            }) => [
                                PrincipalIndex::Role(RoleId::Team(*id)),
                                PrincipalIndex::Team(ActorGroupId::Team(*team_id)),
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
