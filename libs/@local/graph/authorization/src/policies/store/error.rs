use core::error::Error;

use type_system::principal::{
    PrincipalId,
    actor::ActorId,
    actor_group::{ActorGroupId, TeamId, WebId},
    role::RoleName,
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
    #[display("system policies require a name")]
    MissingPolicyName,
}

impl Error for EnsureSystemPoliciesError {}

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
    #[display("Store operation failed")]
    StoreError,
}

impl Error for ContextCreationError {}

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
