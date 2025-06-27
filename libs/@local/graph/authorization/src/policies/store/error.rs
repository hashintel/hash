use core::error::Error;
use std::collections::HashSet;

use type_system::{
    knowledge::entity::id::EntityEditionId,
    ontology::VersionedUrl,
    principal::{
        PrincipalId,
        actor::{ActorEntityUuid, ActorId},
        actor_group::{ActorGroupId, TeamId, WebId},
        role::RoleName,
    },
};

use crate::policies::{PolicyId, action::ActionName};

#[derive(Debug, derive_more::Display)]
#[display("Could not get system account: {_variant}")]
pub enum GetSystemAccountError {
    #[display("Creating system account failed")]
    CreateSystemAccountFailed,

    #[display("Creating system web failed")]
    CreatingSystemWebFailed,
    #[display("Creating instance admin team failed")]
    CreatingInstanceAdminTeamFailed,

    #[display("Store operation failed")]
    StoreError,
}

impl Error for GetSystemAccountError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not ensure system policies: {_variant}")]
pub enum EnsureSystemPoliciesError {
    #[display("Creating system machine failed")]
    CreatingSystemMachineFailed,

    #[display("Synchronizing actions failed")]
    SynchronizeActions,
    #[display("Reading policies failed")]
    ReadPoliciesFailed,
    #[display("Reading instance admin roles failed")]
    ReadInstanceAdminRoles,
    #[display("Adding required policies failed")]
    AddRequiredPoliciesFailed,
    #[display("Removing old policy failed")]
    RemoveOldPolicyFailed,
    #[display("Updating existing policy failed")]
    UpdatePolicyFailed,
    #[display("system policies require a name")]
    MissingPolicyName,

    #[display("Store operation failed")]
    StoreError,
}

impl Error for EnsureSystemPoliciesError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not build entity type context: {_variant}")]
pub enum BuildEntityTypeContextError {
    #[display("Entity type with ID `{entity_type_id}` does not exist")]
    EntityTypeNotFound { entity_type_id: VersionedUrl },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for BuildEntityTypeContextError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not build entity type context: {_variant}")]
pub enum BuildEntityContextError {
    #[display("Entity with editionID `{}` does not exist", entity_edition_id.as_uuid())]
    EntityNotFound { entity_edition_id: EntityEditionId },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for BuildEntityContextError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create actor: {_variant}")]
pub enum ActorCreationError {
    #[display("Web with ID `{web_id}` does not exist")]
    WebNotFound { web_id: WebId },
    #[display("Web with ID `{web_id}` is already assigned")]
    WebOccupied { web_id: WebId },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for ActorCreationError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create web: {_variant}")]
pub enum WebCreationError {
    #[display("Could not build policy components")]
    BuildPolicyComponents,
    #[display("Could not create policy set")]
    PolicySetCreation,
    #[display("Web with ID `{web_id}` already exists")]
    AlreadyExists { web_id: WebId },
    #[display("Permission to create web was denied")]
    NotAuthorized,
    #[display("Could not create web role")]
    RoleCreationError,
    #[display("Could not assign web role")]
    RoleAssignmentError,
    #[display("Could not create web machine")]
    MachineCreationError,
    #[display("Could not create default policies")]
    PolicyCreationError,
    #[display("Store operation failed")]
    StoreError,
}

impl Error for WebCreationError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create web: {_variant}")]
pub enum WebRoleError {
    #[display("Web with ID `{web_id}` does not exist")]
    NotFound { web_id: WebId },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for WebRoleError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create web role: {_variant}")]
pub enum WebRoleCreationError {
    #[display("Web with ID `{web_id}` does not exist")]
    WebNotFound { web_id: WebId },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for WebRoleCreationError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create team: {_variant}")]
pub enum TeamCreationError {
    #[display("Store operation failed")]
    StoreError,
}

impl Error for TeamCreationError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create team role: {_variant}")]
pub enum TeamRoleCreationError {
    #[display("Team with ID `{team_id}` does not exist")]
    TeamNotFound { team_id: TeamId },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for TeamRoleCreationError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create web: {_variant}")]
pub enum TeamRoleError {
    #[display("Team with ID `{team_id}` does not exist")]
    NotFound { team_id: TeamId },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for TeamRoleError {}

#[derive(Debug, derive_more::Display)]
#[display("Could change role assignment: {_variant}")]
pub enum RoleAssignmentError {
    #[display("Actor was not provided")]
    ActorNotProvided,
    #[display("Actor with ID `{actor_id}` does not exist")]
    ActorNotFound { actor_id: ActorId },
    #[display("{name} role for `{actor_group_id}` does not exist")]
    RoleNotFound {
        actor_group_id: ActorGroupId,
        name: RoleName,
    },
    #[display("Permission to add member to account group was denied")]
    PermissionDenied,
    #[display(
        "Actor with ID `{actor_id}` is already assigned to group `{group_id}` with role `{name}`"
    )]
    AlreadyAssigned {
        actor_id: ActorId,
        group_id: ActorGroupId,
        name: RoleName,
    },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for RoleAssignmentError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create context: {_variant}")]
pub enum ContextCreationError {
    #[display("Actor with ID `{actor_id}` does not exist")]
    ActorNotFound { actor_id: ActorId },
    #[display("Actor with ID `{actor_id}` is not a valid actor")]
    DetermineActor { actor_id: ActorEntityUuid },
    #[display("Could not build principal context for actor with ID `{actor_id}`")]
    BuildPrincipalContext { actor_id: ActorId },
    #[display("Could not build entity type context for entity types with IDs `{}`",
        entity_type_ids.iter().map(VersionedUrl::to_string).collect::<Vec<_>>().join(", "))]
    BuildEntityTypeContext {
        entity_type_ids: HashSet<VersionedUrl>,
    },
    #[display("Could not build entity context for entity with edition IDs `{}`",
        entity_edition_ids.iter().map(|id| id.as_uuid().to_string()).collect::<Vec<_>>().join(", "))]
    BuildEntityContext {
        entity_edition_ids: HashSet<EntityEditionId>,
    },
    #[display("Could not resolve policies for actor with ID `{}`", actor_id.map_or_else(ActorEntityUuid::public_actor, ActorEntityUuid::from))]
    ResolveActorPolicies { actor_id: Option<ActorId> },
    #[display("Could not create policy set")]
    CreatePolicySet,
    #[display("Could not create policy context")]
    CreatePolicyContext,
    #[display("Store operation failed")]
    StoreError,
}

impl Error for ContextCreationError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not determine actor: {_variant}")]
pub enum DetermineActorError {
    #[display("Actor with ID `{actor_entity_uuid}` does not exist")]
    ActorNotFound { actor_entity_uuid: ActorEntityUuid },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for DetermineActorError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not build principal context for actor with ID `{actor_id}`")]
pub enum BuildPrincipalContextError {
    #[display("Actor with ID `{actor_id}` does not exist")]
    ActorNotFound { actor_id: ActorId },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for BuildPrincipalContextError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not store policy: {_variant}")]
pub enum PolicyStoreError {
    #[display("Store operation failed")]
    StoreError,
}

impl Error for PolicyStoreError {}

#[derive(Debug, derive_more::Display)]
#[display("Policy operation failed: {_variant}")]
pub enum CreatePolicyError {
    #[display("Principal with ID `{id}` doesn't exist")]
    PrincipalNotFound { id: PrincipalId },
    #[display("Action `{id}` doesn't exist")]
    ActionNotFound { id: ActionName },
    #[display("Policy with ID `{id}` already exists")]
    PolicyAlreadyExists { id: PolicyId },
    #[display("No actions specified in policy")]
    PolicyHasNoActions,
    #[display("Invalid principal constraint")]
    InvalidPrincipalConstraint,
    #[display("Store operation failed")]
    StoreError,
}

impl Error for CreatePolicyError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not remove policy: {_variant}")]
pub enum RemovePolicyError {
    #[display("Policy with ID `{id}` does not exist")]
    PolicyNotFound { id: PolicyId },
    #[display("Store operation failed")]
    StoreError,
}

impl Error for RemovePolicyError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not update policy: {_variant}")]
pub enum UpdatePolicyError {
    #[display("Policy with ID `{id}` does not exist")]
    PolicyNotFound { id: PolicyId },
    #[display("Action `{id}` doesn't exist")]
    ActionNotFound { id: ActionName },
    #[display("No actions specified in policy")]
    PolicyHasNoActions,
    #[display("Store operation failed")]
    StoreError,
}

impl Error for UpdatePolicyError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not get policies for actor: {_variant}")]
pub enum GetPoliciesError {
    #[display("Actor with ID `{actor_id}` does not exist")]
    ActorNotFound { actor_id: ActorId },
    #[display("Invalid principal constraint")]
    InvalidPrincipalConstraint,
    #[display("Store operation failed")]
    StoreError,
}

impl Error for GetPoliciesError {}
