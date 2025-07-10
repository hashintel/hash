pub mod error;

use alloc::borrow::Cow;
use core::error::Error;
use std::collections::{
    HashSet,
    hash_map::{Entry, HashMap},
};

use error_stack::{Report, bail, ensure};
use type_system::{
    knowledge::{entity::id::EntityEditionId, property::PropertyObjectWithMetadata},
    ontology::VersionedUrl,
    principal::{
        actor::{Actor, ActorEntityUuid, ActorId, ActorType, Machine, MachineId, User, UserId},
        actor_group::{ActorGroup, ActorGroupEntityUuid, ActorGroupId, Team, TeamId, Web, WebId},
        role::{Role, RoleId, RoleName, TeamRole, TeamRoleId, WebRole, WebRoleId},
    },
};
use uuid::Uuid;

use self::error::{
    ActorCreationError, BuildDataTypeContextError, BuildEntityContextError,
    BuildEntityTypeContextError, BuildPrincipalContextError, BuildPropertyTypeContextError,
    ContextCreationError, CreatePolicyError, DetermineActorError, EnsureSystemPoliciesError,
    GetPoliciesError, GetSystemAccountError, PolicyStoreError, RemovePolicyError,
    RoleAssignmentError, TeamCreationError, TeamRoleCreationError, TeamRoleError,
    UpdatePolicyError, WebCreationError, WebRoleCreationError, WebRoleError,
};
use super::{
    ContextBuilder, Effect, Policy, PolicyId,
    action::ActionName,
    principal::{PrincipalConstraint, actor::AuthenticatedActor},
    resource::{
        DataTypeResource, EntityResource, EntityTypeResource, PropertyTypeResource,
        ResourceConstraint,
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

/// Parameters passed to [`PolicyStore::create_policy`].
///
/// This struct is used to create a new policy in the backing store. It contains the effect of the
/// policy, the principal to which it applies, the actions that are allowed or denied, and the
/// resource to which it applies.
///
/// See [`create_policy`] for more details.
///
/// [`create_policy`]: PolicyStore::create_policy
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[serde(rename_all = "kebab-case", deny_unknown_fields)]
pub struct PolicyCreationParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub effect: Effect,
    pub principal: Option<PrincipalConstraint>,
    pub actions: Vec<ActionName>,
    pub resource: Option<ResourceConstraint>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[serde(rename_all = "kebab-case", tag = "filter", deny_unknown_fields)]
pub enum PrincipalFilter {
    Unconstrained,
    Constrained(PrincipalConstraint),
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PolicyFilter {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub principal: Option<PrincipalFilter>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolvePoliciesParams<'a> {
    pub actor: Option<ActorId>,
    pub actions: Cow<'a, [ActionName]>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)]
pub enum PolicyUpdateOperation {
    AddAction {
        action: ActionName,
    },
    RemoveAction {
        action: ActionName,
    },
    #[serde(rename_all = "camelCase")]
    SetResourceConstraint {
        resource_constraint: Option<ResourceConstraint>,
    },
    #[serde(rename_all = "camelCase")]
    SetEffect {
        effect: Effect,
    },
}

#[trait_variant::make(Send)]
pub trait PolicyStore {
    /// Creates a new policy in the backing store.
    ///
    /// Inserts the [`Policy`] as specified in the [`PolicyCreationParams`] and returns its
    /// [`PolicyId`] if successful. The implementation must ensure the referenced principal
    /// exists and the policy has at least one action.
    ///
    /// # Errors
    ///
    /// - [`PolicyAlreadyExists`] if a policy with the same ID already exists
    /// - [`PrincipalNotFound`] if the referenced principal does not exist
    /// - [`PolicyHasNoActions`] if the policy is missing actions
    /// - [`ActionNotFound`] if any of the actions do not exist
    /// - [`StoreError`] if a database or storage level error occurs
    ///
    /// [`PolicyAlreadyExists`]: CreatePolicyError::PolicyAlreadyExists
    /// [`PrincipalNotFound`]: CreatePolicyError::PrincipalNotFound
    /// [`PolicyHasNoActions`]: CreatePolicyError::PolicyHasNoActions
    /// [`ActionNotFound`]: CreatePolicyError::ActionNotFound
    /// [`StoreError`]: CreatePolicyError::StoreError
    async fn create_policy(
        &mut self,
        authenticated_actor: AuthenticatedActor,
        policy: PolicyCreationParams,
    ) -> Result<PolicyId, Report<CreatePolicyError>>;

    /// Retrieves a policy by its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`StoreError`]: GetPoliciesError::StoreError
    async fn get_policy_by_id(
        &self,
        authenticated_actor: AuthenticatedActor,
        id: PolicyId,
    ) -> Result<Option<Policy>, Report<GetPoliciesError>>;

    /// Queries for policies in the local store that match the provided filter.
    ///
    /// This method queries the underlying policy store using the given [`PolicyFilter`] and returns
    /// a list of matching [`Policy`] objects. The filter can be used to specify criteria such as
    /// policy type, subject, resource, or action.
    ///
    /// Note that this does not resolve indirect policies (e.g., policies applying to roles held by
    /// a specific actor). For resolving all policies applicable to an actor, including indirect
    /// ones, use [`resolve_policies_for_actor`].
    ///
    /// [`resolve_policies_for_actor`]: Self::resolve_policies_for_actor
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`StoreError`]: GetPoliciesError::StoreError
    async fn query_policies(
        &self,
        authenticated_actor: AuthenticatedActor,
        filter: &PolicyFilter,
    ) -> Result<Vec<Policy>, Report<GetPoliciesError>>;

    /// Resolves all policies that apply to the given actor, including both direct and indirect
    /// associations.
    ///
    /// This method queries the underlying policy store to find policies that are relevant to the
    /// specified actor. The policies returned may include those that apply to the actor directly,
    /// as well as policies that apply to any roles the actor has.
    ///
    /// This provides a complete set of policies that apply to an actor, including all policies that
    ///   - apply to the actor itself,
    ///   - apply to the actor's roles,
    ///   - apply to the actor's groups, and
    ///   - apply to the actor's parent groups (for teams).
    ///
    /// # Errors
    ///
    /// - [`ActorNotFound`] if the target actor does not exist in the store.
    /// - [`StoreError`] if the underlying store encounters an error during resolution.
    ///
    /// [`ActorNotFound`]: GetPoliciesError::ActorNotFound
    /// [`StoreError`]: GetPoliciesError::StoreError
    async fn resolve_policies_for_actor(
        &self,
        authenticated_actor: AuthenticatedActor,
        params: ResolvePoliciesParams,
    ) -> Result<Vec<Policy>, Report<GetPoliciesError>>;

    /// Updates the policy specified by its ID.
    ///
    /// All specified operations are applied to the policy in the order they are provided.
    ///
    /// # Errors
    ///
    /// - [`PolicyNotFound`] if the policy does not exist
    /// - [`ActionNotFound`] if any of the actions do not exist
    /// - [`PolicyHasNoActions`] if the update would result in the policy not having any actions
    /// - [`StoreError`] if a database or storage level error occurs
    ///
    /// [`PolicyNotFound`]: UpdatePolicyError::PolicyNotFound
    /// [`ActionNotFound`]: UpdatePolicyError::ActionNotFound
    /// [`PolicyHasNoActions`]: UpdatePolicyError::PolicyHasNoActions
    /// [`StoreError`]: UpdatePolicyError::StoreError
    async fn update_policy_by_id(
        &mut self,
        authenticated_actor: AuthenticatedActor,
        policy_id: PolicyId,
        operations: &[PolicyUpdateOperation],
    ) -> Result<Policy, Report<UpdatePolicyError>>;

    /// Archives the policy specified by its ID.
    ///
    /// # Errors
    ///
    /// - [`PolicyNotFound`] if the policy does not exist
    /// - [`StoreError`] if a database or storage level error occurs
    ///
    /// [`PolicyNotFound`]: RemovePolicyError::PolicyNotFound
    /// [`StoreError`]: RemovePolicyError::StoreError
    async fn archive_policy_by_id(
        &mut self,
        authenticated_actor: AuthenticatedActor,
        policy_id: PolicyId,
    ) -> Result<(), Report<RemovePolicyError>>;

    /// Permanently removes the policy specified by its ID.
    ///
    /// This should be used with caution, as it will irreversibly delete the policy and all
    /// associated data. In most cases, it is recommended to archive the policy instead of
    /// deleting it. In most cases, you should use [`archive_policy_by_id`] instead.
    ///
    /// [`archive_policy_by_id`]: Self::archive_policy_by_id
    ///
    /// # Errors
    ///
    /// - [`PolicyNotFound`] if the policy does not exist
    /// - [`StoreError`] if a database or storage level error occurs
    ///
    /// [`PolicyNotFound`]: RemovePolicyError::PolicyNotFound
    /// [`StoreError`]: RemovePolicyError::StoreError
    async fn delete_policy_by_id(
        &mut self,
        authenticated_actor: AuthenticatedActor,
        policy_id: PolicyId,
    ) -> Result<(), Report<RemovePolicyError>>;

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
    async fn seed_system_policies(&mut self) -> Result<(), Report<EnsureSystemPoliciesError>>;

    /// Builds a context used to evaluate policies for a set of entity types.
    ///
    /// # Errors
    ///
    /// - If a database error occurs
    fn build_entity_type_context(
        &self,
        entity_type_ids: &[&VersionedUrl],
    ) -> impl Future<
        Output = Result<Vec<EntityTypeResource<'_>>, Report<[BuildEntityTypeContextError]>>,
    > + Send;

    /// Builds a context used to evaluate policies for a set of property types.
    ///
    /// # Errors
    ///
    /// - If a database error occurs
    fn build_property_type_context(
        &self,
        property_type_ids: &[&VersionedUrl],
    ) -> impl Future<
        Output = Result<Vec<PropertyTypeResource<'_>>, Report<[BuildPropertyTypeContextError]>>,
    > + Send;

    /// Builds a context used to evaluate policies for a set of data types.
    ///
    /// # Errors
    ///
    /// - If a database error occurs
    fn build_data_type_context(
        &self,
        data_type_ids: &[&VersionedUrl],
    ) -> impl Future<Output = Result<Vec<DataTypeResource<'_>>, Report<[BuildDataTypeContextError]>>>
    + Send;

    /// Builds a context used to evaluate policies for a set of entities.
    ///
    /// # Errors
    ///
    /// - If a database error occurs
    fn build_entity_context(
        &self,
        entity_edition_ids: &[EntityEditionId],
    ) -> impl Future<
        Output = Result<Vec<EntityResource<'static>>, Report<[BuildEntityContextError]>>,
    > + Send;
}

#[trait_variant::make(Send)]
pub trait PrincipalStore {
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
    async fn get_or_create_system_machine(
        &mut self,
        identifier: &str,
    ) -> Result<MachineId, Report<GetSystemAccountError>>;

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

    /// Returns all roles assigned to the given web.
    ///
    /// # Errors
    ///
    /// - [`NotFound`] if the web does not exist
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`NotFound`]: WebRoleError::NotFound
    /// [`StoreError`]: WebRoleError::StoreError
    async fn get_web_roles(
        &mut self,
        actor: ActorEntityUuid,
        web_id: WebId,
    ) -> Result<HashMap<WebRoleId, WebRole>, Report<WebRoleError>>;

    /// Returns all roles assigned to the given team.
    ///
    /// # Errors
    ///
    /// - [`NotFound`] if the team does not exist
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`NotFound`]: TeamRoleError::NotFound
    /// [`StoreError`]: TeamRoleError::StoreError
    async fn get_team_roles(
        &mut self,
        actor: ActorEntityUuid,
        team_id: TeamId,
    ) -> Result<HashMap<TeamRoleId, TeamRole>, Report<TeamRoleError>>;

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
        actor_id: ActorEntityUuid,
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
    async fn get_actor_group_role(
        &mut self,
        actor_id: ActorEntityUuid,
        actor_group_id: ActorGroupEntityUuid,
    ) -> Result<Option<RoleName>, Report<RoleAssignmentError>>;

    /// Returns the actors assigned to the given role within the specified actor group.
    ///
    /// # Errors
    ///
    /// - [`RoleNotFound`] if the role does not exist
    /// - [`StoreError`] if the underlying store returns an error
    ///
    /// [`RoleNotFound`]: RoleAssignmentError::RoleNotFound
    /// [`StoreError`]: RoleAssignmentError::StoreError
    async fn get_role_assignments(
        &mut self,
        actor_group_id: ActorGroupEntityUuid,
        role: RoleName,
    ) -> Result<Vec<ActorEntityUuid>, Report<RoleAssignmentError>>;

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
        actor_id: ActorEntityUuid,
        actor_to_unassign: ActorEntityUuid,
        actor_group_id: ActorGroupEntityUuid,
        name: RoleName,
    ) -> Result<RoleUnassignmentStatus, Report<RoleAssignmentError>>;

    /// Determines the type of an actor by its ID.
    ///
    /// Returns `None` if the ID is the public actor.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    /// - [`ActorNotFound`] if the actor with the given ID doesn't exist
    ///
    /// [`StoreError`]: DetermineActorError::StoreError
    /// [`ActorNotFound`]: DetermineActorError::ActorNotFound
    async fn determine_actor(
        &self,
        actor_entity_uuid: ActorEntityUuid,
    ) -> Result<Option<ActorId>, Report<DetermineActorError>>;

    /// Builds a context used to evaluate policies for an actor.
    ///
    /// # Errors
    ///
    /// - [`ActorNotFound`] if the actor with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`ActorNotFound`]: BuildPrincipalContextError::ActorNotFound
    /// [`StoreError`]: BuildPrincipalContextError::StoreError
    async fn build_principal_context(
        &self,
        actor_id: ActorId,
        context_builder: &mut ContextBuilder,
    ) -> Result<(), Report<BuildPrincipalContextError>>;
}

pub trait OldPolicyStore {
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

#[expect(
    clippy::indexing_slicing,
    reason = "Deprecated implementation which is not used outside of tests"
)]
impl OldPolicyStore for MemoryPolicyStore {
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
